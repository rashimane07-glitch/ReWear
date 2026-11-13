// End-to-end API tests for listing creation and image upload.
// They run the REAL Express app over HTTP and the REAL local image storage (in a
// temporary folder that is deleted afterwards). Only IBM Cloudant is replaced by an
// in-memory fake (see helpers/fakes.js), so these tests do NOT prove that the real
// Cloudant integration works.

const http = require('node:http');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { cloudant, storage, startServer, samples } = require('./helpers/fakes');

const MB = 1024 * 1024;
let server;
let alice; // { token, id }
let bob;

// ---------- helpers ----------

async function api(method, path, { token, json, form } = {}) {
  const headers = {};
  let body;
  if (token) headers.authorization = `Bearer ${token}`;
  if (json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  }
  if (form) body = form;
  const response = await fetch(`${server.base}${path}`, { method, headers, body });
  return { status: response.status, body: await response.json() };
}

// A GET with the path sent EXACTLY as written (fetch would tidy up "../").
function rawGet(urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: server.port, path: urlPath }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      })
      .on('error', reject);
  });
}

async function registerUser(name, email) {
  const res = await api('POST', '/auth/register', { json: { name, email, password: 'S3cretPassw0rd!' } });
  assert.equal(res.status, 201, 'test setup: registration should work');
  return { token: res.body.data.token, id: res.body.data.user.id };
}

const validListing = (overrides = {}) => ({
  title: 'Denim jacket',
  description: 'Worn twice, no flaws at all.',
  category: 'outerwear',
  size: 'm',
  colour: 'Blue',
  condition: 'like_new',
  listingType: 'sell',
  price: 400,
  ...overrides,
});

async function createListing(user, overrides) {
  const res = await api('POST', '/listings', { token: user.token, json: validListing(overrides) });
  assert.equal(res.status, 201, 'test setup: listing creation should work');
  return res.body.data.listing.id;
}

// files: [{ data: Buffer, type: 'image/jpeg', name: 'a.jpg' }]
function imagesForm(files, fieldName = 'images') {
  const form = new FormData();
  for (const file of files) {
    form.append(fieldName, new Blob([file.data], { type: file.type }), file.name);
  }
  return form;
}
const jpegFile = (name = 'photo.jpg', size) => ({ data: samples.jpeg(size), type: 'image/jpeg', name });

const upload = (user, listingId, files, fieldName) =>
  api('POST', `/listings/${listingId}/images`, { token: user && user.token, form: imagesForm(files, fieldName) });

const listingDocs = () => [...cloudant.store.keys()].filter((key) => key.startsWith('listing:'));
const storedListing = (id) => cloudant.store.get(`listing:${id}`);

before(async () => {
  server = await startServer();
  alice = await registerUser('Alice Tester', 'alice@example.com');
  bob = await registerUser('Bob Tester', 'bob@example.com');
});

after(async () => {
  await server.close();
});

// ---------- POST /listings ----------

