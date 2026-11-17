// End-to-end HTTP tests for PUBLIC BROWSING: GET /api/v1/listings
// (browse, search, filters, combined filters, sorting, pagination, privacy, errors).
//
// They run the REAL Express app, routes, validator, service and repository over HTTP.
// Only IBM Cloudant is replaced by the in-memory fake in helpers/fakes.js. So these tests
// prove OUR code builds the intended queries, handles the answers and keeps private data
// out of the response. They do NOT prove that real Cloudant accepts the queries or sorts
// the way the fake does: run "npm run db:verify-browse" against your real database for that.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { cloudant, startServer, samples } = require('./helpers/fakes'); // must be required BEFORE ../src
const { ensureIndexes } = require('../src/config/database');

let server;
let alice; // owns jacket, dress, kurta, leggings
let bob; // owns sweater, trousers, scarf, tote
const seeded = {}; // key -> { id }   (the 8 listings that SHOULD be public)
const excluded = {}; // key -> { id }   (deleted / reserved / completed: must never be public)

const PASSWORD = 'S3cretPassw0rd!';

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

// GET /listings with a ready-made query string (already URL-encoded), optionally with a token.
const browse = (query = '', { token } = {}) =>
  api('GET', `/listings${query ? `?${query}` : ''}`, { token });

const qs = (params) => new URLSearchParams(params).toString();

const storedListing = (id) => cloudant.store.get(`listing:${id}`);

async function registerUser(name, email) {
  const res = await api('POST', '/auth/register', { json: { name, email, password: PASSWORD } });
  assert.equal(res.status, 201, 'test setup: registration should work');
  return { token: res.body.data.token, id: res.body.data.user.id };
}

// Creates a listing through the real API, then fixes its createdAt so that the sort order
// does not depend on how fast the test runs.
async function seedListing(user, item) {
  const body = {
    title: item.title,
    description: item.description,
    category: item.category,
    size: item.size,
    colour: item.colour,
    condition: item.condition,
    listingType: item.listingType,
  };
  if (item.price !== null) body.price = item.price;
  const res = await api('POST', '/listings', { token: user.token, json: body });
  assert.equal(res.status, 201, `test setup: creating "${item.title}" should work`);
  const id = res.body.data.listing.id;
  storedListing(id).createdAt = item.createdAt;
  return { id };
}

// name of a seeded listing for readable failure messages
function nameOf(listing) {
  const found = Object.entries({ ...seeded, ...excluded }).find(([, value]) => value.id === listing.id);
  return found ? found[0] : `UNKNOWN(${listing.title})`;
}
const names = (res) => res.body.data.listings.map(nameOf);

// Asserts a 200 and the exact listings (by seed key) in the exact order.
function expectListings(res, ...keys) {
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.success, true);
  assert.deepEqual(names(res), keys);
}

// Follows nextCursor until it is null. Returns every response body.
async function allPages(params) {
  const pages = [];
  let cursor;
  do {
    const res = await browse(qs({ ...params, ...(cursor ? { cursor } : {}) }));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    pages.push(res.body);
    cursor = res.body.meta.nextCursor;
    assert.ok(pages.length <= 20, 'pagination must come to an end');
  } while (cursor);
  return pages;
}

