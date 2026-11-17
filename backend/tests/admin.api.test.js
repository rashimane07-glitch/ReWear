// HTTP tests for the ADMIN area, phase 1 (Task 10): who may enter, the admin listing overview,
// and removing a listing. They run the real Express app over HTTP; only IBM Cloudant is replaced
// by the in-memory fake (tests/helpers/fakes.js). So they prove OUR code, not that real Cloudant
// accepts the queries (see "npm run db:verify-..." scripts for that).

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { cloudant, startServer, samples } = require('./helpers/fakes'); // must be required BEFORE ../src
const { ensureIndexes } = require('../src/config/database');

let server;
let admin;
let bob;
let carol;
const listing = {}; // key -> id
const PASSWORD = 'S3cretPassw0rd!';
const PHONE = '+919876543210';

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

const adminList = (query = '', token = admin.token) => api('GET', `/admin/listings${query ? `?${query}` : ''}`, { token });
const remove = (id, json, token = admin.token) => api('POST', `/admin/listings/${id}/remove`, { token, json });
const qs = (params) => new URLSearchParams(params).toString();
const stored = (id) => cloudant.store.get(`listing:${id}`);

async function register(name, email) {
  const res = await api('POST', '/auth/register', { json: { name, email, password: PASSWORD } });
  assert.equal(res.status, 201, 'test setup: registration should work');
  return { token: res.body.data.token, id: res.body.data.user.id };
}

async function createListing(user, key, title, extra = {}) {
  const res = await api('POST', '/listings', {
    token: user.token,
    json: { title, description: `${title}, in good shape.`, category: 'tops', size: 'm', colour: 'Blue', condition: 'good', listingType: 'sell', price: 100, ...extra },
  });
  assert.equal(res.status, 201, `test setup: creating "${title}" should work`);
  listing[key] = res.body.data.listing.id;
  return listing[key];
}

const keyOf = (id) => Object.entries(listing).find(([, value]) => value === id)?.[0] ?? `UNKNOWN(${id})`;
const keys = (res) => res.body.data.listings.map((item) => keyOf(item.id));

before(async () => {
  server = await startServer();
  assert.equal((await ensureIndexes()).ok, true, 'test setup: indexes should be created');

  admin = await register('Ada Admin', 'ada@example.com');
  cloudant.store.get(`user:${admin.id}`).role = 'admin'; // what "npm run admin:create" does
  bob = await register('Bob Owner', 'bob@example.com');
  carol = await register('Carol Owner', 'carol@example.com');
  cloudant.store.get(`user:${bob.id}`).contact = { type: 'phone', value: PHONE };

  // newest first order will be: bag, shirt, coat, scarf, jacket (the deleted dress is hidden)
  await createListing(bob, 'jacket', 'Denim jacket');
  await createListing(bob, 'scarf', 'Silk scarf');
  await createListing(bob, 'coat', 'Reserved coat');
  await createListing(carol, 'shirt', 'Completed shirt');
  await createListing(carol, 'bag', 'Canvas bag');
  await createListing(carol, 'dress', 'Owner deleted dress');
  const days = ['jacket', 'scarf', 'coat', 'shirt', 'bag', 'dress'];
  days.forEach((key, index) => {
    stored(listing[key]).createdAt = `2026-01-0${index + 1}T10:00:00.000Z`;
  });
  stored(listing.coat).status = 'reserved';
  stored(listing.shirt).status = 'completed';
  assert.equal((await api('DELETE', `/listings/${listing.dress}`, { token: carol.token })).status, 200);

  // one real image on the bag
  const form = new FormData();
  form.append('images', new Blob([samples.jpeg()], { type: 'image/jpeg' }), 'bag.jpg');
  assert.equal((await api('POST', `/listings/${listing.bag}/images`, { token: carol.token, form })).status, 200);
});

after(async () => {
  await server.close();
});

// ---------- who may enter ----------

