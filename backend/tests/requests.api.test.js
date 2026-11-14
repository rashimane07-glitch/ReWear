// End-to-end API tests for requests, the exchange lifecycle and contact privacy (Task 9).
// They run the REAL Express app over HTTP; only IBM Cloudant is replaced by an in-memory fake
// (see helpers/fakes.js), so these tests do NOT prove that the real Cloudant integration works.
// Each test file runs in its own process, so the fake database below belongs to this file only.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { cloudant, startServer } = require('./helpers/fakes');
const { ensureIndexes } = require('../src/config/database');

const PHONE = '+919876543210';
const REQUESTER_PHONE = '+919123456780';

let server;
let olivia; // owner, has a contact
let rita; // requester
let sam; // second requester
let nina; // owner WITHOUT a contact
let stranger; // not involved in anything

// ---------- helpers ----------

async function api(method, path, { token, json } = {}) {
  const headers = {};
  let body;
  if (token) headers.authorization = `Bearer ${token}`;
  if (json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  }
  const response = await fetch(`${server.base}${path}`, { method, headers, body });
  return { status: response.status, body: await response.json() };
}

async function registerUser(name, email) {
  const res = await api('POST', '/auth/register', { json: { name, email, password: 'S3cretPassw0rd!' } });
  assert.equal(res.status, 201, 'test setup: registration should work');
  return { token: res.body.data.token, id: res.body.data.user.id, email };
}