// ---------- test data ----------
// 8 public listings with distinct dates (2026-01-01 ... 01-08) and varied fields.
const SEED = [
  { key: 'jacket', owner: 'alice', title: 'Denim jacket', description: 'Classic blue denim, worn twice with no flaws.', category: 'outerwear', size: 'm', colour: 'Blue', condition: 'good', listingType: 'sell', price: 400, createdAt: '2026-01-01T10:00:00.000Z' },
  { key: 'dress', owner: 'alice', title: 'Floral summer dress', description: 'Light cotton dress with a flower print.', category: 'dresses', size: 's', colour: 'Red', condition: 'like_new', listingType: 'sell', price: 250, createdAt: '2026-01-02T10:00:00.000Z' },
  { key: 'kurta', owner: 'alice', title: 'Cotton kurta set', description: 'Green festive kurta with matching pants.', category: 'ethnic_wear', size: 'l', colour: 'Green', condition: 'good', listingType: 'donate', price: null, createdAt: '2026-01-03T10:00:00.000Z' },
  { key: 'leggings', owner: 'alice', title: 'Gym leggings', description: 'Stretchy black leggings for workouts.', category: 'activewear', size: 'm', colour: 'Black', condition: 'fair', listingType: 'exchange', price: null, createdAt: '2026-01-04T10:00:00.000Z' },
  { key: 'sweater', owner: 'bob', title: 'Woollen sweater', description: 'Vintage hand-knitted sweater, very warm.', category: 'tops', size: 'xl', colour: 'Blue', condition: 'new_with_tags', listingType: 'sell', price: 600, createdAt: '2026-01-05T10:00:00.000Z' },
  { key: 'trousers', owner: 'bob', title: 'Formal trousers', description: 'Navy office trousers, hemmed to fit.', category: 'bottoms', size: 'm', colour: 'Navy', condition: 'good', listingType: 'sell', price: 350, createdAt: '2026-01-06T10:00:00.000Z' },
  { key: 'scarf', owner: 'bob', title: 'Silk scarf', description: 'Red printed scarf with a soft finish.', category: 'accessories', size: 'free_size', colour: 'Red', condition: 'like_new', listingType: 'sell', price: 150, createdAt: '2026-01-07T10:00:00.000Z' },
  { key: 'tote', owner: 'bob', title: 'Canvas tote bag', description: 'Sturdy shopping bag with blue stripes.', category: 'accessories', size: 'free_size', colour: 'Blue', condition: 'good', listingType: 'donate', price: null, createdAt: '2026-01-08T10:00:00.000Z' },
];

const NEWEST = ['tote', 'scarf', 'trousers', 'sweater', 'leggings', 'kurta', 'dress', 'jacket'];

// Listings that must NEVER appear. They get the newest dates, so a bug would show them first.
const EXCLUDED = [
  { key: 'deleted', owner: 'alice', title: 'Hidden deleted dress', description: 'This listing was deleted by its owner.', category: 'dresses', size: 's', colour: 'Pink', condition: 'good', listingType: 'sell', price: 200, createdAt: '2026-02-01T10:00:00.000Z' },
  { key: 'reserved', owner: 'bob', title: 'Reserved winter coat', description: 'Warm coat, already promised to someone.', category: 'outerwear', size: 'l', colour: 'Grey', condition: 'good', listingType: 'sell', price: 500, createdAt: '2026-02-02T10:00:00.000Z' },
  { key: 'completed', owner: 'bob', title: 'Completed dress shirt', description: 'Handed over last week, no longer here.', category: 'tops', size: 'm', colour: 'White', condition: 'like_new', listingType: 'donate', price: null, createdAt: '2026-02-03T10:00:00.000Z' },
];

before(async () => {
  server = await startServer();
  const indexes = await ensureIndexes(); // the same indexes "npm run db:setup" creates
  assert.equal(indexes.ok, true, 'test setup: indexes should be created');

  alice = await registerUser('Alice Tester', 'alice@example.com');
  bob = await registerUser('Bob Tester', 'bob@example.com');
  const owners = { alice, bob };

  for (const item of SEED) seeded[item.key] = await seedListing(owners[item.owner], item);
  for (const item of EXCLUDED) excluded[item.key] = await seedListing(owners[item.owner], item);

  // deleted through the real endpoint (soft delete), the others by changing their status
  assert.equal((await api('DELETE', `/listings/${excluded.deleted.id}`, { token: alice.token })).status, 200);
  storedListing(excluded.reserved.id).status = 'reserved';
  storedListing(excluded.completed.id).status = 'completed';

  // one real image on the jacket
  const form = new FormData();
  form.append('images', new Blob([samples.jpeg()], { type: 'image/jpeg' }), 'jacket.jpg');
  assert.equal((await api('POST', `/listings/${seeded.jacket.id}/images`, { token: alice.token, form })).status, 200);

  // private data that must never show up in the public feed
  cloudant.store.get(`user:${alice.id}`).contact = { type: 'phone', value: '+919876543210' };
});

after(async () => {
  await server.close();
});

// ---------- basics, visibility, privacy ----------