describe('POST /api/v1/listings', () => {
  it('rejects requests without a token (401) and creates nothing', async () => {
    const before = listingDocs().length;
    const res = await api('POST', '/listings', { json: validListing() });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
    assert.equal(listingDocs().length, before);
  });

  it('rejects an invalid token (401)', async () => {
    const res = await api('POST', '/listings', { token: 'not.a.token', json: validListing() });
    assert.equal(res.status, 401);
  });

  it('creates a listing owned by the logged-in user (201)', async () => {
    const before = listingDocs().length;
    const res = await api('POST', '/listings', { token: alice.token, json: validListing() });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    const listing = res.body.data.listing;
    assert.equal(listing.title, 'Denim jacket');
    assert.equal(listing.listingType, 'sell');
    assert.equal(listing.price, 400);
    assert.equal(listing.status, 'available');
    assert.deepEqual(listing.images, []);
    assert.deepEqual(listing.owner, { id: alice.id, name: 'Alice Tester' });

    // internal fields never leave the server
    for (const hidden of ['imageKeys', 'ownerId', 'isDeleted', 'acceptedRequestId', '_id', '_rev']) {
      assert.ok(!(hidden in listing), `"${hidden}" must not be in the response`);
    }

    // what was stored in Cloudant
    const stored = storedListing(listing.id);
    assert.equal(stored.type, 'listing');
    assert.equal(stored.ownerId, alice.id);
    assert.deepEqual(stored.imageKeys, []);
    assert.equal(stored.isDeleted, false);
    assert.equal(listingDocs().length, before + 1);
  });

  it('creates donate and exchange listings without a price (price: null)', async () => {
    for (const listingType of ['donate', 'exchange']) {
      const body = validListing({ listingType });
      delete body.price;
      const res = await api('POST', '/listings', { token: alice.token, json: body });
      assert.equal(res.status, 201);
      assert.equal(res.body.data.listing.price, null);
    }
  });

  it('reports all missing fields (400 VALIDATION_ERROR) and creates nothing', async () => {
    const before = listingDocs().length;
    const res = await api('POST', '/listings', { token: alice.token, json: {} });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    const fields = res.body.error.details.map((detail) => detail.field);
    for (const field of ['title', 'description', 'category', 'size', 'colour', 'condition', 'listingType']) {
      assert.ok(fields.includes(field), `${field} should be reported`);
    }
    assert.equal(listingDocs().length, before);
  });

  it('rejects invalid values and wrong price rules (400)', async () => {
    const bad = [
      validListing({ category: 'spaceship' }),
      validListing({ size: 'huge' }),
      validListing({ listingType: 'rent' }),
      validListing({ title: 'ab' }),
      validListing({ price: undefined }), // sell without price
      validListing({ price: '400' }),
      validListing({ price: 0 }),
      validListing({ price: 12.5 }),
      validListing({ listingType: 'donate', price: 100 }),
    ];
    for (const body of bad) {
      const res = await api('POST', '/listings', { token: alice.token, json: body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });

  it("cannot be assigned to another user's account, or given a status/images (400)", async () => {
    const before = listingDocs().length;
    for (const extra of [{ ownerId: bob.id }, { owner: bob.id }, { status: 'completed' }, { imageKeys: ['x.jpg'] }]) {
      const res = await api('POST', '/listings', { token: alice.token, json: validListing(extra) });
      assert.equal(res.status, 400, JSON.stringify(extra));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal(listingDocs().length, before, 'nothing may be created');
  });

  it('rejects malformed JSON (400)', async () => {
    const response = await fetch(`${server.base}/listings`, {
      method: 'POST',
      headers: { authorization: `Bearer ${alice.token}`, 'content-type': 'application/json' },
      body: '{ "title": ',
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
  });

  it('rejects a valid token whose account no longer exists (401)', async () => {
    const ghost = await registerUser('Ghost User', 'ghost@example.com');
    cloudant.store.delete(`user:${ghost.id}`);
    const res = await api('POST', '/listings', { token: ghost.token, json: validListing() });
    assert.equal(res.status, 401);
  });
});

// ---------- POST /listings/:id/images ----------

describe('POST /api/v1/listings/:id/images', () => {
  it('rejects requests without a token (401) and stores nothing', async () => {
    const id = await createListing(alice);
    const before = storage.count();
    const res = await upload(null, id, [jpegFile()]);
    assert.equal(res.status, 401);
    assert.equal(storage.count(), before);
  });

  it('uploads a valid image: saved on disk, key saved in Cloudant, public link returned (200)', async () => {
    const id = await createListing(alice);
    const original = samples.jpeg();
    const res = await upload(alice, id, [{ data: original, type: 'image/jpeg', name: 'photo.jpg' }]);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    const { images } = res.body.data.listing;
    assert.equal(images.length, 1);
    assert.deepEqual(Object.keys(images[0]).sort(), ['id', 'url'], 'only id and url are exposed');
    assert.match(images[0].url, new RegExp(`^http://localhost:5000/uploads/listings/${id}/[0-9a-f-]{36}\\.jpg$`));

    const keys = storedListing(id).imageKeys;
    assert.equal(keys.length, 1);
    assert.match(keys[0], new RegExp(`^listings/${id}/[0-9a-f-]{36}\\.jpg$`));
    assert.equal(images[0].id, keys[0].split('/').pop().replace('.jpg', ''));
    assert.ok(storage.exists(keys[0]), 'the file must be on disk, inside the uploads folder');
    assert.deepEqual(storage.read(keys[0]), original, 'the saved file must be identical to the upload');
    assert.ok(!JSON.stringify(storedListing(id)).includes('AAAA'), 'image bytes must never be stored in Cloudant');
  });

  it('serves the uploaded image at its public /uploads link', async () => {
    const id = await createListing(alice);
    const original = samples.png();
    const res = await upload(alice, id, [{ data: original, type: 'image/png', name: 'p.png' }]);
    const publicPath = new URL(res.body.data.listing.images[0].url).pathname; // /uploads/listings/...

    const served = await rawGet(publicPath);
    assert.equal(served.status, 200);
    assert.deepEqual(served.body, original);
    assert.equal(served.headers['content-type'], 'image/png');
    assert.equal(served.headers['x-content-type-options'], 'nosniff');
  });

  it('accepts PNG and WebP, and trusts the real bytes over the file name', async () => {
    const id = await createListing(alice);
    const res = await upload(alice, id, [
      { data: samples.png(), type: 'image/png', name: 'a.png' },
      { data: samples.webp(), type: 'image/webp', name: 'b.webp' },
      // a PNG that claims to be a JPEG is stored as what it really is
      { data: samples.png(), type: 'image/jpeg', name: 'liar.jpg' },
    ]);
    assert.equal(res.status, 200);
    const keys = storedListing(id).imageKeys;
    assert.deepEqual(keys.map((key) => key.split('.').pop()), ['png', 'webp', 'png']);
    assert.deepEqual(storage.read(keys[1]), samples.webp());
    assert.equal(new Set(keys).size, 3, 'every file name must be unique');
  });

  it('rejects files that are not JPEG/PNG/WebP, even if named .jpg (415) and stores nothing', async () => {
    const id = await createListing(alice);
    const before = storage.count();
    for (const data of [samples.text(), samples.gif(), samples.pdf()]) {
      const res = await upload(alice, id, [{ data, type: 'image/jpeg', name: 'fake.jpg' }]);
      assert.equal(res.status, 415);
      assert.equal(res.body.error.code, 'UNSUPPORTED_FILE_TYPE');
    }
    assert.equal(storage.count(), before);
    assert.deepEqual(storedListing(id).imageKeys, []);
  });

  it('checks ALL files before saving any: one bad file means nothing is saved', async () => {
    const id = await createListing(alice);
    const before = storage.count();
    const res = await upload(alice, id, [jpegFile('good.jpg'), { data: samples.text(), type: 'image/jpeg', name: 'bad.jpg' }]);
    assert.equal(res.status, 415);
    assert.equal(storage.count(), before);
    assert.deepEqual(storedListing(id).imageKeys, []);
  });

  it('rejects a file over 5 MB (413) but accepts exactly 5 MB', async () => {
    const id = await createListing(alice);
    const before = storage.count();
    const tooBig = await upload(alice, id, [jpegFile('big.jpg', 5 * MB + 1)]);
    assert.equal(tooBig.status, 413);
    assert.equal(tooBig.body.error.code, 'FILE_TOO_LARGE');
    assert.equal(storage.count(), before);

    const exactly = await upload(alice, id, [jpegFile('limit.jpg', 5 * MB)]);
    assert.equal(exactly.status, 200);
  });

  it('rejects a request with no files (400)', async () => {
    const id = await createListing(alice);
    const noFiles = new FormData();
    noFiles.append('note', 'hello');
    assert.equal((await api('POST', `/listings/${id}/images`, { token: alice.token, form: noFiles })).status, 400);
    assert.equal((await api('POST', `/listings/${id}/images`, { token: alice.token, json: {} })).status, 400);
  });

  it('rejects files sent under the wrong field name (400)', async () => {
    const id = await createListing(alice);
    const res = await upload(alice, id, [jpegFile()], 'photo');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  it('allows at most 5 images in one request (409) and saves none of them', async () => {
    const id = await createListing(alice);
    const before = storage.count();
    const res = await upload(alice, id, Array.from({ length: 6 }, (_, i) => jpegFile(`p${i}.jpg`)));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'IMAGE_LIMIT_EXCEEDED');
    assert.equal(storage.count(), before);
  });

  it('allows at most 5 images per listing in total, across several uploads', async () => {
    const id = await createListing(alice);
    const three = Array.from({ length: 3 }, (_, i) => jpegFile(`a${i}.jpg`));
    assert.equal((await upload(alice, id, three)).status, 200);

    const before = storage.count();
    const overflow = await upload(alice, id, three); // 3 + 3 = 6
    assert.equal(overflow.status, 409);
    assert.equal(overflow.body.error.code, 'IMAGE_LIMIT_EXCEEDED');
    assert.equal(storage.count(), before, 'nothing extra may be stored');

    assert.equal((await upload(alice, id, [jpegFile('b0.jpg'), jpegFile('b1.jpg')])).status, 200); // exactly 5
    assert.equal(storedListing(id).imageKeys.length, 5);
    assert.equal((await upload(alice, id, [jpegFile('c.jpg')])).status, 409);
  });

  it("does not let users add images to someone else's listing (403)", async () => {
    const id = await createListing(alice);
    const before = storage.count();
    const res = await upload(bob, id, [jpegFile()]);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
    assert.equal(storage.count(), before);
  });

  it('returns 404 for unknown, malformed or deleted listings', async () => {
    assert.equal((await upload(alice, 'does-not-exist', [jpegFile()])).status, 404);
    assert.equal((await upload(alice, '..%2F..%2Fsecret', [jpegFile()])).status, 404);

    const id = await createListing(alice);
    storedListing(id).isDeleted = true;
    assert.equal((await upload(alice, id, [jpegFile()])).status, 404);
  });

  it('locks reserved listings (409 LISTING_LOCKED)', async () => {
    const id = await createListing(alice);
    storedListing(id).status = 'reserved';
    const res = await upload(alice, id, [jpegFile()]);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'LISTING_LOCKED');
  });

  it('handles a storage failure cleanly: 503, nothing saved, earlier files removed', async () => {
    const id = await createListing(alice);
    const before = storage.count();
    storage.writes.failOnCall = storage.writes.calls + 2; // the 2nd file of this request fails ("disk full")
    const res = await upload(alice, id, [jpegFile('one.jpg'), jpegFile('two.jpg')]);
    storage.writes.failOnCall = null;

    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, 'STORAGE_UNAVAILABLE');
    assert.ok(!/ENOSPC|no space|rewear-test-uploads/.test(JSON.stringify(res.body)), 'no internals or paths leaked');
    assert.equal(storage.count(), before, 'the first file must have been cleaned up');
    assert.deepEqual(storedListing(id).imageKeys, []);
  });

  it('cleans up saved files if the listing cannot be saved (409 CONFLICT)', async () => {
    const id = await createListing(alice);
    const before = storage.count();
    // simulate somebody else changing the listing on every attempt
    cloudant.beforePut = (docId, store) => {
      const doc = store.get(docId);
      if (docId.startsWith('listing:') && doc) doc._rev = `${++cloudant.seq}-other-writer`;
    };
    const res = await upload(alice, id, [jpegFile()]);
    cloudant.beforePut = null;

    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CONFLICT');
    assert.equal(storage.count(), before, 'saved file must be removed');
    assert.deepEqual(storedListing(id).imageKeys, []);
  });

  it('retries once after a single revision conflict and still succeeds', async () => {
    const id = await createListing(alice);
    let bumped = false;
    cloudant.beforePut = (docId, store) => {
      const doc = store.get(docId);
      if (!bumped && docId.startsWith('listing:') && doc) {
        bumped = true;
        doc._rev = `${++cloudant.seq}-other-writer`;
      }
    };
    const res = await upload(alice, id, [jpegFile()]);
    cloudant.beforePut = null;
    assert.equal(res.status, 200);
    assert.equal(storedListing(id).imageKeys.length, 1);
  });
});

// ---------- the public /uploads route must be safe ----------

describe('GET /uploads (static file serving)', () => {
  it('cannot be used to read files outside the uploads folder (path traversal)', async () => {
    const attempts = [
      '/uploads/../package.json',
      '/uploads/%2e%2e/package.json',
      '/uploads/..%2fpackage.json',
      '/uploads/%2e%2e%2f%2e%2e%2fsrc%2fapp.js',
      '/uploads/listings/../../package.json',
      '/uploads/..\\package.json',
      '/uploads/%00',
    ];
    for (const attempt of attempts) {
      const res = await rawGet(attempt);
      assert.notEqual(res.status, 200, `${attempt} must not be served`);
      assert.ok(!/rewear-backend|express|require\(/.test(res.body.toString()), `${attempt} must not leak file contents`);
    }
  });

  it('has no directory listing and does not serve hidden files or unknown files', async () => {
    const id = await createListing(alice);
    await upload(alice, id, [jpegFile()]); // make sure listings/<id>/ exists
    for (const attempt of ['/uploads/', '/uploads/listings/', `/uploads/listings/${id}/`, '/uploads/listings/nope/x.jpg']) {
      const res = await rawGet(attempt);
      assert.equal(res.status, 404, `${attempt} should be 404`);
    }
    require('node:fs').writeFileSync(require('node:path').join(storage.dir, '.hidden.jpg'), samples.jpeg());
    assert.notEqual((await rawGet('/uploads/.hidden.jpg')).status, 200, 'hidden files must not be served');
  });
});

// ---------- existing features must keep working ----------

describe('existing endpoints still work', () => {
  it('health, database health, /auth/me and profile update', async () => {
    assert.equal((await api('GET', '/health')).status, 200);
    const dbHealth = await api('GET', '/health/database');
    assert.equal(dbHealth.status, 200);
    assert.equal(dbHealth.body.data.status, 'connected');

    const me = await api('GET', '/auth/me', { token: alice.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.email, 'alice@example.com');
    assert.ok(!('passwordHash' in me.body.data.user));

    const patch = await api('PATCH', '/users/me', { token: alice.token, json: { name: 'Alice Renamed' } });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.data.user.name, 'Alice Renamed');
  });
});

// ---------- GET / PATCH / DELETE (Task 7) ----------

const get = (user, id) => api('GET', `/listings/${id}`, { token: user && user.token });
const patch = (user, id, json) => api('PATCH', `/listings/${id}`, { token: user && user.token, json });
const del = (user, id) => api('DELETE', `/listings/${id}`, { token: user && user.token });

// Uploads one real image and returns { id, key } so tests can check the file on disk.
async function listingWithImage(user, overrides) {
  const id = await createListing(user, overrides);
  const res = await upload(user, id, [jpegFile()]);
  assert.equal(res.status, 200, 'test setup: image upload should work');
  return { id, key: storedListing(id).imageKeys[0] };
}

describe('GET /api/v1/listings/:id', () => {
  it('requires a token (401)', async () => {
    const id = await createListing(alice);
    const res = await get(null, id);
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('returns the listing to its owner and to other logged-in users (200)', async () => {
    const id = await createListing(alice, { title: 'Green kurta' });
    for (const user of [alice, bob]) {
      const res = await get(user, id);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.listing.id, id);
      assert.equal(res.body.data.listing.title, 'Green kurta');
      assert.deepEqual(res.body.data.listing.owner, { id: alice.id, name: 'Alice Renamed' });
    }
  });

  it('includes image links and never leaks internal or private fields', async () => {
    const { id, key } = await listingWithImage(alice);
    const res = await get(bob, id);
    const listing = res.body.data.listing;
    assert.equal(listing.images.length, 1);
    assert.equal(listing.images[0].url, `http://localhost:5000/uploads/${key}`);
    for (const hidden of ['imageKeys', 'ownerId', 'isDeleted', 'deletedAt', 'deletedBy', 'acceptedRequestId', '_id', '_rev']) {
      assert.ok(!(hidden in listing), `${hidden} must not be exposed`);
    }
    assert.ok(!JSON.stringify(res.body).includes('S3cretPassw0rd'), 'no password data');
    assert.ok(!('contact' in listing.owner) && !('email' in listing.owner), 'owner contact stays private');
  });

  it('returns 404 for unknown, malformed and deleted listings', async () => {
    assert.equal((await get(alice, 'does-not-exist')).status, 404);
    assert.equal((await get(alice, '..%2F..%2Fsecret')).status, 404);
    assert.equal((await get(alice, 'x'.repeat(100))).status, 404);

    const id = await createListing(alice);
    storedListing(id).isDeleted = true;
    const res = await get(alice, id);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('does not return other kinds of documents (e.g. a user) as listings', async () => {
    assert.equal((await get(alice, alice.id)).status, 404);
  });
});

describe('GET /api/v1/listings/mine', () => {
  it('requires a token (401)', async () => {
    assert.equal((await api('GET', '/listings/mine')).status, 401);
  });

  it('returns only the logged-in user\'s non-deleted listings, newest first', async () => {
    const carol = await registerUser('Carol Tester', 'carol@example.com');
    const dave = await registerUser('Dave Tester', 'dave@example.com');

    const first = await createListing(carol, { title: 'First item' });
    storedListing(first).createdAt = '2026-01-01T00:00:00.000Z';
    const second = await createListing(carol, { title: 'Second item' });
    storedListing(second).createdAt = '2026-02-01T00:00:00.000Z';
    const removed = await createListing(carol, { title: 'Removed item' });
    storedListing(removed).isDeleted = true;
    await createListing(dave, { title: 'Dave item' });

    const res = await api('GET', '/listings/mine', { token: carol.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data.listings.map((l) => l.title), ['Second item', 'First item']);
    assert.equal(res.body.meta.count, 2);
    assert.ok(res.body.data.listings.every((l) => l.owner.id === carol.id));
    assert.ok(res.body.data.listings.every((l) => !('imageKeys' in l) && !('ownerId' in l)));
  });

  it('returns an empty list for a user with no listings (200)', async () => {
    const erin = await registerUser('Erin Tester', 'erin@example.com');
    const res = await api('GET', '/listings/mine', { token: erin.token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.listings, []);
    assert.equal(res.body.meta.count, 0);
  });

  it('asks Cloudant for the owner\'s listings only, with an explicit limit', async () => {
    cloudant.finds.length = 0;
    await api('GET', '/listings/mine', { token: alice.token });
    assert.equal(cloudant.finds.length, 1);
    assert.deepEqual(cloudant.finds[0].selector, { type: 'listing', ownerId: alice.id, isDeleted: false });
    assert.ok(cloudant.finds[0].limit > 25);
  });

  it('is not mistaken for a listing ID, and a token for a deleted account is rejected (401)', async () => {
    const res = await api('GET', '/listings/mine', { token: alice.token });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.listings));

    const ghost = await registerUser('Ghost Tester', 'ghost-mine@example.com');
    cloudant.store.delete(`user:${ghost.id}`);
    assert.equal((await api('GET', '/listings/mine', { token: ghost.token })).status, 401);
  });
});

describe('PATCH /api/v1/listings/:id', () => {
  it('requires a token (401) and changes nothing', async () => {
    const id = await createListing(alice);
    const before = JSON.stringify(storedListing(id));
    assert.equal((await patch(null, id, { title: 'Hacked title' })).status, 401);
    assert.equal(JSON.stringify(storedListing(id)), before);
  });

  it('lets the owner change some fields and keeps the others (200)', async () => {
    const id = await createListing(alice);
    const createdAt = storedListing(id).createdAt;
    const res = await patch(alice, id, { title: '  Updated   jacket ', condition: 'good', colour: 'Navy' });
    assert.equal(res.status, 200);
    const listing = res.body.data.listing;
    assert.equal(listing.title, 'Updated jacket');
    assert.equal(listing.condition, 'good');
    assert.equal(listing.colour, 'Navy');
    assert.equal(listing.size, 'm');
    assert.equal(listing.price, 400);

    const stored = storedListing(id);
    assert.equal(stored.ownerId, alice.id);
    assert.equal(stored.createdAt, createdAt);
    assert.equal(stored.status, 'available');
    assert.equal(stored.title, 'Updated jacket');
  });

  it('does not touch the stored images', async () => {
    const { id, key } = await listingWithImage(alice);
    const res = await patch(alice, id, { title: 'Still has photo' });
    assert.equal(res.status, 200);
    assert.deepEqual(storedListing(id).imageKeys, [key]);
    assert.ok(storage.exists(key));
    assert.equal(res.body.data.listing.images.length, 1);
  });

  it('does not rewrite the document when nothing really changed', async () => {
    const id = await createListing(alice);
    const rev = storedListing(id)._rev;
    const res = await patch(alice, id, { title: 'Denim jacket', price: 400 });
    assert.equal(res.status, 200);
    assert.equal(storedListing(id)._rev, rev);
  });

  it('applies the price rules: sell needs a price, other types clear it', async () => {
    const id = await createListing(alice); // sell, 400

    // sell -> donate clears the price automatically
    let res = await patch(alice, id, { listingType: 'donate' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.listing.listingType, 'donate');
    assert.equal(res.body.data.listing.price, null);

    // a price on a non-sell listing is refused
    res = await patch(alice, id, { price: 100 });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details[0].field, 'price');

    // back to sell without a price is refused and nothing changes
    res = await patch(alice, id, { listingType: 'sell' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details[0].field, 'price');
    assert.equal(storedListing(id).listingType, 'donate');

    // back to sell with a price works
    res = await patch(alice, id, { listingType: 'sell', price: 250 });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.listing.price, 250);

    // changing only the price of a sell listing works; price null on sell is refused
    assert.equal((await patch(alice, id, { price: 300 })).body.data.listing.price, 300);
    assert.equal((await patch(alice, id, { price: null })).status, 400);
    assert.equal(storedListing(id).price, 300);
  });

  it('rejects invalid values and unknown or forbidden fields (400) without saving', async () => {
    const id = await createListing(alice);
    const before = JSON.stringify(storedListing(id));

    for (const body of [
      {},
      { title: 'ab' },
      { category: 'hats' },
      { price: -5 },
      { price: 'free' },
      { ownerId: bob.id },
      { status: 'completed' },
      { imageKeys: ['listings/x/y.jpg'] },
      { isDeleted: true },
    ]) {
      const res = await patch(alice, id, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal(JSON.stringify(storedListing(id)), before);
  });

  it('rejects malformed JSON (400)', async () => {
    const id = await createListing(alice);
    const response = await fetch(`${server.base}/listings/${id}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${alice.token}`, 'content-type': 'application/json' },
      body: '{ "title": ',
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
  });

  it("does not let users edit someone else's listing (403)", async () => {
    const id = await createListing(alice);
    const before = JSON.stringify(storedListing(id));
    const res = await patch(bob, id, { title: 'Stolen title' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
    assert.equal(JSON.stringify(storedListing(id)), before);
  });

  it('returns 404 for unknown, malformed and deleted listings', async () => {
    assert.equal((await patch(alice, 'does-not-exist', { title: 'New title' })).status, 404);
    assert.equal((await patch(alice, '..%2F..%2Fsecret', { title: 'New title' })).status, 404);
    const id = await createListing(alice);
    storedListing(id).isDeleted = true;
    assert.equal((await patch(alice, id, { title: 'New title' })).status, 404);
  });

  it('locks reserved and completed listings (409 LISTING_LOCKED)', async () => {
    for (const status of ['reserved', 'completed']) {
      const id = await createListing(alice);
      storedListing(id).status = status;
      const res = await patch(alice, id, { title: 'Too late now' });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'LISTING_LOCKED');
      assert.equal(storedListing(id).title, 'Denim jacket');
    }
  });

  it('retries after one revision conflict, and gives up with 409 CONFLICT if it keeps happening', async () => {
    const id = await createListing(alice);
    let bumped = false;
    cloudant.beforePut = (docId, store) => {
      const doc = store.get(docId);
      if (!bumped && docId.startsWith('listing:') && doc) {
        bumped = true;
        doc._rev = `${++cloudant.seq}-other-writer`;
      }
    };
    let res = await patch(alice, id, { title: 'Retry works' });
    cloudant.beforePut = null;
    assert.equal(res.status, 200);
    assert.equal(storedListing(id).title, 'Retry works');

    cloudant.beforePut = (docId, store) => {
      const doc = store.get(docId);
      if (docId.startsWith('listing:') && doc) doc._rev = `${++cloudant.seq}-other-writer`;
    };
    res = await patch(alice, id, { title: 'Never saved' });
    cloudant.beforePut = null;
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CONFLICT');
    assert.equal(storedListing(id).title, 'Retry works');
  });
});

describe('DELETE /api/v1/listings/:id', () => {
  it('requires a token (401) and deletes nothing', async () => {
    const { id, key } = await listingWithImage(alice);
    assert.equal((await del(null, id)).status, 401);
    assert.equal(storedListing(id).isDeleted, false);
    assert.ok(storage.exists(key));
  });

  it("lets the owner delete: listing hidden, record kept as deleted, image files removed (200)", async () => {
    const id = await createListing(alice);
    assert.equal((await upload(alice, id, [jpegFile('a.jpg'), jpegFile('b.jpg')])).status, 200);
    const keys = [...storedListing(id).imageKeys];
    assert.equal(keys.length, 2);
    assert.ok(keys.every((key) => storage.exists(key)));

    const res = await del(alice, id);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data, { id, deleted: true });

    const stored = storedListing(id);
    assert.equal(stored.isDeleted, true);
    assert.equal(stored.deletedBy, alice.id);
    assert.equal(stored.deletionReason, 'owner_deleted');
    assert.ok(Date.parse(stored.deletedAt) > 0);
    assert.deepEqual(stored.imageKeys, []);
    assert.ok(keys.every((key) => !storage.exists(key)), 'image files must be gone');
    assert.ok(!storage.files().some((file) => file.startsWith(`listings/${id}/`)), 'listing folder must be gone');

    // it is gone for everyone and from My Listings
    assert.equal((await get(alice, id)).status, 404);
    assert.equal((await get(bob, id)).status, 404);
    const mine = await api('GET', '/listings/mine', { token: alice.token });
    assert.ok(!mine.body.data.listings.some((l) => l.id === id));
  });

  it("only removes the deleted listing's own files", async () => {
    const keep = await listingWithImage(alice);
    const gone = await listingWithImage(alice);
    assert.equal((await del(alice, gone.id)).status, 200);
    assert.ok(storage.exists(keep.key), "another listing's image must stay");
    assert.ok(!storage.exists(gone.key));
  });

  it('deletes a listing that has no images (200)', async () => {
    const id = await createListing(alice);
    assert.equal((await del(alice, id)).status, 200);
    assert.equal(storedListing(id).isDeleted, true);
  });

  it("does not let users delete someone else's listing (403)", async () => {
    const { id, key } = await listingWithImage(alice);
    const res = await del(bob, id);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'FORBIDDEN');
    assert.equal(storedListing(id).isDeleted, false);
    assert.ok(storage.exists(key), 'the owner\'s image must be untouched');
  });

  it('returns 404 for unknown, malformed and already deleted listings', async () => {
    assert.equal((await del(alice, 'does-not-exist')).status, 404);
    assert.equal((await del(alice, '..%2F..%2Fsecret')).status, 404);
    const id = await createListing(alice);
    assert.equal((await del(alice, id)).status, 200);
    const again = await del(alice, id);
    assert.equal(again.status, 404);
    assert.equal(again.body.error.code, 'NOT_FOUND');
  });

  it('locks reserved and completed listings (409 LISTING_LOCKED) and keeps their images', async () => {
    for (const status of ['reserved', 'completed']) {
      const { id, key } = await listingWithImage(alice);
      storedListing(id).status = status;
      const res = await del(alice, id);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'LISTING_LOCKED');
      assert.equal(storedListing(id).isDeleted, false);
      assert.ok(storage.exists(key));
    }
  });

  it('keeps the images if the listing cannot be saved as deleted (409 CONFLICT)', async () => {
    const { id, key } = await listingWithImage(alice);
    cloudant.beforePut = (docId, store) => {
      const doc = store.get(docId);
      if (docId.startsWith('listing:') && doc) doc._rev = `${++cloudant.seq}-other-writer`;
    };
    const res = await del(alice, id);
    cloudant.beforePut = null;
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CONFLICT');
    assert.equal(storedListing(id).isDeleted, false);
    assert.ok(storage.exists(key), 'no file may be removed while the listing still exists');
  });

  it('still succeeds if an image file is already missing from disk', async () => {
    const { id, key } = await listingWithImage(alice);
    require('node:fs').rmSync(require('node:path').join(storage.dir, key));
    assert.equal((await del(alice, id)).status, 200);
    assert.equal(storedListing(id).isDeleted, true);
  });

  it('images cannot be added to a deleted listing afterwards (404)', async () => {
    const id = await createListing(alice);
    assert.equal((await del(alice, id)).status, 200);
    const before = storage.count();
    assert.equal((await upload(alice, id, [jpegFile()])).status, 404);
    assert.equal(storage.count(), before);
  });
});