async function setContact(user, value) {
  const res = await api('PATCH', '/users/me', { token: user.token, json: { contact: value === null ? null : { type: 'phone', value } } });
  assert.equal(res.status, 200, 'test setup: saving the contact should work');
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

const createExchangeListing = (user, overrides) => createListing(user, { listingType: 'exchange', price: undefined, ...overrides });
const createDonateListing = (user, overrides) => createListing(user, { listingType: 'donate', price: undefined, ...overrides });

const send = (user, json) => api('POST', '/requests', { token: user && user.token, json });
const act = (user, id, action) => api('POST', `/requests/${id}/${action}`, { token: user && user.token });
const read = (user, id) => api('GET', `/requests/${id}`, { token: user && user.token });
const list = (user, kind, query = '') => api('GET', `/requests/${kind}${query}`, { token: user && user.token });

async function requestFor(user, listingId, extra = {}) {
  const res = await send(user, { listingId, ...extra });
  assert.equal(res.status, 201, 'test setup: sending the request should work');
  return res.body.data.request.id;
}

const storedRequest = (id) => cloudant.store.get(`request:${id}`);
const storedListing = (id) => cloudant.store.get(`listing:${id}`);
const requestDocs = () => [...cloudant.store.keys()].filter((key) => key.startsWith('request:'));
const requestDocsFor = (listingId) => requestDocs().filter((key) => key.startsWith(`request:${listingId}_`));

// True if ANY contact number (or other private detail) appears anywhere in a response.
function leaks(body) {
  const text = JSON.stringify(body);
  return /9876543210|9123456780/.test(text) || /passwordHash|\$2[aby]\$|@example\.com/.test(text);
}

const REQUEST_KEYS = ['createdAt', 'id', 'listing', 'message', 'offeredItem', 'owner', 'requester', 'respondedAt', 'role', 'status', 'updatedAt'];

before(async () => {
  server = await startServer();
  olivia = await registerUser('Olivia Owner', 'olivia@example.com');
  rita = await registerUser('Rita Requester', 'rita@example.com');
  sam = await registerUser('Sam Second', 'sam@example.com');
  nina = await registerUser('Nina NoContact', 'nina@example.com');
  stranger = await registerUser('Stan Stranger', 'stan@example.com');
  await setContact(olivia, PHONE);
  const indexes = await ensureIndexes(); // so the public browse (sorted) works in the fake
  assert.equal(indexes.ok, true, 'test setup: indexes');
});

after(async () => {
  await server.close();
});

// ---------- POST /requests ----------

describe('POST /api/v1/requests', () => {
  it('requires a valid token (401) and stores nothing', async () => {
    const listingId = await createListing(olivia);
    const before = requestDocs().length;
    for (const token of [undefined, 'not.a.token']) {
      const res = await api('POST', '/requests', { token, json: { listingId } });
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'UNAUTHORIZED');
    }
    assert.equal(requestDocs().length, before);
  });

  it('creates a pending request owned by the logged-in user (201)', async () => {
    const listingId = await createListing(olivia);
    const res = await send(rita, { listingId, message: '  Is it still available?  ' });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    const request = res.body.data.request;
    assert.equal(request.id, `${listingId}_${rita.id}`);
    assert.equal(request.status, 'pending');
    assert.equal(request.role, 'requester');
    assert.equal(request.message, 'Is it still available?');
    assert.equal(request.offeredItem, null);
    assert.deepEqual(request.listing, { id: listingId, title: 'Denim jacket', listingType: 'sell', price: 400, status: 'available' });
    assert.deepEqual(request.owner, { id: olivia.id, name: 'Olivia Owner' });
    assert.deepEqual(request.requester, { id: rita.id, name: 'Rita Requester' });
    assert.deepEqual(Object.keys(request).sort(), REQUEST_KEYS);
    assert.equal(leaks(res.body), false, 'no contact or private data in the response');

    const stored = storedRequest(request.id);
    assert.equal(stored.requesterId, rita.id, 'requester always comes from the token');
    assert.equal(stored.ownerId, olivia.id, 'owner always comes from the listing');
    assert.equal(stored.status, 'pending');
  });

  it('rejects fields a client must never choose (400) and stores nothing', async () => {
    const listingId = await createListing(olivia);
    const res = await send(rita, { listingId, requesterId: sam.id, ownerId: sam.id, status: 'accepted' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    const fields = res.body.error.details.map((detail) => detail.field).sort();
    assert.deepEqual(fields, ['ownerId', 'requesterId', 'status']);
    assert.equal(requestDocsFor(listingId).length, 0);
  });

  it('rejects a missing or malformed listing ID (400)', async () => {
    for (const listingId of [undefined, '', '   ', '../etc/passwd', 'a b', 'x'.repeat(65), 123, null, ['a']]) {
      const res = await send(rita, listingId === undefined ? {} : { listingId });
      assert.equal(res.status, 400, `listingId ${JSON.stringify(listingId)} must be rejected`);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(res.body.error.details.some((detail) => detail.field === 'listingId'));
    }
  });

  it('rejects a body that is not an object or not valid JSON (400)', async () => {
    assert.equal((await send(rita, [])).status, 400);
    assert.equal((await send(rita, 'listing')).status, 400);
    const response = await fetch(`${server.base}/requests`, {
      method: 'POST',
      headers: { authorization: `Bearer ${rita.token}`, 'content-type': 'application/json' },
      body: '{ "listingId": ',
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
  });

  it('returns 404 for a listing that does not exist', async () => {
    const res = await send(rita, { listingId: 'does-not-exist' });
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('returns 404 for a deleted listing', async () => {
    const listingId = await createListing(olivia);
    assert.equal((await api('DELETE', `/listings/${listingId}`, { token: olivia.token })).status, 200);
    const res = await send(rita, { listingId });
    assert.equal(res.status, 404);
    assert.equal(requestDocsFor(listingId).length, 0);
  });

  it('does not let users request their own listing (403)', async () => {
    const listingId = await createListing(olivia);
    const res = await send(olivia, { listingId });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CANNOT_REQUEST_OWN_LISTING');
    assert.equal(requestDocsFor(listingId).length, 0);
  });

  it('refuses reserved and completed listings (409 LISTING_UNAVAILABLE)', async () => {
    for (const status of ['reserved', 'completed']) {
      const listingId = await createListing(olivia);
      storedListing(listingId).status = status;
      const res = await send(rita, { listingId });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'LISTING_UNAVAILABLE');
      assert.equal(requestDocsFor(listingId).length, 0);
    }
  });

  it('refuses a duplicate request from the same student (409) and keeps one document', async () => {
    const listingId = await createListing(olivia);
    await requestFor(rita, listingId);
    const res = await send(rita, { listingId, message: 'Again!' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'DUPLICATE_REQUEST');
    assert.equal(requestDocsFor(listingId).length, 1);
    assert.equal(storedRequest(`${listingId}_${rita.id}`).message, null, 'the first request is not overwritten');
  });

  it('lets two different students request the same listing', async () => {
    const listingId = await createListing(olivia);
    await requestFor(rita, listingId);
    await requestFor(sam, listingId);
    assert.equal(requestDocsFor(listingId).length, 2);
  });

  it('answers 401 when the account no longer exists', async () => {
    const ghost = await registerUser('Ghost Requester', 'ghost-requester@example.com');
    const listingId = await createListing(olivia);
    cloudant.store.delete(`user:${ghost.id}`);
    const res = await send(ghost, { listingId });
    assert.equal(res.status, 401);
    assert.equal(requestDocsFor(listingId).length, 0);
  });
});

// ---------- exchange requests ----------

describe('exchange requests', () => {
  it('needs the offered item for an exchange listing (400)', async () => {
    const listingId = await createExchangeListing(olivia);
    const res = await send(rita, { listingId });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.details.some((detail) => detail.field === 'offeredItem'));
    assert.equal(requestDocsFor(listingId).length, 0);
  });

  it('stores and shows the offered item (201)', async () => {
    const listingId = await createExchangeListing(olivia);
    const res = await send(rita, { listingId, offeredItem: { title: '  Red   scarf ', description: 'Wool scarf, barely used.' } });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data.request.offeredItem, { title: 'Red scarf', description: 'Wool scarf, barely used.' });
    assert.equal(res.body.data.request.listing.listingType, 'exchange');
    assert.equal(res.body.data.request.listing.price, null);
  });

  it('does not accept an offered item for sell or donate listings (400)', async () => {
    const offeredItem = { title: 'Red scarf', description: 'Wool scarf, barely used.' };
    for (const listingId of [await createListing(olivia), await createDonateListing(olivia)]) {
      const res = await send(rita, { listingId, offeredItem });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.details.some((detail) => detail.field === 'offeredItem'));
      assert.equal(requestDocsFor(listingId).length, 0);
    }
  });

  it('allows a donate request without an offered item (201)', async () => {
    const listingId = await createDonateListing(olivia);
    const res = await send(rita, { listingId, message: 'I would love this.' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.request.offeredItem, null);
  });

  it('validates the offered item and the message (400)', async () => {
    const listingId = await createExchangeListing(olivia);
    const cases = [
      [{ listingId, offeredItem: { title: 'ab', description: 'x' } }, ['offeredItem.description', 'offeredItem.title']],
      [{ listingId, offeredItem: 'a scarf' }, ['offeredItem']],
      [{ listingId, offeredItem: ['a scarf'] }, ['offeredItem']],
      [{ listingId, offeredItem: { title: 'Red scarf', description: 'Wool scarf, barely used.', price: 5 } }, ['offeredItem']],
      [{ listingId, message: 'x'.repeat(301), offeredItem: { title: 'Red scarf', description: 'Wool scarf, barely used.' } }, ['message']],
      [{ listingId, message: 42, offeredItem: { title: 'Red scarf', description: 'Wool scarf, barely used.' } }, ['message']],
    ];
    for (const [body, expectedFields] of cases) {
      const res = await send(rita, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.deepEqual(res.body.error.details.map((detail) => detail.field).sort(), expectedFields);
    }
    assert.equal(requestDocsFor(listingId).length, 0);
  });

  it('accepting an exchange request reserves the listing like any other request', async () => {
    const listingId = await createExchangeListing(olivia);
    const requestId = await requestFor(rita, listingId, { offeredItem: { title: 'Red scarf', description: 'Wool scarf, barely used.' } });
    const res = await act(olivia, requestId, 'accept');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.request.status, 'accepted');
    assert.equal(res.body.data.request.listing.status, 'reserved');
    assert.deepEqual(res.body.data.request.offeredItem, { title: 'Red scarf', description: 'Wool scarf, barely used.' });
    assert.equal(storedListing(listingId).status, 'reserved');
  });
});

// ---------- lists ----------

describe('GET /api/v1/requests/received and /sent', () => {
  let owner;
  let lena; // requester for these tests
  let first;
  let second;
  let third;

  before(async () => {
    owner = await registerUser('Omar Lister', 'omar-lister@example.com');
    lena = await registerUser('Lena Lister', 'lena-lister@example.com');
    await setContact(owner, PHONE);
    const l1 = await createListing(owner, { title: 'List test one' });
    const l2 = await createListing(owner, { title: 'List test two' });
    const l3 = await createListing(owner, { title: 'List test three' });
    first = await requestFor(lena, l1);
    second = await requestFor(lena, l2);
    third = await requestFor(lena, l3);
    storedRequest(first).createdAt = '2026-01-01T00:00:00.000Z';
    storedRequest(second).createdAt = '2026-02-01T00:00:00.000Z';
    storedRequest(third).createdAt = '2026-03-01T00:00:00.000Z';
    assert.equal((await act(owner, second, 'decline')).status, 200);
    assert.equal((await act(owner, first, 'accept')).status, 200);
  });

  it('need a token (401)', async () => {
    assert.equal((await list(null, 'received')).status, 401);
    assert.equal((await list(null, 'sent')).status, 401);
  });

  it('show the owner the requests received, newest first, with role "owner"', async () => {
    const res = await list(owner, 'received');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.data.requests.map((request) => request.id), [third, second, first]);
    assert.equal(res.body.meta.count, 3);
    assert.ok(res.body.data.requests.every((request) => request.role === 'owner'));
    assert.ok(res.body.data.requests.every((request) => request.requester.id === lena.id));
  });

  it('show the requester the requests sent, with role "requester"', async () => {
    const res = await list(lena, 'sent');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.requests.map((request) => request.id), [third, second, first]);
    assert.ok(res.body.data.requests.every((request) => request.role === 'requester'));
    assert.ok(res.body.data.requests.every((request) => request.owner.id === owner.id));
  });

  it('keep the two lists apart and show nothing to unrelated users', async () => {
    assert.deepEqual((await list(lena, 'received')).body.data.requests, []);
    assert.deepEqual((await list(owner, 'sent')).body.data.requests, []);
    for (const kind of ['received', 'sent']) {
      const res = await list(stranger, kind);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.data.requests, []);
      assert.equal(res.body.meta.count, 0);
    }
  });

  it('can be filtered by status (one, several or repeated values)', async () => {
    const ids = async (query) => (await list(owner, 'received', query)).body.data.requests.map((request) => request.id);
    assert.deepEqual(await ids('?status=pending'), [third]);
    assert.deepEqual(await ids('?status=accepted'), [first]);
    assert.deepEqual(await ids('?status=Declined'), [second]);
    assert.deepEqual(await ids('?status=accepted,declined'), [second, first]);
    assert.deepEqual(await ids('?status=accepted&status=pending'), [third, first]);
    assert.deepEqual(await ids('?status=cancelled'), []);
    assert.deepEqual(await ids('?status='), [third, second, first]);
  });

  it('reject an unknown status or unknown parameter (400)', async () => {
    for (const query of ['?status=bogus', '?status=pending,bogus', '?page=2', '?foo=bar']) {
      const res = await list(owner, 'received', query);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });

  it('never contain a contact detail, even for an accepted request', async () => {
    for (const [user, kind] of [[owner, 'received'], [lena, 'sent']]) {
      const res = await list(user, kind);
      assert.equal(leaks(res.body), false);
      assert.ok(res.body.data.requests.every((request) => !('ownerContact' in request)));
    }
  });

  it('ask Cloudant for the user\'s requests only, with an explicit limit', async () => {
    cloudant.finds.length = 0;
    await list(owner, 'received');
    await list(lena, 'sent');
    const [received, sent] = cloudant.finds.filter((find) => find.selector.type === 'request');
    assert.deepEqual(received.selector, { type: 'request', ownerId: owner.id });
    assert.deepEqual(sent.selector, { type: 'request', requesterId: lena.id });
    assert.ok(received.limit > 25 && sent.limit > 25);
  });

  it('look up the listings and people in bulk, not one by one', async () => {
    cloudant.allDocsCalls.length = 0;
    cloudant.getCalls = 0;
    const res = await list(owner, 'received');
    assert.equal(res.body.data.requests.length, 3);
    assert.equal(cloudant.allDocsCalls.length, 2, 'one bulk read for listings, one for users');
    assert.ok(cloudant.getCalls <= 3, 'no read per request (3 requests are listed)');
  });

  it('show a removed listing with the saved title and status "removed"', async () => {
    const listingId = await createListing(owner, { title: 'Soon removed jacket' });
    const requestId = await requestFor(lena, listingId);
    assert.equal((await api('DELETE', `/listings/${listingId}`, { token: owner.token })).status, 200);
    const res = await list(lena, 'sent', '?status=pending');
    const request = res.body.data.requests.find((item) => item.id === requestId);
    assert.deepEqual(request.listing, { id: listingId, title: 'Soon removed jacket', listingType: 'sell', price: null, status: 'removed' });
  });
});

// ---------- GET /requests/:id ----------

describe('GET /api/v1/requests/:id', () => {
  it('requires a token (401)', async () => {
    const requestId = await requestFor(rita, await createListing(olivia));
    const res = await read(null, requestId);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('shows the request to its owner and to its requester (200)', async () => {
    const listingId = await createListing(olivia);
    const requestId = await requestFor(rita, listingId, { message: 'Hello' });

    const asOwner = await read(olivia, requestId);
    assert.equal(asOwner.status, 200);
    assert.equal(asOwner.body.data.request.role, 'owner');
    assert.equal(asOwner.body.data.request.message, 'Hello');
    assert.deepEqual(Object.keys(asOwner.body.data.request).sort(), REQUEST_KEYS);

    const asRequester = await read(rita, requestId);
    assert.equal(asRequester.status, 200);
    assert.equal(asRequester.body.data.request.role, 'requester');
    assert.deepEqual(Object.keys(asRequester.body.data.request).sort(), REQUEST_KEYS);
  });

  it('answers 404 (not 403) to everybody else, so nobody can tell which requests exist', async () => {
    const requestId = await requestFor(rita, await createListing(olivia));
    for (const user of [sam, stranger]) {
      const res = await read(user, requestId);
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    }
    const unknown = await read(rita, `${'a'.repeat(8)}-0000_${rita.id}`);
    assert.equal(unknown.status, 404);
    assert.deepEqual(unknown.body.error, (await read(sam, requestId)).body.error, 'same answer for "not yours" and "does not exist"');
  });

  it('answers 404 for malformed IDs', async () => {
    for (const id of ['..%2F..%2Fsecret', 'nope', 'x'.repeat(200), `${rita.id}`]) {
      assert.equal((await read(rita, id)).status, 404, id);
    }
  });

  it('does not treat "received" or "sent" as a request ID', async () => {
    assert.equal((await list(null, 'received')).status, 401);
    assert.equal((await list(rita, 'sent')).body.data.requests.every((request) => request.role === 'requester'), true);
  });
});

// ---------- accept / decline / cancel / complete ----------

describe('accepting a request', () => {
  it('needs a token (401) and changes nothing', async () => {
    const listingId = await createListing(olivia);
    const requestId = await requestFor(rita, listingId);
    assert.equal((await act(null, requestId, 'accept')).status, 401);
    assert.equal(storedRequest(requestId).status, 'pending');
    assert.equal(storedListing(listingId).status, 'available');
  });

  it('lets only the listing owner accept: the requester gets 403, strangers get 404', async () => {
    const listingId = await createListing(olivia);
    const requestId = await requestFor(rita, listingId);
    const asRequester = await act(rita, requestId, 'accept');
    assert.equal(asRequester.status, 403);
    assert.equal(asRequester.body.error.code, 'FORBIDDEN');
    assert.equal((await act(stranger, requestId, 'accept')).status, 404);
    assert.equal((await act(sam, requestId, 'accept')).status, 404);
    assert.equal(storedRequest(requestId).status, 'pending');
    assert.equal(storedListing(listingId).status, 'available');
  });

  it('accepts: the request becomes accepted and the listing is reserved for it (200)', async () => {
    const listingId = await createListing(olivia);
    const requestId = await requestFor(rita, listingId);
    const res = await act(olivia, requestId, 'accept');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.request.status, 'accepted');
    assert.equal(res.body.data.request.role, 'owner');
    assert.equal(res.body.data.request.listing.status, 'reserved');
    assert.ok(res.body.data.request.respondedAt);
    assert.equal(storedListing(listingId).status, 'reserved');
    assert.equal(storedListing(listingId).acceptedRequestId, requestId);
    assert.equal(leaks(res.body), false);
  });

  it('declines the other pending requests of the same listing', async () => {
    const listingId = await createListing(olivia);
    const winner = await requestFor(rita, listingId);
    const other = await requestFor(sam, listingId);
    assert.equal((await act(olivia, winner, 'accept')).status, 200);
    assert.equal(storedRequest(other).status, 'declined');
    assert.equal(storedRequest(other).declinedReason, 'listing_reserved');
    assert.equal((await read(sam, other)).body.data.request.status, 'declined');
    const again = await act(olivia, other, 'accept');
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'INVALID_STATUS_TRANSITION');
  });

  it('cannot accept twice (409 INVALID_STATUS_TRANSITION)', async () => {
    const requestId = await requestFor(rita, await createListing(olivia));
    assert.equal((await act(olivia, requestId, 'accept')).status, 200);
    const res = await act(olivia, requestId, 'accept');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INVALID_STATUS_TRANSITION');
  });

  it('needs a contact detail on the owner\'s profile (409 CONTACT_REQUIRED) and changes nothing', async () => {
    const listingId = await createListing(nina);
    const requestId = await requestFor(rita, listingId);
    const res = await act(nina, requestId, 'accept');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CONTACT_REQUIRED');
    assert.equal(storedRequest(requestId).status, 'pending');
    assert.equal(storedListing(listingId).status, 'available');

    await setContact(nina, '+919000000001');
    assert.equal((await act(nina, requestId, 'accept')).status, 200);
    await setContact(nina, null);
  });

  it('cannot accept once the listing was deleted (409 LISTING_UNAVAILABLE)', async () => {
    const listingId = await createListing(olivia);
    const requestId = await requestFor(rita, listingId);
    assert.equal((await api('DELETE', `/listings/${listingId}`, { token: olivia.token })).status, 200);
    const res = await act(olivia, requestId, 'accept');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'LISTING_UNAVAILABLE');
    assert.equal(storedRequest(requestId).status, 'pending');
  });

  it('takes the listing out of the public feed and locks it for editing and deleting', async () => {
    const listingId = await createListing(olivia, { title: 'Reservedflow jacket' });
    const requestId = await requestFor(rita, listingId);
    const inFeed = async () => (await api('GET', '/listings?q=reservedflow&limit=50')).body.data.listings.map((item) => item.id);

    assert.deepEqual(await inFeed(), [listingId]);
    assert.equal((await act(olivia, requestId, 'accept')).status, 200);
    assert.deepEqual(await inFeed(), []);

    const edit = await api('PATCH', `/listings/${listingId}`, { token: olivia.token, json: { title: 'Changed my mind' } });
    assert.equal(edit.status, 409);
    assert.equal(edit.body.error.code, 'LISTING_LOCKED');
    const remove = await api('DELETE', `/listings/${listingId}`, { token: olivia.token });
    assert.equal(remove.status, 409);
    assert.equal(remove.body.error.code, 'LISTING_LOCKED');
    assert.equal(storedListing(listingId).title, 'Reservedflow jacket');
    assert.equal(storedListing(listingId).isDeleted, false);

    assert.equal((await act(rita, requestId, 'cancel')).status, 200);
    assert.deepEqual(await inFeed(), [listingId], 'back in the feed after the arrangement is cancelled');
  });
});

describe('declining a request', () => {
  it('lets only the owner decline (requester 403, stranger 404, no token 401)', async () => {
    const requestId = await requestFor(rita, await createListing(olivia));
    assert.equal((await act(null, requestId, 'decline')).status, 401);
    assert.equal((await act(rita, requestId, 'decline')).status, 403);
    assert.equal((await act(stranger, requestId, 'decline')).status, 404);
    assert.equal(storedRequest(requestId).status, 'pending');
  });

  it('declines a pending request and leaves the listing available (200)', async () => {
    const listingId = await createListing(olivia);
    const requestId = await requestFor(rita, listingId);
    const res = await act(olivia, requestId, 'decline');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.request.status, 'declined');
    assert.ok(res.body.data.request.respondedAt);
    assert.equal(storedListing(listingId).status, 'available');
    assert.equal(leaks(res.body), false);
  });

  it('cannot decline twice or decline an accepted request (409)', async () => {
    const declined = await requestFor(rita, await createListing(olivia));
    assert.equal((await act(olivia, declined, 'decline')).status, 200);
    assert.equal((await act(olivia, declined, 'decline')).body.error.code, 'INVALID_STATUS_TRANSITION');

    const accepted = await requestFor(rita, await createListing(olivia));
    assert.equal((await act(olivia, accepted, 'accept')).status, 200);
    const res = await act(olivia, accepted, 'decline');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INVALID_STATUS_TRANSITION');
  });

  it('does not let the requester send the request again after the owner declined it (409)', async () => {
    const listingId = await createListing(olivia);
    const requestId = await requestFor(rita, listingId);
    assert.equal((await act(olivia, requestId, 'decline')).status, 200);
    const res = await send(rita, { listingId });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'REQUEST_DECLINED');
    assert.equal(storedRequest(requestId).status, 'declined');
  });
});