describe('GET /api/v1/listings: public browsing', () => {
  it('needs no login, and ignores a missing or bad Authorization header (200)', async () => {
    expectListings(await browse(), ...NEWEST);
    expectListings(await browse('', { token: 'not.a.token' }), ...NEWEST);
    expectListings(await browse('', { token: alice.token }), ...NEWEST);
  });

  it('answers with the standard shape and paging meta', async () => {
    const res = await browse();
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(Object.keys(res.body.meta).sort(), ['count', 'limit', 'nextCursor']);
    assert.deepEqual(res.body.meta, { limit: 12, count: 8, nextCursor: null });
  });

  it('shows only available, non-deleted listings (deleted, reserved and completed are hidden)', async () => {
    const res = await browse();
    const titles = res.body.data.listings.map((listing) => listing.title);
    for (const hidden of ['Hidden deleted dress', 'Reserved winter coat', 'Completed dress shirt']) {
      assert.ok(!titles.includes(hidden), `"${hidden}" must not be public`);
    }
    assert.ok(res.body.data.listings.every((listing) => listing.status === 'available'));

    // also hidden in every sort, filter and search
    for (const query of ['sort=oldest', 'sort=price_asc', 'sort=price_desc', 'category=dresses', 'category=tops', 'category=outerwear', 'q=dress', 'q=coat', 'listingType=donate']) {
      const found = (await browse(query)).body.data.listings;
      assert.ok(found.every((listing) => !Object.values(excluded).some((x) => x.id === listing.id)), `${query} must not show hidden listings`);
    }
    expectListings(await browse('category=dresses'), 'dress');
    expectListings(await browse('category=tops'), 'sweater');
    expectListings(await browse('category=outerwear'), 'jacket');
    expectListings(await browse('q=dress'), 'dress');
  });

  it('clients cannot ask for hidden listings by sending status or isDeleted (400)', async () => {
    for (const query of ['status=reserved', 'status=completed', 'isDeleted=true', 'ownerId=x']) {
      const res = await browse(query);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });

  it('a deleted listing is also gone from its own page (404)', async () => {
    assert.equal((await api('GET', `/listings/${excluded.deleted.id}`, { token: alice.token })).status, 404);
  });

  it('exposes only the public fields, and never private user data or internal fields', async () => {
    const res = await browse('', { token: alice.token });
    assert.equal(res.status, 200);
    const allowed = ['category', 'colour', 'condition', 'createdAt', 'description', 'gender', 'id', 'images', 'listingType', 'owner', 'price', 'size', 'status', 'title', 'updatedAt'];
    for (const listing of res.body.data.listings) {
      assert.deepEqual(Object.keys(listing).sort(), allowed, `unexpected fields on "${listing.title}"`);
      assert.deepEqual(Object.keys(listing.owner).sort(), ['id', 'name'], 'owner shows only id and name');
      for (const image of listing.images) assert.deepEqual(Object.keys(image).sort(), ['id', 'url']);
    }

    const text = JSON.stringify(res.body);
    for (const secret of [
      'alice@example.com',
      'bob@example.com',
      '+919876543210', // the user's shared contact detail
      'passwordHash',
      PASSWORD,
      '$2a$',
      '$2b$',
      'imageKeys',
      'ownerId',
      'isDeleted',
      'deletedBy',
      'deletedAt',
      'acceptedRequestId',
      '_rev',
      '_id',
    ]) {
      assert.ok(!text.includes(secret), `"${secret}" must not appear in the public feed`);
    }
  });

  it('returns image links only (never storage keys), and none for listings without photos', async () => {
    const { listings } = (await browse()).body.data;
    const jacket = listings.find((listing) => listing.id === seeded.jacket.id);
    assert.equal(jacket.images.length, 1);
    assert.match(jacket.images[0].url, new RegExp(`^http://localhost:5000/uploads/listings/${seeded.jacket.id}/[0-9a-f-]{36}\\.jpg$`));
    assert.deepEqual(listings.find((listing) => listing.id === seeded.tote.id).images, []);
  });

  it('shows the owner name for each listing', async () => {
    const { listings } = (await browse()).body.data;
    for (const listing of listings) {
      const expected = ['jacket', 'dress', 'kurta', 'leggings'].includes(nameOf(listing)) ? alice : bob;
      assert.deepEqual(listing.owner, { id: expected.id, name: expected === alice ? 'Alice Tester' : 'Bob Tester' });
    }
  });

  it('still protects the other listing routes (route order is intact)', async () => {
    assert.equal((await api('GET', '/listings/mine')).status, 401);
    assert.equal((await api('GET', `/listings/${seeded.jacket.id}`)).status, 200); // product page is public
    assert.equal((await api('POST', '/listings', { json: {} })).status, 401);
    assert.equal((await api('GET', '/listings/mine', { token: alice.token })).status, 200);
  });
});

// ---------- sorting ----------

describe('GET /api/v1/listings: sorting', () => {
  it('newest first is the default, and sort=newest says the same', async () => {
    expectListings(await browse(), ...NEWEST);
    expectListings(await browse('sort=newest'), ...NEWEST);
    expectListings(await browse('sort=NEWEST'), ...NEWEST);
  });

  it('sort=oldest reverses it', async () => {
    expectListings(await browse('sort=oldest'), ...[...NEWEST].reverse());
  });

  it('sort=price_asc: lowest price first; free listings (price null) come before every price', async () => {
    const res = await browse('sort=price_asc');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.listings.map((l) => l.price), [null, null, null, 150, 250, 350, 400, 600]);
    assert.deepEqual(names(res).slice(3), ['scarf', 'dress', 'trousers', 'jacket', 'sweater']);
  });

  it('sort=price_desc: highest price first; free listings come last', async () => {
    const res = await browse('sort=price_desc');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.listings.map((l) => l.price), [600, 400, 350, 250, 150, null, null, null]);
    assert.deepEqual(names(res).slice(0, 5), ['sweater', 'jacket', 'trousers', 'dress', 'scarf']);
  });

  it('sorts only the listings that match the filters', async () => {
    expectListings(await browse('listingType=sell&sort=price_asc'), 'scarf', 'dress', 'trousers', 'jacket', 'sweater');
    expectListings(await browse('listingType=sell&sort=price_desc'), 'sweater', 'jacket', 'trousers', 'dress', 'scarf');
    expectListings(await browse('size=m&sort=oldest'), 'jacket', 'leggings', 'trousers');
  });

  it('sort=price_asc with a "price" that is missing from an old document: modelled, not verified on Cloudant', async () => {
    // A JSON index only holds documents that HAVE every indexed field (IBM documentation).
    // The fake models that, so an old document without a price field shows up in
    // newest/oldest (with price null) but not in the price sorts. Real Cloudant is not asserted here.
    const res = await api('POST', '/listings', {
      token: alice.token,
      json: { title: 'Legacy no price item', description: 'Created before prices existed.', category: 'other', size: 'm', colour: 'Grey', condition: 'good', listingType: 'sell', price: 100 },
    });
    assert.equal(res.status, 201);
    const id = res.body.data.listing.id;
    delete storedListing(id).price;
    try {
      const newest = await browse('q=Legacy');
      assert.equal(newest.status, 200);
      assert.deepEqual(newest.body.data.listings.map((l) => [l.id, l.price]), [[id, null]], 'serialized price is null, not undefined');
      const byPrice = await browse('q=Legacy&sort=price_asc');
      assert.equal(byPrice.status, 200);
      assert.deepEqual(byPrice.body.data.listings, []);
    } finally {
      storedListing(id).isDeleted = true; // keep the shared data set unchanged for other tests
    }
  });
});