describe('admin area: access control', () => {
  const routes = [
    ['GET', '/admin/listings'],
    ['POST', '/admin/listings/anything/remove'],
  ];

  it('needs a login (401), also with a bad token', async () => {
    for (const [method, path] of routes) {
      assert.equal((await api(method, path)).status, 401, `${method} ${path}`);
      assert.equal((await api(method, path, { token: 'not.a.token' })).status, 401, `${method} ${path}`);
    }
  });

  it('refuses a normal student with 403 and gives away nothing', async () => {
    for (const [method, path] of routes) {
      const res = await api(method, path, { token: bob.token });
      assert.equal(res.status, 403, `${method} ${path}`);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'FORBIDDEN');
      assert.equal(res.body.data, undefined);
    }
    assert.equal((await adminList('', carol.token)).status, 403);
    assert.equal((await remove(listing.scarf, {}, bob.token)).status, 403);
    assert.equal(stored(listing.scarf).isDeleted, false, 'a student must not be able to remove anything');
  });

  it('cannot be reached by putting a role in the request', async () => {
    const res = await api('GET', '/admin/listings?role=admin', { token: bob.token });
    assert.equal(res.status, 403);
    const registered = await api('POST', '/auth/register', { json: { name: 'Eve Sneaky', email: 'eve@example.com', password: PASSWORD, role: 'admin' } });
    assert.equal(registered.status, 201);
    assert.equal(registered.body.data.user.role, 'student');
    assert.equal((await adminList('', registered.body.data.token)).status, 403);
  });

  it('reads the role from the database, not from the token (promote / demote / delete take effect at once)', async () => {
    const dora = await register('Dora Later', 'dora@example.com');
    assert.equal((await adminList('', dora.token)).status, 403);
    cloudant.store.get(`user:${dora.id}`).role = 'admin'; // promoted AFTER her token was issued
    assert.equal((await adminList('', dora.token)).status, 200);
    cloudant.store.get(`user:${dora.id}`).role = 'student'; // demoted: the old token stops working here
    assert.equal((await adminList('', dora.token)).status, 403);
    cloudant.store.get(`user:${dora.id}`).role = 'admin';
    cloudant.store.delete(`user:${dora.id}`); // account gone
    const gone = await adminList('', dora.token);
    assert.equal(gone.status, 401);
    assert.equal(gone.body.error.code, 'UNAUTHORIZED');
  });

  it('answers 404 JSON for an unknown admin path (admin) and keeps the other routes as they were', async () => {
    assert.equal((await api('GET', '/admin/nothing', { token: admin.token })).status, 404);
    assert.equal((await api('GET', '/listings')).status, 200);
    assert.equal((await api('GET', '/requests/received')).status, 401);
    assert.equal((await api('GET', '/auth/me', { token: admin.token })).status, 200);
  });
});

// ---------- the overview ----------