describe('cancelling a request', () => {
  it('lets the requester withdraw a pending request, and send it again later', async () => {
    const listingId = await createListing(olivia);
    const requestId = await requestFor(rita, listingId);
    assert.equal((await act(null, requestId, 'cancel')).status, 401);
    assert.equal((await act(stranger, requestId, 'cancel')).status, 404);

    const res = await act(rita, requestId, 'cancel');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.request.status, 'cancelled');
    assert.equal(storedListing(listingId).status, 'available');

    const again = await send(rita, { listingId, message: 'Second try' });
    assert.equal(again.status, 201);
    assert.equal(again.body.data.request.id, requestId, 'the same request starts over');
    assert.equal(again.body.data.request.status, 'pending');
    assert.equal(again.body.data.request.message, 'Second try');
    assert.equal(requestDocsFor(listingId).length, 1);
  });

  it('does not let the owner "cancel" a pending request: they decline it (409)', async () => {
    const requestId = await requestFor(rita, await createListing(olivia));
    const res = await act(olivia, requestId, 'cancel');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INVALID_STATUS_TRANSITION');
    assert.equal(storedRequest(requestId).status, 'pending');
  });

  it('lets the requester cancel an accepted request: the listing becomes available again', async () => {
    const listingId = await createListing(olivia);
    const requestId = await requestFor(rita, listingId);
    await act(olivia, requestId, 'accept');
    const res = await act(rita, requestId, 'cancel');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.request.status, 'cancelled');
    assert.equal(storedListing(listingId).status, 'available');
    assert.equal(storedListing(listingId).acceptedRequestId, null);
    assert.equal(storedRequest(requestId).cancelledBy, 'requester');
  });

  it('lets the owner cancel an accepted request too', async () => {
    const listingId = await createListing(olivia);
    const requestId = await requestFor(rita, listingId);
    await act(olivia, requestId, 'accept');
    const res = await act(olivia, requestId, 'cancel');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.request.role, 'owner');
    assert.equal(storedListing(listingId).status, 'available');
    assert.equal(storedRequest(requestId).cancelledBy, 'owner');
  });

  it('lets a request that was closed only because the listing got reserved be sent again', async () => {
    const listingId = await createListing(olivia);
    const winner = await requestFor(rita, listingId);
    const loser = await requestFor(sam, listingId);
    await act(olivia, winner, 'accept');
    assert.equal(storedRequest(loser).status, 'declined');
    assert.equal((await send(sam, { listingId })).status, 409, 'still reserved: not possible yet');

    await act(rita, winner, 'cancel');
    const again = await send(sam, { listingId });
    assert.equal(again.status, 201);
    assert.equal(again.body.data.request.status, 'pending');
  });

  it('cannot cancel twice, or cancel a declined or completed request (409)', async () => {
    const cancelled = await requestFor(rita, await createListing(olivia));
    assert.equal((await act(rita, cancelled, 'cancel')).status, 200);
    assert.equal((await act(rita, cancelled, 'cancel')).body.error.code, 'INVALID_STATUS_TRANSITION');

    const declined = await requestFor(rita, await createListing(olivia));
    await act(olivia, declined, 'decline');
    assert.equal((await act(rita, declined, 'cancel')).status, 409);

    const completed = await requestFor(rita, await createListing(olivia));
    await act(olivia, completed, 'accept');
    await act(olivia, completed, 'complete');
    assert.equal((await act(rita, completed, 'cancel')).status, 409);
    assert.equal((await act(olivia, completed, 'cancel')).status, 409);
  });
});