// ---------- filters ----------

describe('GET /api/v1/listings: filters', () => {
  it('filters by category (one value or several)', async () => {
    expectListings(await browse('category=outerwear'), 'jacket');
    expectListings(await browse('category=accessories'), 'tote', 'scarf');
    expectListings(await browse('category=tops,dresses'), 'sweater', 'dress');
    expectListings(await browse('category=tops&category=dresses'), 'sweater', 'dress');
    expectListings(await browse('category=OUTERWEAR'), 'jacket');
    expectListings(await browse('category=other'), ); // valid category, nothing in it
  });

  it('filters by size', async () => {
    expectListings(await browse('size=m'), 'trousers', 'leggings', 'jacket');
    expectListings(await browse('size=free_size'), 'tote', 'scarf');
    expectListings(await browse('size=s,xl'), 'sweater', 'dress');
  });

  it('filters by condition', async () => {
    expectListings(await browse('condition=good'), 'tote', 'trousers', 'kurta', 'jacket');
    expectListings(await browse('condition=new_with_tags'), 'sweater');
    expectListings(await browse('condition=fair,like_new'), 'scarf', 'leggings', 'dress');
  });

  it('filters by listing type, and "type" works as an alias', async () => {
    expectListings(await browse('listingType=donate'), 'tote', 'kurta');
    expectListings(await browse('type=exchange'), 'leggings');
    expectListings(await browse('listingType=donate,exchange'), 'tote', 'leggings', 'kurta');
    expectListings(await browse('listingType=sell'), 'scarf', 'trousers', 'sweater', 'dress', 'jacket');
  });

  it('filters by colour: exact match, any letter case, "color" works as an alias', async () => {
    expectListings(await browse('colour=Blue'), 'tote', 'sweater', 'jacket');
    expectListings(await browse('colour=blue'), 'tote', 'sweater', 'jacket');
    expectListings(await browse('colour=BLUE'), 'tote', 'sweater', 'jacket');
    expectListings(await browse('color=red'), 'scarf', 'dress');
    expectListings(await browse('colour=Bl'), ); // not a partial match
    expectListings(await browse('colour=Blue+Green'), );
  });

  it('combines filters (all of them must match)', async () => {
    expectListings(await browse('category=accessories&colour=red'), 'scarf');
    expectListings(await browse('size=m&condition=good'), 'trousers', 'jacket');
    expectListings(await browse('listingType=sell&size=m&colour=blue'), 'jacket');
    expectListings(await browse('category=accessories&listingType=donate&colour=blue&condition=good&size=free_size'), 'tote');
    expectListings(await browse('category=tops&colour=red'), ); // each filter alone has results, together none
  });

  it('treats empty filter values as "not given"', async () => {
    expectListings(await browse('category=&size=&condition=&listingType=&colour=&q=&sort=&limit=&cursor='), ...NEWEST);
  });
});