describe('GET /api/v1/admin/listings', () => {
  it('shows every listing that is not removed, newest first (any status)', async () => {
    const res = await adminList();
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(keys(res), ['bag', 'shirt', 'coat', 'scarf', 'jacket']);
    assert.deepEqual(res.body.meta, { limit: 20, count: 5, nextCursor: null });
    assert.deepEqual(res.body.data.listings.map((item) => item.status), ['available', 'completed', 'reserved', 'available', 'available']);
  });

  it('filters by state', async () => {
    assert.deepEqual(keys(await adminList('state=available')), ['bag', 'scarf', 'jacket']);
    assert.deepEqual(keys(await adminList('state=reserved')), ['coat']);
    assert.deepEqual(keys(await adminList('state=COMPLETED')), ['shirt']);
    assert.deepEqual(keys(await adminList('state=removed')), ['dress']);
    assert.deepEqual(keys(await adminList('state=')), ['bag', 'shirt', 'coat', 'scarf', 'jacket']);
  });

  it('shows who removed a removed listing, without ids', async () => {
    const [dress] = (await adminList('state=removed')).body.data.listings;
    assert.equal(dress.status, 'removed');
    assert.deepEqual(Object.keys(dress.removal).sort(), ['note', 'removedAt', 'removedBy']);
    assert.equal(dress.removal.removedBy, 'owner');
    assert.equal(dress.removal.note, null);
    assert.ok(dress.removal.removedAt);
    const live = (await adminList('state=available')).body.data.listings[0];
    assert.equal(live.removal, null);
  });

  it('pages with a cursor (2 + 2 + 1), without repeats', async () => {
    const seen = [];
    const sizes = [];
    let cursor;
    do {
      const res = await adminList(qs({ limit: '2', ...(cursor ? { cursor } : {}) }));
      assert.equal(res.status, 200, JSON.stringify(res.body));
      sizes.push(res.body.data.listings.length);
      seen.push(...keys(res));
      cursor = res.body.meta.nextCursor;
      assert.ok(sizes.length <= 6);
    } while (cursor);
    assert.deepEqual(sizes, [2, 2, 1]);
    assert.deepEqual(seen, ['bag', 'shirt', 'coat', 'scarf', 'jacket']);
  });

  it('rejects a cursor that belongs to another query, and tampered cursors (400)', async () => {
    const first = await adminList('limit=2');
    const cursor = first.body.meta.nextCursor;
    for (const query of [qs({ state: 'available', limit: '2', cursor }), qs({ state: 'removed', limit: '2', cursor })]) {
      const res = await adminList(query);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.error.details[0].field, 'cursor');
    }
    for (const bad of ['abc', 'x'.repeat(40), `${cursor.slice(0, 12)}garbage`]) {
      const res = await adminList(qs({ limit: '2', cursor: bad }));
      assert.equal(res.status, 400, bad);
      assert.equal(res.body.error.details[0].field, 'cursor');
    }
  });

  it('rejects bad parameters with 400 and never asks Cloudant', async () => {
    const before = cloudant.finds.length;
    const cases = [
      ['state=sold', 'state'],
      ['state=available&state=reserved', 'state'],
      ['limit=0', 'limit'],
      ['limit=51', 'limit'],
      ['limit=abc', 'limit'],
      ['cursor=bad%20cursor!', 'cursor'],
      ['page=2', 'page'],
      ['ownerId=x', 'ownerId'],
      ['q[$ne]=x', 'q'],
    ];
    for (const [query, field] of cases) {
      const res = await adminList(query);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(res.body.error.details.some((detail) => detail.field === field), `${query} should report "${field}"`);
    }
    assert.equal(cloudant.finds.length, before);
  });

  it('exposes only the admin fields: never emails, contact details, hashes, storage keys or internal fields', async () => {
    const res = await adminList('state=');
    const allowed = ['category', 'colour', 'condition', 'createdAt', 'description', 'gender', 'id', 'imageCount', 'listingType', 'owner', 'price', 'removal', 'size', 'status', 'title', 'updatedAt'];
    const everything = [...res.body.data.listings, ...(await adminList('state=removed')).body.data.listings];
    for (const item of everything) {
      assert.deepEqual(Object.keys(item).sort(), allowed, item.title);
      assert.deepEqual(Object.keys(item.owner).sort(), ['id', 'name']);
    }
    const text = JSON.stringify([res.body, everything]);
    for (const secret of ['bob@example.com', 'carol@example.com', 'ada@example.com', PHONE, 'passwordHash', PASSWORD, '$2a$', '$2b$', 'imageKeys', 'ownerId', 'deletedBy', 'deletionReason', 'acceptedRequestId', '_rev', '_id']) {
      assert.ok(!text.includes(secret), `"${secret}" must not appear`);
    }
    assert.equal(res.body.data.listings.find((item) => item.id === listing.bag).imageCount, 1);
  });

  it('asks Cloudant for the right things, and loads the owners with ONE bulk request', async () => {
    cloudant.finds.length = 0;
    cloudant.allDocsCalls.length = 0;
    await adminList('state=reserved');
    await adminList('state=removed&limit=5');
    const [reserved, removed] = cloudant.finds;
    assert.deepEqual(reserved.selector, { type: 'listing', isDeleted: false, createdAt: { $exists: true }, status: 'reserved' });
    assert.deepEqual(reserved.sort, [{ type: 'desc' }, { isDeleted: 'desc' }, { createdAt: 'desc' }]);
    assert.equal(reserved.limit, 20);
    assert.deepEqual(removed.selector, { type: 'listing', isDeleted: true, createdAt: { $exists: true } });
    assert.equal(removed.limit, 5);
    assert.equal(cloudant.allDocsCalls.length, 2, 'one owner lookup per page');
    assert.ok(cloudant.indexes.some((index) => index.name === 'listing-admin-created'));
  });
});

// ---------- removing a listing ----------