describe('completing a request', () => {
  it('lets only the owner complete an accepted request (requester 403, stranger 404)', async () => {
    const requestId = await requestFor(rita, await createListing(olivia));
    await act(olivia, requestId, 'accept');
    assert.equal((await act(null, requestId, 'complete')).status, 401);
    assert.equal((await act(rita, requestId, 'complete')).status, 403);
    assert.equal((await act(stranger, requestId, 'complete')).status, 404);
    assert.equal(storedRequest(requestId).status, 'accepted');
  });

  it('cannot complete a request that is not accepted (409)', async () => {
    const pending = await requestFor(rita, await createListing(olivia));
    const res = await act(olivia, pending, 'complete');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INVALID_STATUS_TRANSITION');
  });

  it('completes: the request and the listing are final (200)', async () => {
    const listingId = await createListing(olivia, { title: 'Completedflow jacket' });
    const requestId = await requestFor(rita, listingId);
    await act(olivia, requestId, 'accept');
    const res = await act(olivia, requestId, 'complete');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.request.status, 'completed');
    assert.equal(res.body.data.request.listing.status, 'completed');
    assert.equal(storedListing(listingId).status, 'completed');

    assert.equal((await act(olivia, requestId, 'complete')).status, 409, 'cannot complete twice');
    assert.equal((await send(sam, { listingId })).body.error.code, 'LISTING_UNAVAILABLE');
    const feed = await api('GET', '/listings?q=completedflow&limit=50');
    assert.deepEqual(feed.body.data.listings, []);
  });
});