// ---------- search ----------

describe('GET /api/v1/listings: search (q)', () => {
  it('searches the title', async () => {
    expectListings(await browse('q=jacket'), 'jacket');
    expectListings(await browse('q=scarf'), 'scarf');
  });

  it('searches the description', async () => {
    expectListings(await browse('q=vintage'), 'sweater');
    expectListings(await browse('q=flaws'), 'jacket');
  });

  it('matches title or description, in any letter case, and part of a word', async () => {
    expectListings(await browse('q=cotton'), 'kurta', 'dress'); // title of one, description of the other
    expectListings(await browse('q=JACKET'), 'jacket');
    expectListings(await browse('q=jack'), 'jacket');
  });

  it('needs every word to match (words may be in the title or the description)', async () => {
    expectListings(await browse('q=woollen+vintage'), 'sweater');
    expectListings(await browse('q=denim+twice'), 'jacket');
    expectListings(await browse('q=woollen+jacket'), );
  });

  it('matches special characters literally and never as a pattern', async () => {
    expectListings(await browse('q=hand-knitted'), 'sweater');
    for (const text of ['.*', '(', ')', '[', '\\', 'a|b', '^', '$', '?', '+', '{2}', '(a+)+$']) {
      expectListings(await browse(qs({ q: text })));
    }
    expectListings(await browse(qs({ q: 'caf\u00e9' })));
  });

  it('cleans control characters and ignores blank search text', async () => {
    expectListings(await browse('q=%00%01jacket'), 'jacket');
    expectListings(await browse('q=%20%20%20'), ...NEWEST);
  });

  it('combines with filters, sorting and paging', async () => {
    expectListings(await browse('q=cotton&listingType=donate'), 'kurta');
    expectListings(await browse('q=cotton&sort=oldest'), 'dress', 'kurta');
    expectListings(await browse('q=cotton&sort=price_desc'), 'dress', 'kurta');
    expectListings(await browse('q=cotton&category=dresses&size=s&colour=red&condition=like_new&listingType=sell'), 'dress');
    expectListings(await browse('q=cotton&category=outerwear'), );
    const pages = await allPages({ q: 'cotton', limit: '1' });
    assert.deepEqual(pages.map((page) => page.data.listings.map(nameOf)), [['kurta'], ['dress'], []]);
  });

  it('returns an empty list (200), not an error, when nothing matches', async () => {
    const res = await browse('q=zzzznothing');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.listings, []);
    assert.deepEqual(res.body.meta, { limit: 12, count: 0, nextCursor: null });
  });
});