describe('POST /api/v1/admin/listings/:id/remove', () => {
  it('removes an available listing, cleans the note and hides it from everyone else', async () => {
    const res = await remove(listing.scarf, { note: '  Misleading photos \n' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const removed = res.body.data.listing;
    assert.equal(removed.id, listing.scarf);
    assert.equal(removed.status, 'removed');
    assert.deepEqual({ ...removed.removal, removedAt: 'x' }, { removedAt: 'x', removedBy: 'admin', note: 'Misleading photos' });
    assert.equal(removed.owner.name, 'Bob Owner');

    const doc = stored(listing.scarf);
    assert.equal(doc.isDeleted, true);
    assert.equal(doc.deletionReason, 'admin_removed');
    assert.equal(doc.deletedBy, admin.id);
    assert.equal(doc.removalNote, 'Misleading photos');
    assert.deepEqual(doc.imageKeys, []);

    const titles = (await api('GET', '/listings')).body.data.listings.map((item) => item.title);
    assert.ok(!titles.includes('Silk scarf'));
    assert.equal((await api('GET', `/listings/${listing.scarf}`, { token: bob.token })).status, 404);
    assert.equal((await api('DELETE', `/listings/${listing.scarf}`, { token: bob.token })).status, 404);
    assert.equal((await api('PATCH', `/listings/${listing.scarf}`, { token: bob.token, json: { title: 'New title' } })).status, 404);
    assert.ok(!(await api('GET', '/listings/mine', { token: bob.token })).body.data.listings.some((item) => item.id === listing.scarf));
    assert.deepEqual(keys(await adminList('state=removed')), ['dress', 'scarf']);
  });

  it('also works without a body, and on a reserved listing (its stored status is kept)', async () => {
    const res = await remove(listing.coat);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.listing.status, 'removed');
    assert.equal(res.body.data.listing.removal.note, null);
    assert.equal(stored(listing.coat).status, 'reserved');
  });

  it('refuses a listing that is already removed (409), by the owner or an admin', async () => {
    for (const id of [listing.scarf, listing.dress]) {
      const res = await remove(id, {});
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'LISTING_ALREADY_REMOVED');
    }
    assert.equal(stored(listing.dress).deletionReason, 'owner_deleted', 'the owner removal record stays as it was');
  });

  it('answers 404 for unknown or malformed ids', async () => {
    for (const id of ['00000000-0000-0000-0000-000000000000', 'bad%20id', 'a'.repeat(80)]) {
      const res = await remove(id, {});
      assert.equal(res.status, 404, id);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    }
  });

  it('rejects a bad body (400) and removes nothing', async () => {
    for (const body of [{ note: 'x'.repeat(501) }, { note: 5 }, { reason: 'spam' }, { deletedBy: 'someone' }, ['note']]) {
      const res = await remove(listing.jacket, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal(stored(listing.jacket).isDeleted, false);
    assert.equal((await remove(listing.jacket, { note: 'x'.repeat(500) })).status, 200, '500 characters is allowed');
  });

  it('deletes the image files of the removed listing', async () => {
    const [image] = (await api('GET', `/listings/${listing.bag}`, { token: carol.token })).body.data.listing.images;
    const url = `${new URL(server.base).origin}${new URL(image.url).pathname}`;
    assert.equal((await fetch(url)).status, 200, 'the image is served before the removal');
    assert.equal((await remove(listing.bag, { note: 'Not clothing' })).status, 200);
    assert.deepEqual(stored(listing.bag).imageKeys, []);
    assert.equal((await fetch(url)).status, 404, 'the image file is gone');
  });

  it('hides the owner contact of an accepted request once its listing is removed', async () => {
    const id = await createListing(bob, 'phone', 'Hoodie for exchange check');
    const created = await api('POST', '/requests', { token: carol.token, json: { listingId: id } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const requestId = created.body.data.request.id;
    assert.equal((await api('POST', `/requests/${requestId}/accept`, { token: bob.token })).status, 200);
    const before = await api('GET', `/requests/${requestId}`, { token: carol.token });
    assert.equal(before.body.data.request.ownerContact.value, PHONE, 'the requester sees the contact while accepted');

    assert.equal((await remove(id, { note: 'Reported' })).status, 200);
    const after = await api('GET', `/requests/${requestId}`, { token: carol.token });
    assert.equal(after.status, 200);
    assert.equal(after.body.data.request.listing.status, 'removed');
    assert.equal('ownerContact' in after.body.data.request, false, 'no contact for a removed listing');
    assert.ok(!JSON.stringify(after.body).includes(PHONE));
  });

  it('never leaks internals in the answer', async () => {
    const id = await createListing(carol, 'leak', 'Leak check item');
    const res = await remove(id, { note: 'Spam' });
    const text = JSON.stringify(res.body);
    for (const secret of ['bob@example.com', 'carol@example.com', PHONE, 'passwordHash', 'imageKeys', 'ownerId', 'deletedBy', '_rev', '_id']) {
      assert.ok(!text.includes(secret), `"${secret}" must not appear`);
    }
  });
});

// ---------- failures ----------

describe('admin area: failures', () => {
  it('answers 503 DATABASE_UNAVAILABLE, without internals, when Cloudant is down', async (t) => {
    t.mock.method(console, 'error', () => {});
    cloudant.down = true;
    try {
      for (const res of [await adminList(), await remove(listing.jacket, {})]) {
        assert.equal(res.status, 503);
        assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
        assert.ok(!/ECONNREFUSED|cloudant\.test|test-api-key|rewear_test/.test(JSON.stringify(res.body)));
      }
    } finally {
      cloudant.down = false;
    }
    assert.equal((await adminList()).status, 200, 'recovers by itself');
  });

  it('answers 503 DATABASE_INDEX_MISSING when "npm run db:setup" was not run', async (t) => {
    t.mock.method(console, 'error', () => {});
    const saved = [...cloudant.indexes];
    cloudant.indexes.length = 0;
    try {
      const res = await adminList();
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, 'DATABASE_INDEX_MISSING');
      assert.ok(!/selector|_design|No index exists/i.test(JSON.stringify(res.body)));
    } finally {
      cloudant.indexes.push(...saved);
    }
    assert.equal((await adminList()).status, 200);
  });
});