// ---------- contact privacy ----------

describe('contact privacy', () => {
  it('shows the owner\'s contact ONLY to the requester, ONLY while the request is accepted and the listing reserved', async () => {
    const listingId = await createListing(olivia, { title: 'Privacyflow jacket' });
    const requestId = await requestFor(rita, listingId);

    // pending: nobody sees a contact
    for (const user of [olivia, rita]) {
      const res = await read(user, requestId);
      assert.equal('ownerContact' in res.body.data.request, false);
      assert.equal(leaks(res.body), false);
    }

    // accepted: the requester (and only the requester) sees the owner's contact
    const accepted = await act(olivia, requestId, 'accept');
    assert.equal(leaks(accepted.body), false, 'the accept response itself carries no contact');

    const asRequester = await read(rita, requestId);
    assert.deepEqual(asRequester.body.data.request.ownerContact, { type: 'phone', value: PHONE });
    assert.deepEqual(Object.keys(asRequester.body.data.request).sort(), [...REQUEST_KEYS, 'ownerContact'].sort());

    const asOwner = await read(olivia, requestId);
    assert.equal('ownerContact' in asOwner.body.data.request, false);
    assert.equal(leaks(asOwner.body), false);

    for (const user of [sam, stranger]) {
      const res = await read(user, requestId);
      assert.equal(res.status, 404);
      assert.equal(leaks(res.body), false);
    }
    assert.equal(leaks((await read(null, requestId)).body), false);

    // if the owner removes the contact later, the field is null instead of a stale number
    await setContact(olivia, null);
    assert.equal((await read(rita, requestId)).body.data.request.ownerContact, null);
    await setContact(olivia, PHONE);
    assert.equal((await read(rita, requestId)).body.data.request.ownerContact.value, PHONE);

    // completed: the arrangement is over, the contact disappears again
    await act(olivia, requestId, 'complete');
    const afterwards = await read(rita, requestId);
    assert.equal('ownerContact' in afterwards.body.data.request, false);
    assert.equal(leaks(afterwards.body), false);
  });

  it('hides the contact again once an accepted request is cancelled', async () => {
    const requestId = await requestFor(rita, await createListing(olivia));
    await act(olivia, requestId, 'accept');
    assert.equal((await read(rita, requestId)).body.data.request.ownerContact.value, PHONE);
    await act(rita, requestId, 'cancel');
    const res = await read(rita, requestId);
    assert.equal('ownerContact' in res.body.data.request, false);
    assert.equal(leaks(res.body), false);
  });

  it('never shows a contact on declined requests, to the owner or to the requester', async () => {
    const requestId = await requestFor(rita, await createListing(olivia));
    await act(olivia, requestId, 'decline');
    for (const user of [olivia, rita]) {
      assert.equal(leaks((await read(user, requestId)).body), false);
    }
  });

  it('never shows the requester\'s contact to the owner', async () => {
    await setContact(rita, REQUESTER_PHONE);
    const requestId = await requestFor(rita, await createListing(olivia));
    const responses = [await read(olivia, requestId), await list(olivia, 'received'), await act(olivia, requestId, 'accept'), await read(olivia, requestId)];
    for (const res of responses) {
      assert.equal(res.status, 200);
      assert.equal(JSON.stringify(res.body).includes('9123456780'), false);
    }
    await setContact(rita, null);
  });

  it('keeps the contact out of the lists, public browsing and listing details', async () => {
    const listingId = await createListing(olivia, { title: 'Publicflow jacket' });
    const requestId = await requestFor(rita, listingId);
    await act(olivia, requestId, 'accept');

    const responses = [
      await list(rita, 'sent'),
      await list(olivia, 'received'),
      await api('GET', '/listings?q=publicflow&limit=50'), // public, no token
      await api('GET', '/listings?limit=50'),
      await api('GET', `/listings/${listingId}`, { token: rita.token }),
      await api('GET', `/listings/${listingId}`, { token: stranger.token }),
      await api('GET', '/listings/mine', { token: olivia.token }),
    ];
    for (const res of responses) {
      assert.equal(res.status, 200);
      assert.equal(leaks(res.body), false);
    }
    assert.equal(responses[2].body.data.listings.length, 0, 'a reserved listing is not in the public feed');
  });

  it('keeps the contact out of every error response', async () => {
    const requestId = await requestFor(rita, await createListing(olivia));
    await act(olivia, requestId, 'accept');
    const failures = [
      await read(stranger, requestId),
      await read(null, requestId),
      await act(rita, requestId, 'accept'),
      await act(olivia, requestId, 'accept'),
      await act(stranger, requestId, 'cancel'),
      await act(rita, requestId, 'decline'),
      await act(rita, requestId, 'complete'),
      await send(rita, { listingId: requestId.split('_')[0] }),
    ];
    for (const res of failures) {
      assert.equal(res.body.success, false);
      assert.equal(leaks(res.body), false);
    }
  });

  it('takes the requester and owner from the token, never from the request body', async () => {
    const listingId = await createListing(olivia);
    const res = await send(rita, { listingId, requesterId: olivia.id });
    assert.equal(res.status, 400);
    const ok = await send(rita, { listingId });
    assert.equal(storedRequest(ok.body.data.request.id).requesterId, rita.id);
    assert.equal(storedRequest(ok.body.data.request.id).ownerId, olivia.id);
  });
});