// ---------- pagination and cursors ----------

describe('GET /api/v1/listings: pagination', () => {
  it('pages through all listings with limit=3 (3 + 3 + 2), in order, without repeats', async () => {
    const pages = await allPages({ limit: '3' });
    assert.deepEqual(pages.map((page) => page.data.listings.length), [3, 3, 2]);
    assert.deepEqual(pages.flatMap((page) => page.data.listings.map(nameOf)), NEWEST);
    assert.deepEqual(pages.map((page) => page.meta.limit), [3, 3, 3]);
    assert.deepEqual(pages.map((page) => page.meta.count), [3, 3, 2]);
    assert.ok(pages[0].meta.nextCursor && pages[1].meta.nextCursor, 'full pages carry a cursor');
    assert.equal(pages[2].meta.nextCursor, null, 'the last page has no cursor');
  });

  it('handles a last page that is exactly full: one extra empty page, then no cursor', async () => {
    const pages = await allPages({ limit: '4' });
    assert.deepEqual(pages.map((page) => page.data.listings.length), [4, 4, 0]);
    assert.deepEqual(pages.flatMap((page) => page.data.listings.map(nameOf)), NEWEST);
    assert.equal(pages[2].meta.nextCursor, null);
  });

  it('returns everything on one page when limit is bigger than the result, with no cursor', async () => {
    const res = await browse('limit=50');
    assert.equal(res.body.data.listings.length, 8);
    assert.equal(res.body.meta.nextCursor, null);
    assert.equal(res.body.meta.limit, 50);
  });

  it('pages through sorted and filtered results', async () => {
    const byPrice = await allPages({ sort: 'price_desc', limit: '3' });
    assert.deepEqual(byPrice.flatMap((page) => page.data.listings.map((l) => l.price)), [600, 400, 350, 250, 150, null, null, null]);
    assert.equal(new Set(byPrice.flatMap((page) => page.data.listings.map((l) => l.id))).size, 8, 'no listing twice');

    const cheapFirst = await allPages({ sort: 'price_asc', limit: '2' });
    assert.deepEqual(cheapFirst.flatMap((page) => page.data.listings.map((l) => l.price)), [null, null, null, 150, 250, 350, 400, 600]);

    const sizeM = await allPages({ size: 'm', limit: '2' });
    assert.deepEqual(sizeM.map((page) => page.data.listings.map(nameOf)), [['trousers', 'leggings'], ['jacket']]);
    assert.equal(sizeM[1].meta.nextCursor, null);
  });

  it('accepts a different limit on a later page (the limit is not part of the query)', async () => {
    const first = await browse('limit=3');
    const second = await browse(qs({ limit: '2', cursor: first.body.meta.nextCursor }));
    assert.equal(second.status, 200);
    assert.deepEqual(names(second), ['sweater', 'leggings']);
  });

  it('rejects a cursor that was made for a different query (400, field "cursor")', async () => {
    const first = await browse(qs({ limit: '3' }));
    const cursor = first.body.meta.nextCursor;
    for (const params of [{ sort: 'oldest' }, { sort: 'price_asc' }, { category: 'tops' }, { q: 'cotton' }, { colour: 'blue' }]) {
      const res = await browse(qs({ ...params, limit: '3', cursor }));
      assert.equal(res.status, 400, JSON.stringify(params));
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.equal(res.body.error.details[0].field, 'cursor');
    }
  });

  it('rejects made-up, damaged or tampered cursors (400, never a server error)', async () => {
    const first = await browse(qs({ limit: '3' }));
    const real = first.body.meta.nextCursor;
    const bad = ['abc123', 'x'.repeat(40), `${real.slice(0, 12)}garbage`, real.slice(0, 12), real.slice(0, -3) + '!!!'];
    for (const cursor of bad) {
      const res = await browse(qs({ limit: '3', cursor }));
      assert.equal(res.status, 400, cursor);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.equal(res.body.error.details[0].field, 'cursor');
    }
  });
});

// ---------- validation ----------