// ---------- a listing stranded as "reserved" for a request that is still pending (review finding M1) ----------
//
// Accepting reserves the listing first and then marks the request accepted. If the second step
// (and the undo) fail, the listing is left "reserved" for a request that is still "pending".
// The tests build that state by hand (the fake lets them edit stored documents) and check that
// declining or withdrawing the pending request puts the listing back, but ONLY when the listing
// is reserved for exactly THAT request, and that a failed recovery is reported, not hidden.

describe('recovering a listing reserved for a request that is still pending', () => {
  const strand = (listingId, requestId, status = 'reserved') => {
    storedListing(listingId).status = status;
    storedListing(listingId).acceptedRequestId = requestId;
  };
  const inFeed = async (word, listingId) =>
    (await api('GET', `/listings?q=${word}&limit=50`)).body.data.listings.some((item) => item.id === listingId);

  // R1 is properly accepted (listing reserved for R1). R2 is put back to "pending", as if declining
  // the other requests had failed.
  async function acceptedWithStalePending(title) {
    const listingId = await createListing(olivia, { title });
    const winner = await requestFor(rita, listingId);
    const stale = await requestFor(sam, listingId);
    assert.equal((await act(olivia, winner, 'accept')).status, 200);
    Object.assign(storedRequest(stale), { status: 'pending', respondedAt: null, declinedReason: null });
    return { listingId, winner, stale };
  }

  function assertStillReservedFor(listingId, winner) {
    assert.equal(storedListing(listingId).status, 'reserved');
    assert.equal(storedListing(listingId).acceptedRequestId, winner);
    assert.equal(storedRequest(winner).status, 'accepted');
  }

  it('declining the pending request puts its stranded listing back on the market (200)', async () => {
    const listingId = await createListing(olivia, { title: 'Recoverdecline jacket' });
    const requestId = await requestFor(rita, listingId);
    strand(listingId, requestId);
    assert.equal(await inFeed('recoverdecline', listingId), false, 'stranded: not in the public feed');

    const res = await act(olivia, requestId, 'decline');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.request.status, 'declined');
    assert.equal(res.body.data.request.listing.status, 'available');
    assert.equal(storedRequest(requestId).status, 'declined');
    assert.equal(storedListing(listingId).status, 'available');
    assert.equal(storedListing(listingId).acceptedRequestId, null);
    assert.equal(await inFeed('recoverdecline', listingId), true, 'back in the public feed');
  });

  it('withdrawing the pending request puts its stranded listing back on the market (200)', async () => {
    const listingId = await createListing(olivia, { title: 'Recovercancel jacket' });
    const requestId = await requestFor(rita, listingId);
    strand(listingId, requestId);

    const res = await act(rita, requestId, 'cancel');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.request.status, 'cancelled');
    assert.equal(res.body.data.request.listing.status, 'available');
    assert.equal(storedRequest(requestId).cancelledBy, 'requester');
    assert.equal(storedListing(listingId).status, 'available');
    assert.equal(storedListing(listingId).acceptedRequestId, null);
    assert.equal(await inFeed('recovercancel', listingId), true, 'back in the public feed');
  });

  it('declining another pending request never reopens a listing reserved for an accepted request', async () => {
    const { listingId, winner, stale } = await acceptedWithStalePending('Otherdecline jacket');
    const res = await act(olivia, stale, 'decline');
    assert.equal(res.status, 200);
    assert.equal(storedRequest(stale).status, 'declined');
    assertStillReservedFor(listingId, winner);
    // the accepted requester still sees the owner's contact: nothing about their arrangement changed
    assert.equal((await read(rita, winner)).body.data.request.ownerContact.value, PHONE);
  });

  it('withdrawing another pending request never reopens a listing reserved for an accepted request', async () => {
    const { listingId, winner, stale } = await acceptedWithStalePending('Othercancel jacket');
    const res = await act(sam, stale, 'cancel');
    assert.equal(res.status, 200);
    assert.equal(storedRequest(stale).status, 'cancelled');
    assertStillReservedFor(listingId, winner);
    assert.equal((await read(rita, winner)).body.data.request.ownerContact.value, PHONE);
  });

  it('only the request the listing is reserved for can recover it, not a second pending request', async () => {
    const listingId = await createListing(olivia, { title: 'Exactmatch jacket' });
    const first = await requestFor(rita, listingId);
    const second = await requestFor(sam, listingId);
    strand(listingId, first);

    assert.equal((await act(olivia, second, 'decline')).status, 200);
    assert.equal(storedListing(listingId).status, 'reserved', 'the other request must not reopen it');
    assert.equal(storedListing(listingId).acceptedRequestId, first);

    assert.equal((await act(olivia, first, 'decline')).status, 200);
    assert.equal(storedListing(listingId).status, 'available', 'the request it is reserved for does');
    assert.equal(storedListing(listingId).acceptedRequestId, null);
  });

  it('never reopens a completed listing, whichever pending request is declined or withdrawn', async () => {
    for (const [actor, action] of [[olivia, 'decline'], [rita, 'cancel']]) {
      const listingId = await createListing(olivia, { title: `Completedkeep${action} jacket` });
      const requestId = await requestFor(rita, listingId);
      strand(listingId, requestId, 'completed');

      assert.equal((await act(actor, requestId, action)).status, 200);
      assert.equal(storedListing(listingId).status, 'completed', `${action} must not reopen a completed listing`);
      assert.equal(storedListing(listingId).acceptedRequestId, requestId);
    }
  });

  it('reports a failed recovery (409 CONFLICT), keeps the request pending, and works when tried again', async () => {
    for (const [actor, action, finalStatus] of [[olivia, 'decline', 'declined'], [rita, 'cancel', 'cancelled']]) {
      const listingId = await createListing(olivia, { title: `Recoverfail${action} jacket` });
      const requestId = await requestFor(rita, listingId);
      strand(listingId, requestId);

      // somebody else keeps changing the listing, so putting it back keeps failing
      cloudant.beforePut = (docId, store) => {
        const doc = store.get(docId);
        if (docId.startsWith('listing:') && doc) doc._rev = `${++cloudant.seq}-other-writer`;
      };
      let failed;
      try {
        failed = await act(actor, requestId, action);
      } finally {
        cloudant.beforePut = null;
      }
      assert.equal(failed.status, 409, `${action}: the failure must be reported`);
      assert.equal(failed.body.error.code, 'CONFLICT');
      assert.equal(storedRequest(requestId).status, 'pending', `${action}: the request must not be closed while the listing is stuck`);
      assert.equal(storedListing(listingId).status, 'reserved');

      const retry = await act(actor, requestId, action);
      assert.equal(retry.status, 200, `${action}: works when tried again`);
      assert.equal(retry.body.data.request.status, finalStatus);
      assert.equal(storedListing(listingId).status, 'available');
      assert.equal(storedListing(listingId).acceptedRequestId, null);
    }
  });
});