describe('GET /api/v1/listings: query validation', () => {
  const longText = 'x'.repeat(101);
  const cases = [
    ['sort=cheapest', 'sort'],
    ['sort=createdAt', 'sort'],
    ['sort=newest&sort=oldest', 'sort'],
    ['limit=0', 'limit'],
    ['limit=51', 'limit'],
    ['limit=-1', 'limit'],
    ['limit=abc', 'limit'],
    ['limit=1.5', 'limit'],
    ['limit=1&limit=2', 'limit'],
    ['category=hats', 'category'],
    ['category=tops,hats', 'category'],
    ['size=huge', 'size'],
    ['gender=kids', 'gender'],
    ['condition=broken', 'condition'],
    ['listingType=rent', 'listingType'],
    ['type=rent', 'type'],
    ['type=sell&listingType=sell', 'type'],
    ['colour=red&color=red', 'color'],
    [`colour=${'x'.repeat(31)}`, 'colour'],
    [`q=${longText}`, 'q'],
    ['q=a+b+c+d+e+f', 'q'],
    ['q=a&q=b', 'q'],
    ['q[$ne]=x', 'q'],
    ['q[$regex]=.*', 'q'],
    ['page=2', 'page'],
    ['categroy=tops', 'categroy'],
    ['status=reserved', 'status'],
    ['sort[$gt]=1', 'sort'],
    [`cursor=${encodeURIComponent('bad cursor!')}`, 'cursor'],
  ];

  it('rejects bad queries with 400 VALIDATION_ERROR naming the field, and never calls Cloudant', async () => {
    const callsBefore = cloudant.finds.length;
    for (const [query, field] of cases) {
      const res = await browse(query);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(Array.isArray(res.body.error.details), query);
      assert.ok(res.body.error.details.some((detail) => detail.field === field && typeof detail.message === 'string'), `${query} should report "${field}"`);
    }
    assert.equal(cloudant.finds.length, callsBefore, 'invalid queries must not reach the database');
  });

  it('reports every problem at once', async () => {
    const res = await browse('sort=x&limit=0&category=hats&nope=1');
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.details.map((detail) => detail.field).sort(), ['category', 'limit', 'nope', 'sort']);
  });

  it('accepts the edges: limit 1 and 50, five search words, 100 characters', async () => {
    assert.equal((await browse('limit=1')).body.data.listings.length, 1);
    assert.equal((await browse('limit=50')).status, 200);
    assert.equal((await browse('q=a+b+c+d+e')).status, 200);
    assert.equal((await browse(`q=${'x'.repeat(100)}`)).status, 200);
  });

  it('answers hostile input with a plain JSON 400 and no stack traces or file paths', async () => {
    // Unknown parameter names are echoed (cut to 40 characters) so a typo is easy to find;
    // the answer is always application/json, never HTML.
    const response = await fetch(`${server.base}/listings?%3Cscript%3Ealert(1)%3C%2Fscript%3E=1&q[$ne]=x`);
    assert.equal(response.status, 400);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    const text = JSON.stringify(await response.json());
    assert.ok(!/at .*\.js|node_modules|stack|ReferenceError|TypeError/i.test(text));
  });
});

// ---------- the queries sent to Cloudant ----------

describe('GET /api/v1/listings: what is sent to Cloudant', () => {
  const reset = () => {
    cloudant.finds.length = 0;
    cloudant.allDocsCalls.length = 0;
    return cloudant.getCalls;
  };

  it('creates the two feed indexes that the sorted queries need', () => {
    const byName = Object.fromEntries(cloudant.indexes.map((index) => [index.name, index.fields]));
    assert.deepEqual(byName['listing-feed-created'], ['type', 'isDeleted', 'status', 'createdAt']);
    assert.deepEqual(byName['listing-feed-price'], ['type', 'isDeleted', 'status', 'price']);
  });

  it('always limits to available, non-deleted listings, with an explicit limit and an index-friendly sort', async () => {
    reset();
    assert.equal((await browse()).status, 200);
    assert.equal(cloudant.finds.length, 1, 'one query per page');
    const [find] = cloudant.finds;
    assert.equal(find.selector.type, 'listing');
    assert.equal(find.selector.isDeleted, false);
    assert.equal(find.selector.status, 'available');
    assert.deepEqual(find.selector.createdAt, { $exists: true });
    assert.deepEqual(find.sort, [{ type: 'desc' }, { isDeleted: 'desc' }, { status: 'desc' }, { createdAt: 'desc' }]);
    assert.equal(find.limit, 12);
    assert.equal(find.bookmark, undefined, 'the first page sends no bookmark');
  });

  it('uses the price index for price sorts and the date index for date sorts', async () => {
    reset();
    await browse('sort=price_asc&limit=5');
    await browse('sort=oldest');
    const [price, date] = cloudant.finds;
    assert.deepEqual(price.sort, [{ type: 'asc' }, { isDeleted: 'asc' }, { status: 'asc' }, { price: 'asc' }]);
    assert.deepEqual(price.selector.price, { $exists: true }, 'null prices stay included');
    assert.equal(price.limit, 5);
    assert.deepEqual(date.sort, [{ type: 'asc' }, { isDeleted: 'asc' }, { status: 'asc' }, { createdAt: 'asc' }]);
  });

  it('turns filters and search words into the expected selector, with regex characters escaped', async () => {
    reset();
    await browse(qs({ category: 'tops,dresses', size: 'm', colour: 'Blue', q: '.* a-b' }));
    const { selector } = cloudant.finds[0];
    assert.deepEqual(selector.category, { $in: ['tops', 'dresses'] });
    assert.equal(selector.size, 'm');
    assert.equal(selector.colour.$regex, '(?i)^Blue$');
    assert.equal(selector.$and.length, 2);
    assert.equal(selector.$and[0].$or[0].title.$regex, '(?i)\\.\\*');
    assert.equal(selector.$and[1].$or[1].description.$regex, '(?i)a\\-b');
  });

  it('sends the Cloudant bookmark of the cursor back, unchanged, on the next page', async () => {
    const first = await browse('limit=3');
    reset();
    await browse(qs({ limit: '3', cursor: first.body.meta.nextCursor }));
    const [find] = cloudant.finds;
    const cursor = first.body.meta.nextCursor;
    assert.ok(find.bookmark, 'the bookmark must be sent');
    assert.equal(cursor, cursor.slice(0, 12) + find.bookmark, 'cursor = 12-character query fingerprint + Cloudant bookmark');
  });

  it('loads all owners of a page with ONE bulk request, and no per-listing reads', async () => {
    const getsBefore = reset();
    const res = await browse();
    assert.equal(res.body.data.listings.length, 8);
    assert.equal(cloudant.allDocsCalls.length, 1);
    assert.deepEqual([...cloudant.allDocsCalls[0]].sort(), [`user:${alice.id}`, `user:${bob.id}`].sort(), 'each owner once');
    assert.equal(cloudant.getCalls, getsBefore, 'no single-document reads');
  });

  it('does no owner lookup at all for an empty page', async () => {
    reset();
    assert.equal((await browse('q=zzzznothing')).status, 200);
    assert.equal(cloudant.allDocsCalls.length, 0);
  });
});

// ---------- failures ----------

describe('GET /api/v1/listings: failures', () => {
  it('answers 503 DATABASE_UNAVAILABLE, without internal details, when Cloudant is down', async (t) => {
    t.mock.method(console, 'error', () => {});
    cloudant.down = true;
    try {
      const res = await browse();
      assert.equal(res.status, 503);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
      assert.ok(!/ECONNREFUSED|cloudant\.test|test-api-key|rewear_test/.test(JSON.stringify(res.body)), 'no internals leaked');
    } finally {
      cloudant.down = false;
    }
    expectListings(await browse(), ...NEWEST); // recovers by itself
  });

  it('answers 503 DATABASE_INDEX_MISSING (not a vague 500) when "npm run db:setup" was not run', async (t) => {
    t.mock.method(console, 'error', () => {});
    const saved = [...cloudant.indexes];
    cloudant.indexes.length = 0;
    try {
      for (const sort of ['newest', 'oldest', 'price_asc', 'price_desc']) {
        const res = await browse(`sort=${sort}`);
        assert.equal(res.status, 503, sort);
        assert.equal(res.body.error.code, 'DATABASE_INDEX_MISSING');
        assert.ok(!/selector|_design|No index exists/i.test(JSON.stringify(res.body)), 'no query details leaked');
      }
    } finally {
      cloudant.indexes.push(...saved);
    }
    expectListings(await browse(), ...NEWEST);
  });
});