// ---------- declining the competing requests when one request is accepted (review finding M2) ----------
//
// Accepting a request declines the other pending requests of that listing. These tests check that
// each competing request is handled on its own, that a revision conflict is retried (not counted
// as a success), that a request that changed meanwhile is never overwritten, that one failure does
// not stop the others, and that a request saved at the very moment the listing is reserved is
// declined by the sender's own request instead of staying pending.

describe('declining the competing requests when one request is accepted', () => {
  let vera; // a fifth student, used only here

  before(async () => {
    vera = await registerUser('Vera Extra', 'vera-extra@example.com');
  });

  const snapshot = (requestId) => JSON.stringify(storedRequest(requestId));
  // Simulates somebody else writing the document at the same moment (its revision changes).
  const bumpRevision = (docId, store) => {
    store.get(docId)._rev = `${++cloudant.seq}-other-writer`;
  };
  function assertWinnerKept(listingId, winner) {
    assert.equal(storedRequest(winner).status, 'accepted');
    assert.equal(storedListing(listingId).status, 'reserved');
    assert.equal(storedListing(listingId).acceptedRequestId, winner);
  }
  function assertDeclinedForReservation(requestId) {
    assert.equal(storedRequest(requestId).status, 'declined');
    assert.equal(storedRequest(requestId).declinedReason, 'listing_reserved');
    assert.ok(storedRequest(requestId).respondedAt);
  }

  it('declines every competing pending request and leaves withdrawn or already answered ones untouched', async () => {
    const listingId = await createListing(olivia, { title: 'Sweepall jacket' });
    const winner = await requestFor(rita, listingId);
    const pendingOne = await requestFor(sam, listingId);
    const pendingTwo = await requestFor(stranger, listingId);
    const withdrawn = await requestFor(nina, listingId);
    const ownerDeclined = await requestFor(vera, listingId);
    assert.equal((await act(nina, withdrawn, 'cancel')).status, 200);
    assert.equal((await act(olivia, ownerDeclined, 'decline')).status, 200);
    const withdrawnBefore = snapshot(withdrawn);
    const ownerDeclinedBefore = snapshot(ownerDeclined);

    const res = await act(olivia, winner, 'accept');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.request.status, 'accepted');

    assertDeclinedForReservation(pendingOne);
    assertDeclinedForReservation(pendingTwo);
    assert.equal(snapshot(withdrawn), withdrawnBefore, 'a withdrawn request is not modified');
    assert.equal(storedRequest(withdrawn).status, 'cancelled');
    assert.equal(snapshot(ownerDeclined), ownerDeclinedBefore, 'a request the owner declined is not modified');
    assert.equal(storedRequest(ownerDeclined).declinedReason, null, 'it keeps its own reason (it may not be re-sent)');
    assertWinnerKept(listingId, winner);
  });

  it('retries after a revision conflict instead of treating it as declined', async () => {
    const listingId = await createListing(olivia, { title: 'Sweepconflict jacket' });
    const winner = await requestFor(rita, listingId);
    const conflicted = await requestFor(sam, listingId);
    const other = await requestFor(stranger, listingId);

    let bumped = false;
    cloudant.beforePut = (docId, store) => {
      if (!bumped && docId === `request:${conflicted}`) {
        bumped = true;
        bumpRevision(docId, store);
      }
    };
    let res;
    try {
      res = await act(olivia, winner, 'accept');
    } finally {
      cloudant.beforePut = null;
    }
    assert.equal(res.status, 200);
    assert.equal(bumped, true, 'the conflict really happened');
    assertDeclinedForReservation(conflicted);
    assertDeclinedForReservation(other);
    assertWinnerKept(listingId, winner);
  });

  it('does not overwrite a request that was withdrawn at the same moment', async () => {
    const listingId = await createListing(olivia, { title: 'Sweepwithdrawn jacket' });
    const winner = await requestFor(rita, listingId);
    const withdrawnMeanwhile = await requestFor(sam, listingId);
    const other = await requestFor(stranger, listingId);

    let changed = false;
    cloudant.beforePut = (docId, store) => {
      if (!changed && docId === `request:${withdrawnMeanwhile}`) {
        changed = true;
        Object.assign(store.get(docId), { status: 'cancelled', cancelledBy: 'requester' });
        bumpRevision(docId, store);
      }
    };
    let res;
    try {
      res = await act(olivia, winner, 'accept');
    } finally {
      cloudant.beforePut = null;
    }
    assert.equal(res.status, 200);
    assert.equal(changed, true, 'the withdrawal really happened during the accept');
    assert.equal(storedRequest(withdrawnMeanwhile).status, 'cancelled', 'the withdrawal is kept');
    assert.equal(storedRequest(withdrawnMeanwhile).declinedReason, null);
    assertDeclinedForReservation(other);
    assertWinnerKept(listingId, winner);
  });

  it('keeps going after a request that keeps conflicting, and does not claim it was declined', async () => {
    const listingId = await createListing(olivia, { title: 'Sweepstuck jacket' });
    const winner = await requestFor(rita, listingId);
    const stuck = await requestFor(sam, listingId);
    const fine = await requestFor(stranger, listingId);

    cloudant.beforePut = (docId, store) => {
      if (docId === `request:${stuck}`) bumpRevision(docId, store); // every save of this one conflicts
    };
    let res;
    try {
      res = await act(olivia, winner, 'accept');
    } finally {
      cloudant.beforePut = null;
    }
    assert.equal(res.status, 200, 'the acceptance itself is not undone');
    assert.equal(storedRequest(stuck).status, 'pending', 'it could not be declined, and is still pending');
    assertDeclinedForReservation(fine);
    assertWinnerKept(listingId, winner);

    // the leftover pending request can still be declined normally, without touching the reservation
    assert.equal((await act(olivia, stuck, 'decline')).status, 200);
    assert.equal(storedRequest(stuck).status, 'declined');
    assertWinnerKept(listingId, winner);
    assert.equal((await read(rita, winner)).body.data.request.ownerContact.value, PHONE);
  });

  it('keeps going after a request whose save fails with a database error', async () => {
    const listingId = await createListing(olivia, { title: 'Sweepbroken jacket' });
    const winner = await requestFor(rita, listingId);
    const broken = await requestFor(sam, listingId);
    const healthy = await requestFor(stranger, listingId);

    cloudant.beforePut = (docId) => {
      if (docId === `request:${broken}`) throw Object.assign(new Error('simulated database failure'), { status: 500 });
    };
    let res;
    try {
      res = await act(olivia, winner, 'accept');
    } finally {
      cloudant.beforePut = null;
    }
    assert.equal(res.status, 200, 'the acceptance itself is not undone');
    assert.equal(storedRequest(broken).status, 'pending', 'it could not be declined, and is still pending');
    assertDeclinedForReservation(healthy);
    assertWinnerKept(listingId, winner);
  });

  it('declines a request that was saved while the listing was being reserved, and tells the sender (409)', async () => {
    const listingId = await createListing(olivia, { title: 'Racecreate jacket' });
    const takenBy = `${listingId}_${rita.id}`;
    const lateId = `${listingId}_${sam.id}`;

    // Somebody else's request gets the listing at the moment sam's request is being saved.
    let taken = false;
    cloudant.beforePut = (docId, store) => {
      if (!taken && docId === `request:${lateId}`) {
        taken = true;
        Object.assign(store.get(`listing:${listingId}`), { status: 'reserved', acceptedRequestId: takenBy });
      }
    };
    let res;
    try {
      res = await send(sam, { listingId });
    } finally {
      cloudant.beforePut = null;
    }
    assert.equal(taken, true, 'the reservation really happened during the save');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'LISTING_UNAVAILABLE');
    assertDeclinedForReservation(lateId);
    assert.equal(storedListing(listingId).status, 'reserved', 'the listing itself is not touched');
    assert.equal(storedListing(listingId).acceptedRequestId, takenBy);

    // once the listing is available again, the same student can try again
    Object.assign(storedListing(listingId), { status: 'available', acceptedRequestId: null });
    const again = await send(sam, { listingId });
    assert.equal(again.status, 201);
    assert.equal(again.body.data.request.status, 'pending');
  });

  it('does not decline or reject a request whose own listing reservation happened while it was being saved', async () => {
    const listingId = await createListing(olivia, { title: 'Raceown jacket' });
    const ownId = `${listingId}_${stranger.id}`;

    // The listing is reserved for THIS very request at the moment it is saved (e.g. the owner accepted it at once).
    let reserved = false;
    cloudant.beforePut = (docId, store) => {
      if (!reserved && docId === `request:${ownId}`) {
        reserved = true;
        Object.assign(store.get(`listing:${listingId}`), { status: 'reserved', acceptedRequestId: ownId });
      }
    };
    let res;
    try {
      res = await send(stranger, { listingId });
    } finally {
      cloudant.beforePut = null;
    }
    assert.equal(reserved, true, 'the reservation really happened during the save');
    assert.equal(res.status, 201, 'no false "listing unavailable" for the request the listing was reserved for');
    assert.equal(storedRequest(ownId).status, 'pending', 'its own request is not declined');
    assert.equal(storedRequest(ownId).declinedReason, null);
    assert.equal(storedListing(listingId).status, 'reserved');
    assert.equal(storedListing(listingId).acceptedRequestId, ownId);
  });
});

// ---------- failures, concurrency, database ----------

describe('failures and the database', () => {
  it('answers 409 CONFLICT and changes nothing if the listing keeps changing during accept', async () => {
    const listingId = await createListing(olivia);
    const requestId = await requestFor(rita, listingId);
    cloudant.beforePut = (docId, store) => {
      const doc = store.get(docId);
      if (docId.startsWith('listing:') && doc) doc._rev = `${++cloudant.seq}-other-writer`;
    };
    let res;
    try {
      res = await act(olivia, requestId, 'accept');
    } finally {
      cloudant.beforePut = null;
    }
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CONFLICT');
    assert.equal(storedListing(listingId).status, 'available');
    assert.equal(storedRequest(requestId).status, 'pending');
  });

  it('answers 409 CONFLICT and keeps the request if it keeps changing during decline', async () => {
    const requestId = await requestFor(rita, await createListing(olivia));
    cloudant.beforePut = (docId, store) => {
      const doc = store.get(docId);
      if (docId.startsWith('request:') && doc) doc._rev = `${++cloudant.seq}-other-writer`;
    };
    let res;
    try {
      res = await act(olivia, requestId, 'decline');
    } finally {
      cloudant.beforePut = null;
    }
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CONFLICT');
    assert.equal(storedRequest(requestId).status, 'pending');
  });

  it('answers 503 without leaking details when Cloudant is down', async () => {
    cloudant.down = true;
    let received;
    let created;
    try {
      received = await list(olivia, 'received');
      created = await send(rita, { listingId: 'anything' });
    } finally {
      cloudant.down = false;
    }
    for (const res of [received, created]) {
      assert.equal(res.status, 503);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
      assert.ok(!JSON.stringify(res.body).includes('ECONNREFUSED'));
      assert.ok(!JSON.stringify(res.body).includes('cloudant.test'));
    }
  });

  it('creates the request indexes with "npm run db:setup" (ensureIndexes)', async () => {
    const names = cloudant.indexes.map((index) => index.name);
    for (const name of ['request-by-owner', 'request-by-requester', 'request-by-listing']) {
      assert.ok(names.includes(name), `${name} must be created`);
    }
    const byListing = cloudant.indexes.find((index) => index.name === 'request-by-listing');
    assert.deepEqual(byListing.fields, ['type', 'listingId', 'status']);
  });

  it('looks up the pending requests of a listing with an equality selector the index can answer', async () => {
    const listingId = await createListing(olivia);
    const winner = await requestFor(rita, listingId);
    await requestFor(sam, listingId);
    cloudant.finds.length = 0;
    await act(olivia, winner, 'accept');
    const find = cloudant.finds.find((item) => item.selector.listingId === listingId);
    assert.deepEqual(find.selector, { type: 'request', listingId, status: 'pending' });
  });

  it('still lets the earlier tasks work next to requests (register, profile, create, browse)', async () => {
    const me = await api('GET', '/auth/me', { token: olivia.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.contact.value, PHONE, 'a user still sees their OWN contact on /auth/me');
    const listingId = await createListing(olivia, { title: 'Regressionflow jacket' });
    const feed = await api('GET', '/listings?q=regressionflow');
    assert.deepEqual(feed.body.data.listings.map((item) => item.id), [listingId]);
    assert.equal((await api('GET', '/requests/received')).status, 401);
  });
});
