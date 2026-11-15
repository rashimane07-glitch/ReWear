// HTTP tests for REPORTS (Task 10, phase 2): students report a listing or a user, read their own
// reports, and administrators review and decide them. They run the real Express app over HTTP;
// only IBM Cloudant is replaced by the in-memory fake (tests/helpers/fakes.js). So they prove OUR
// code, not that real Cloudant accepts the queries (that needs "npm run db:setup" and a read-only
// check against the real database).

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { cloudant, startServer } = require('./helpers/fakes'); // must be required BEFORE ../src
const { ensureIndexes } = require('../src/config/database');

let server;
let admin;
let bob; // owns listings, has a phone number in his profile
let carol;
let dave;
let erin;
const listing = {}; // key -> id
const PASSWORD = 'S3cretPassw0rd!';
const PHONE = '+919876543210';

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

const withQuery = (path, query) => (query ? `${path}?${query}` : path);
const report = (user, json) => api('POST', '/reports', { token: user.token, json });
const mine = (user, query = '') => api('GET', withQuery('/reports/mine', query), { token: user.token });
const adminList = (query = '', token = admin.token) => api('GET', withQuery('/admin/reports', query), { token });
const adminGet = (id, token = admin.token) => api('GET', `/admin/reports/${id}`, { token });
const dismiss = (id, json, token = admin.token) => api('POST', `/admin/reports/${id}/dismiss`, { token, json });
const resolve = (id, json, token = admin.token) => api('POST', `/admin/reports/${id}/resolve`, { token, json });

const storedReport = (id) => cloudant.store.get(`report:${id}`);
const storedListing = (id) => cloudant.store.get(`listing:${id}`);
const countReports = () => [...cloudant.store.keys()].filter((key) => key.startsWith('report:')).length;
const idsOf = (res) => res.body.data.reports.map((item) => item.id);

const STUDENT_KEYS = ['createdAt', 'details', 'id', 'reason', 'resolvedAt', 'status', 'target', 'targetType'];
const ADMIN_KEYS = ['createdAt', 'details', 'id', 'reason', 'reporter', 'resolution', 'status', 'target', 'updatedAt'];

async function register(name, email) {
  const res = await api('POST', '/auth/register', { json: { name, email, password: PASSWORD } });
  assert.equal(res.status, 201, 'test setup: registration should work');
  return { token: res.body.data.token, id: res.body.data.user.id, name };
}

async function createListing(user, key, title) {
  const res = await api('POST', '/listings', {
    token: user.token,
    json: { title, description: `${title}, in good shape.`, category: 'tops', size: 'm', colour: 'Blue', condition: 'good', listingType: 'sell', price: 100 },
  });
  assert.equal(res.status, 201, `test setup: creating "${title}" should work`);
  listing[key] = res.body.data.listing.id;
  return listing[key];
}

// Sends a report that must work and returns its id.
async function newReport(reporter, targetType, targetId, reason = 'spam', details) {
  const res = await report(reporter, { targetType, targetId, reason, details });
  assert.equal(res.status, 201, `test setup: reporting should work (${JSON.stringify(res.body)})`);
  return res.body.data.report.id;
}

before(async () => {
  server = await startServer();
  assert.equal((await ensureIndexes()).ok, true, 'test setup: indexes should be created');

  admin = await register('Ada Admin', 'ada@example.com');
  cloudant.store.get(`user:${admin.id}`).role = 'admin'; // what "npm run admin:create" does
  bob = await register('Bob Owner', 'bob@example.com');
  carol = await register('Carol Reporter', 'carol@example.com');
  dave = await register('Dave Reporter', 'dave@example.com');
  erin = await register('Erin Reporter', 'erin@example.com');
  cloudant.store.get(`user:${bob.id}`).contact = { type: 'phone', value: PHONE };

  await createListing(bob, 'jacket', 'Denim jacket');
  await createListing(bob, 'scarf', 'Silk scarf');
  await createListing(carol, 'bag', 'Canvas bag');
});

after(async () => {
  await server.close();
});

// ---------- students: sending a report ----------

describe('reports: a student reports a listing or a user', () => {
  it('needs a login (401), also with a bad token', async () => {
    const json = { targetType: 'listing', targetId: listing.jacket, reason: 'spam' };
    assert.equal((await api('POST', '/reports', { json })).status, 401);
    assert.equal((await api('POST', '/reports', { json, token: 'not.a.token' })).status, 401);
    assert.equal((await api('GET', '/reports/mine')).status, 401);
  });

  it('reports a listing (201) and returns only safe fields', async () => {
    const res = await report(carol, { targetType: 'listing', targetId: listing.jacket, reason: 'spam', details: 'Looks like an advert.' });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    const data = res.body.data.report;
    assert.deepEqual(Object.keys(data).sort(), STUDENT_KEYS);
    assert.equal(data.id, `listing_${listing.jacket}_${carol.id}`);
    assert.equal(data.targetType, 'listing');
    assert.deepEqual(data.target, { type: 'listing', id: listing.jacket, label: 'Denim jacket' });
    assert.equal(data.reason, 'spam');
    assert.equal(data.details, 'Looks like an advert.');
    assert.equal(data.status, 'open');
    assert.equal(data.resolvedAt, null);

    const doc = storedReport(data.id);
    assert.equal(doc.type, 'report');
    assert.equal(doc.reporterId, carol.id, 'the reporter is the logged-in student');
    assert.equal(doc.targetOwnerId, bob.id);
    assert.equal(doc.resolution, null);

    const text = JSON.stringify(res.body);
    for (const secret of [bob.id, PHONE, 'example.com', 'passwordHash', 'reporterId', 'targetOwnerId', '_rev']) {
      assert.ok(!text.includes(secret), `the response must not contain ${secret}`);
    }
  });

  it('reports a user (201)', async () => {
    const res = await report(carol, { targetType: 'user', targetId: bob.id, reason: 'harassment' });
    assert.equal(res.status, 201);
    const data = res.body.data.report;
    assert.deepEqual(Object.keys(data).sort(), STUDENT_KEYS);
    assert.equal(data.targetType, 'user');
    assert.deepEqual(data.target, { type: 'user', id: bob.id, label: 'Bob Owner' });
    assert.equal(data.details, null, 'details are optional');
    assert.equal(storedReport(data.id).targetOwnerId, null);
    assert.ok(!JSON.stringify(res.body).includes(PHONE), 'the reported person\'s contact is never in a report');
  });

  it('cleans the details and the reason, and limits the details to 500 characters', async () => {
    const cleaned = await report(dave, { targetType: 'listing', targetId: listing.scarf, reason: ' SPAM ', details: '  Looks fake\u0007\r\nsee photo  ' });
    assert.equal(cleaned.status, 201);
    assert.equal(cleaned.body.data.report.reason, 'spam');
    assert.equal(cleaned.body.data.report.details, 'Looks fake\nsee photo');

    const max = await report(erin, { targetType: 'listing', targetId: listing.jacket, reason: 'other', details: 'x'.repeat(500) });
    assert.equal(max.status, 201, '500 characters are allowed');
    assert.equal(max.body.data.report.details.length, 500);

    const before = countReports();
    const tooLong = await report(dave, { targetType: 'listing', targetId: listing.jacket, reason: 'other', details: 'x'.repeat(501) });
    assert.equal(tooLong.status, 400);
    assert.equal(tooLong.body.error.details[0].field, 'details');
    assert.equal(countReports(), before, 'nothing is stored for an invalid report');
  });

  it('rejects invalid input with 400 and lists every problem', async () => {
    const before = countReports();
    const fieldsOf = (res) => res.body.error.details.map((detail) => detail.field).sort();

    const empty = await report(erin, {});
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(fieldsOf(empty), ['reason', 'targetId', 'targetType']);

    const wrong = await report(erin, { targetType: 'order', targetId: '../x', reason: 'rude', details: 42 });
    assert.deepEqual(fieldsOf(wrong), ['details', 'reason', 'targetId', 'targetType']);

    const sneaky = await report(erin, { targetType: 'user', targetId: bob.id, reason: 'spam', reporterId: bob.id, status: 'resolved', resolution: {} });
    assert.equal(sneaky.status, 400);
    assert.deepEqual(fieldsOf(sneaky), ['reporterId', 'resolution', 'status']);

    assert.equal((await report(erin, ['not', 'an', 'object'])).status, 400);
    assert.equal(countReports(), before, 'nothing is stored for an invalid report');
  });

  it('does not let a student report themselves or their own listing (403)', async () => {
    for (const json of [
      { targetType: 'listing', targetId: listing.jacket, reason: 'spam' }, // bob's own listing
      { targetType: 'user', targetId: bob.id, reason: 'spam' }, // bob himself
    ]) {
      const res = await report(bob, json);
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'CANNOT_REPORT_YOURSELF');
    }
    assert.equal((await report(carol, { targetType: 'listing', targetId: listing.bag, reason: 'spam' })).status, 403);
  });

  it('answers 404 for a listing or user that does not exist, or a listing that was deleted', async () => {
    await createListing(carol, 'old', 'Old sweater');
    assert.equal((await api('DELETE', `/listings/${listing.old}`, { token: carol.token })).status, 200);

    for (const json of [
      { targetType: 'listing', targetId: 'no-such-listing', reason: 'spam' },
      { targetType: 'listing', targetId: listing.old, reason: 'spam' },
      { targetType: 'user', targetId: 'no-such-user', reason: 'spam' },
    ]) {
      const res = await report(dave, json);
      assert.equal(res.status, 404, JSON.stringify(json));
      assert.equal(res.body.error.code, 'NOT_FOUND');
    }
  });

  it('allows one report per reporter per target (409 DUPLICATE_REPORT), but not per student overall', async () => {
    const again = await report(carol, { targetType: 'listing', targetId: listing.jacket, reason: 'misleading' });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'DUPLICATE_REPORT');
    assert.equal(storedReport(`listing_${listing.jacket}_${carol.id}`).reason, 'spam', 'the first report is not overwritten');

    assert.equal((await report(carol, { targetType: 'listing', targetId: listing.scarf, reason: 'spam' })).status, 201, 'another target');
    assert.equal((await report(dave, { targetType: 'listing', targetId: listing.jacket, reason: 'spam' })).status, 201, 'another reporter');
  });

  it('stops one student from filling the admin queue (429), counting only open reports', async () => {
    const frank = await register('Frank Flooder', 'frank@example.com');
    const seed = (n, status) => {
      const id = `report:user_seed-${n}_${frank.id}`;
      const at = `2026-02-${String(n).padStart(2, '0')}T10:00:00.000Z`;
      cloudant.store.set(id, {
        _id: id, _rev: '1-seed', type: 'report', targetType: 'user', targetId: `seed-${n}`, targetOwnerId: null, targetLabel: 'Seed',
        reporterId: frank.id, reason: 'spam', details: null, status, createdAt: at, updatedAt: at, resolution: null,
      });
    };
    for (let n = 1; n <= 9; n += 1) seed(n, 'open');
    seed(10, 'dismissed'); // a decided report does not count

    assert.equal((await report(frank, { targetType: 'user', targetId: bob.id, reason: 'spam' })).status, 201, 'the 10th open report');
    const blocked = await report(frank, { targetType: 'user', targetId: carol.id, reason: 'spam' });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'TOO_MANY_OPEN_REPORTS');
    assert.equal(storedReport(`user_${carol.id}_${frank.id}`), undefined, 'the blocked report is not stored');
  });

  it('answers 503 when the database is down', async () => {
    cloudant.down = true;
    let res;
    try {
      res = await report(carol, { targetType: 'user', targetId: dave.id, reason: 'spam' });
    } finally {
      cloudant.down = false;
    }
    assert.equal(res.status, 503);
    assert.equal(res.body.success, false);
  });
});

// ---------- students: reading their own reports ----------

describe('reports: a student reads only their own reports', () => {
  let gina;
  const ids = {};

  before(async () => {
    gina = await register('Gina Reporter', 'gina@example.com');
    ids.jacket = await newReport(gina, 'listing', listing.jacket, 'spam');
    ids.user = await newReport(gina, 'user', bob.id, 'harassment', 'Rude messages.');
    ids.bag = await newReport(gina, 'listing', listing.bag, 'misleading');
    storedReport(ids.jacket).createdAt = '2026-03-01T10:00:00.000Z';
    storedReport(ids.user).createdAt = '2026-03-02T10:00:00.000Z';
    storedReport(ids.bag).createdAt = '2026-03-03T10:00:00.000Z';
  });

  it('lists them newest first with a count, and only safe fields', async () => {
    const res = await mine(gina);
    assert.equal(res.status, 200);
    assert.deepEqual(idsOf(res), [ids.bag, ids.user, ids.jacket]);
    assert.deepEqual(res.body.meta, { count: 3 });
    for (const item of res.body.data.reports) {
      assert.deepEqual(Object.keys(item).sort(), STUDENT_KEYS);
    }
    const text = JSON.stringify(res.body);
    for (const secret of [PHONE, 'example.com', 'passwordHash', 'reporterId', 'targetOwnerId', 'adminId', 'resolution']) {
      assert.ok(!text.includes(secret), `the list must not contain ${secret}`);
    }
  });

  it('never shows another student\'s reports, and the reported person sees nothing at all', async () => {
    const others = await mine(dave);
    assert.equal(others.status, 200);
    assert.ok(idsOf(others).length > 0, 'dave has his own reports');
    assert.ok(idsOf(others).every((id) => id.endsWith(`_${dave.id}`)), 'only his own');
    assert.ok(!idsOf(others).some((id) => Object.values(ids).includes(id)));

    const reported = await mine(bob); // bob was reported by several students
    assert.equal(reported.status, 200);
    assert.deepEqual(reported.body.data.reports, []);
    assert.equal((await api('GET', '/admin/reports', { token: bob.token })).status, 403);
  });

  it('filters by status and rejects bad queries (400)', async () => {
    assert.deepEqual(idsOf(await mine(gina, 'status=open')), [ids.bag, ids.user, ids.jacket]);
    assert.deepEqual(idsOf(await mine(gina, 'status=resolved')), []);
    assert.deepEqual(idsOf(await mine(gina, 'status=open,resolved')), [ids.bag, ids.user, ids.jacket]);
    assert.equal((await mine(gina, 'status=bogus')).status, 400);
    const unknown = await mine(gina, 'colour=red');
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.details[0].field, 'colour');
  });

  it('shows the outcome of a decided report, but never what the administrator wrote', async () => {
    Object.assign(storedReport(ids.user), {
      status: 'dismissed',
      resolution: { action: 'none', note: 'secret internal note', adminId: admin.id, at: '2026-03-05T10:00:00.000Z' },
    });
    const res = await mine(gina, 'status=dismissed');
    assert.equal(res.status, 200);
    assert.deepEqual(idsOf(res), [ids.user]);
    const item = res.body.data.reports[0];
    assert.equal(item.status, 'dismissed');
    assert.equal(item.resolvedAt, '2026-03-05T10:00:00.000Z');
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes('secret internal note'));
    assert.ok(!text.includes(admin.id));
    assert.deepEqual(idsOf(await mine(gina, 'status=open')), [ids.bag, ids.jacket]);
  });
});

// ---------- administrators: who may enter ----------

describe('reports: admin access control', () => {
  it('needs a login (401) and the administrator role (403), and gives students no way to decide', async () => {
    const victim = await newReport(erin, 'listing', listing.bag, 'spam');
    const routes = [
      ['GET', '/admin/reports'],
      ['GET', `/admin/reports/${victim}`],
      ['POST', `/admin/reports/${victim}/dismiss`],
      ['POST', `/admin/reports/${victim}/resolve`],
    ];
    for (const [method, path] of routes) {
      assert.equal((await api(method, path)).status, 401, `${method} ${path}`);
      const student = await api(method, path, { token: bob.token });
      assert.equal(student.status, 403, `${method} ${path}`);
      assert.equal(student.body.error.code, 'FORBIDDEN');
      assert.equal(student.body.data, undefined);
    }
    assert.equal((await dismiss(victim, {}, erin.token)).status, 403, 'even the reporter cannot decide');
    assert.equal(storedReport(victim).status, 'open', 'a student must not be able to decide anything');
  });

  it('keeps the other routes as they were', async () => {
    assert.equal((await api('GET', '/listings')).status, 200);
    assert.equal((await api('GET', '/requests/received')).status, 401);
    assert.equal((await api('GET', '/admin/listings', { token: admin.token })).status, 200);
    assert.equal((await api('GET', '/admin/nothing', { token: admin.token })).status, 404);
  });
});

// ---------- administrators: reading reports ----------

describe('reports: the admin queue and report details', () => {
  let hana;
  let ivan;
  const ids = {};

  before(async () => {
    hana = await register('Hana Reporter', 'hana@example.com');
    ivan = await register('Ivan Reporter', 'ivan@example.com');
    ids.first = await newReport(hana, 'listing', listing.scarf, 'spam', 'Advert, not a clothing item.');
    ids.second = await newReport(ivan, 'listing', listing.scarf, 'misleading');
    ids.user = await newReport(hana, 'user', bob.id, 'harassment');
    ids.decided = await newReport(hana, 'listing', listing.bag, 'other');
    storedReport(ids.first).createdAt = '2026-04-01T10:00:00.000Z';
    storedReport(ids.second).createdAt = '2026-04-02T10:00:00.000Z';
    storedReport(ids.user).createdAt = '2026-04-03T10:00:00.000Z';
    Object.assign(storedReport(ids.decided), {
      createdAt: '2026-04-04T10:00:00.000Z',
      status: 'resolved',
      resolution: { action: 'none', note: 'Checked, fine.', adminId: admin.id, at: '2026-04-05T10:00:00.000Z' },
    });
  });

  it('lists the OPEN reports newest first by default', async () => {
    const res = await adminList();
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const list = idsOf(res);
    for (const id of [ids.first, ids.second, ids.user]) assert.ok(list.includes(id), `${id} is open`);
    assert.ok(!list.includes(ids.decided), 'a decided report is not in the default queue');
    assert.ok(list.indexOf(ids.user) < list.indexOf(ids.second) && list.indexOf(ids.second) < list.indexOf(ids.first), 'newest first');
    assert.ok(res.body.data.reports.every((item) => item.status === 'open'));
    assert.equal(res.body.meta.count, list.length);
    assert.equal(res.body.meta.truncated, false);
  });

  it('shows who reported what, with names only, and never a contact detail or password', async () => {
    const res = await adminList();
    const byId = Object.fromEntries(res.body.data.reports.map((item) => [item.id, item]));

    const listingReport = byId[ids.first];
    assert.deepEqual(Object.keys(listingReport).sort(), ADMIN_KEYS);
    assert.deepEqual(listingReport.reporter, { id: hana.id, name: 'Hana Reporter' });
    assert.equal(listingReport.reason, 'spam');
    assert.equal(listingReport.details, 'Advert, not a clothing item.');
    assert.equal(listingReport.resolution, null);
    assert.deepEqual(listingReport.target, {
      type: 'listing', id: listing.scarf, title: 'Silk scarf', status: 'available', owner: { id: bob.id, name: 'Bob Owner' },
    });
    assert.deepEqual(byId[ids.user].target, { type: 'user', id: bob.id, name: 'Bob Owner', exists: true });

    const text = JSON.stringify(res.body);
    for (const secret of [PHONE, 'example.com', 'passwordHash', 'reporterId', 'targetOwnerId', 'targetLabel', '_rev']) {
      assert.ok(!text.includes(secret), `the admin list must not contain ${secret}`);
    }
  });

  it('looks listings and people up in bulk, not once per report', async () => {
    const before = cloudant.allDocsCalls.length;
    assert.equal((await adminList()).status, 200);
    assert.equal(cloudant.allDocsCalls.length - before, 2, 'one bulk read for listings and one for users');
  });

  it('filters by status and target type', async () => {
    assert.deepEqual(idsOf(await adminList('status=resolved')).includes(ids.decided), true);
    assert.ok(!idsOf(await adminList('status=resolved')).includes(ids.first));

    const all = idsOf(await adminList('status=all'));
    for (const id of Object.values(ids)) assert.ok(all.includes(id), 'status=all shows every status');

    const users = (await adminList('targetType=user')).body.data.reports;
    assert.ok(users.length > 0 && users.every((item) => item.target.type === 'user'));
    const listings = (await adminList('status=all&targetType=listing')).body.data.reports;
    assert.ok(listings.length > 0 && listings.every((item) => item.target.type === 'listing'));
  });

  it('rejects bad queries with 400', async () => {
    for (const query of ['status=bogus', 'targetType=order', 'colour=red', 'status=open&status=resolved']) {
      const res = await adminList(query);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
  });

  it('shows one report with the current state of the target (200)', async () => {
    const res = await adminGet(ids.second);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body.data.report).sort(), ADMIN_KEYS);
    assert.equal(res.body.data.report.id, ids.second);
    assert.equal(res.body.data.report.reporter.name, 'Ivan Reporter');
    assert.equal(res.body.data.report.target.status, 'available');

    const decided = (await adminGet(ids.decided)).body.data.report;
    assert.equal(decided.status, 'resolved');
    assert.deepEqual(decided.resolution, { action: 'none', note: 'Checked, fine.', adminId: admin.id, at: '2026-04-05T10:00:00.000Z' });
  });

  it('shows a removed listing as "removed" and a deleted account by its saved name', async () => {
    await createListing(carol, 'tmp', 'Temporary hat');
    const hatReport = await newReport(hana, 'listing', listing.tmp, 'prohibited_item');
    assert.equal((await adminGet(hatReport)).body.data.report.target.status, 'available');
    assert.equal((await api('POST', `/admin/listings/${listing.tmp}/remove`, { token: admin.token, json: {} })).status, 200);
    const removed = (await adminGet(hatReport)).body.data.report.target;
    assert.equal(removed.status, 'removed');
    assert.equal(removed.title, 'Temporary hat', 'the saved title is shown');
    assert.equal(removed.owner.name, 'Carol Reporter');

    const jules = await register('Jules Gone', 'jules@example.com');
    const julesReport = await newReport(hana, 'user', jules.id, 'spam');
    cloudant.store.delete(`user:${jules.id}`);
    assert.deepEqual((await adminGet(julesReport)).body.data.report.target, { type: 'user', id: jules.id, name: 'Jules Gone', exists: false });
  });

  it('answers 404 for an unknown or malformed report id', async () => {
    for (const id of ['listing_no-such_no-such', 'x', 'order_a_b']) {
      const res = await adminGet(id);
      assert.equal(res.status, 404, id);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    }
  });
});

// ---------- administrators: deciding reports ----------

describe('reports: dismissing and resolving', () => {
  let judy; // a reporter used only here (each decision needs its own report)
  let counter = 0;

  before(async () => {
    judy = await register('Judy Reporter', 'judy@example.com');
  });

  // A fresh listing of bob's (or a user report) and a report about it. Returns { reportId, listingId }.
  async function freshListingReport(title) {
    counter += 1;
    const listingId = await createListing(bob, `decision${counter}`, title);
    return { reportId: await newReport(judy, 'listing', listingId, 'spam'), listingId };
  }

  it('dismisses a report and records the note, the administrator and the time', async () => {
    const { reportId, listingId } = await freshListingReport('Dismissed jumper');
    const res = await dismiss(reportId, { note: 'Not a problem.' });
    assert.equal(res.status, 200);
    const data = res.body.data.report;
    assert.equal(data.status, 'dismissed');
    assert.equal(data.resolution.action, 'none');
    assert.equal(data.resolution.note, 'Not a problem.');
    assert.equal(data.resolution.adminId, admin.id);
    assert.match(data.resolution.at, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(storedReport(reportId).resolution, data.resolution);
    assert.equal(storedListing(listingId).isDeleted, false, 'dismissing never touches the listing');

    // the student sees the outcome only
    const own = (await mine(judy, 'status=dismissed')).body.data.reports.find((item) => item.id === reportId);
    assert.equal(own.status, 'dismissed');
    assert.equal(own.resolvedAt, data.resolution.at);
    assert.ok(!JSON.stringify(own).includes('Not a problem.'));
  });

  it('dismisses without a body (the note is empty)', async () => {
    const { reportId } = await freshListingReport('Quiet jumper');
    const res = await dismiss(reportId);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.report.resolution.note, null);
  });

  it('resolves a report without removing anything by default', async () => {
    const { reportId, listingId } = await freshListingReport('Resolved jumper');
    const res = await resolve(reportId, { note: 'Talked to the owner.' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.report.status, 'resolved');
    assert.equal(res.body.data.report.resolution.action, 'none');
    assert.equal(res.body.data.report.resolution.note, 'Talked to the owner.');
    assert.equal(storedListing(listingId).isDeleted, false);

    const plain = await freshListingReport('Plain resolved jumper');
    const noBody = await resolve(plain.reportId);
    assert.equal(noBody.status, 200);
    assert.equal(noBody.body.data.report.resolution.action, 'none');
  });

  it('resolves a listing report by removing the listing', async () => {
    const { reportId, listingId } = await freshListingReport('Fake designer bag');
    const res = await resolve(reportId, { action: 'remove_listing', note: 'Counterfeit.' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.report.status, 'resolved');
    assert.equal(res.body.data.report.resolution.action, 'remove_listing');
    assert.equal(res.body.data.report.target.status, 'removed');

    const doc = storedListing(listingId);
    assert.equal(doc.isDeleted, true);
    assert.equal(doc.deletionReason, 'admin_removed');
    assert.equal(doc.deletedBy, admin.id);
    assert.equal(doc.removalNote, 'Counterfeit.');
    const feed = await api('GET', '/listings?q=designer');
    assert.equal(feed.body.data.listings.length, 0, 'the removed listing is gone from the public feed');
  });

  it('refuses to remove a "listing" for a user report (400) and changes nothing', async () => {
    const reportId = await newReport(judy, 'user', carol.id, 'harassment');
    const res = await resolve(reportId, { action: 'remove_listing' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details[0].field, 'action');
    assert.equal(storedReport(reportId).status, 'open');
    assert.equal((await resolve(reportId, { action: 'none', note: 'Warned.' })).status, 200, 'it can still be resolved without removal');
  });

  it('answers 409 if the listing was already removed, keeps the report open, and still lets it be resolved', async () => {
    const { reportId, listingId } = await freshListingReport('Gone before review');
    assert.equal((await api('DELETE', `/listings/${listingId}`, { token: bob.token })).status, 200); // the owner deleted it
    const res = await resolve(reportId, { action: 'remove_listing' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'LISTING_ALREADY_REMOVED');
    assert.equal(storedReport(reportId).status, 'open');
    assert.equal((await resolve(reportId, { action: 'none' })).status, 200);
  });

  it('refuses to decide a report twice (409) and keeps the first decision', async () => {
    const { reportId } = await freshListingReport('Decided jumper');
    assert.equal((await dismiss(reportId, { note: 'first' })).status, 200);
    for (const attempt of [() => dismiss(reportId, { note: 'second' }), () => resolve(reportId, { action: 'remove_listing' })]) {
      const res = await attempt();
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'REPORT_ALREADY_DECIDED');
    }
    assert.equal(storedReport(reportId).status, 'dismissed');
    assert.equal(storedReport(reportId).resolution.note, 'first');
  });

  it('rejects invalid bodies with 400 and changes nothing', async () => {
    const { reportId, listingId } = await freshListingReport('Invalid body jumper');
    const cases = [
      () => resolve(reportId, { action: 'ban_user' }),
      () => resolve(reportId, { action: 5 }),
      () => resolve(reportId, { status: 'dismissed' }),
      () => resolve(reportId, { note: 'x'.repeat(501) }),
      () => resolve(reportId, { note: 42 }),
      () => dismiss(reportId, { action: 'remove_listing' }),
      () => dismiss(reportId, { adminId: bob.id }),
      () => dismiss(reportId, ['note']),
    ];
    for (const attempt of cases) {
      const res = await attempt();
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    }
    assert.equal(storedReport(reportId).status, 'open');
    assert.equal(storedListing(listingId).isDeleted, false);
  });

  it('answers 404 for an unknown or malformed report id', async () => {
    for (const id of ['listing_no-such_no-such', 'x']) {
      assert.equal((await dismiss(id, {})).status, 404, id);
      assert.equal((await resolve(id, {})).status, 404, id);
    }
  });

  it('retries after a revision conflict, but reports a conflict that never ends (409) and changes nothing', async () => {
    const once = await freshListingReport('Conflict once jumper');
    let bumped = false;
    cloudant.beforePut = (docId, store) => {
      if (!bumped && docId === `report:${once.reportId}`) {
        bumped = true;
        store.get(docId)._rev = `${++cloudant.seq}-other-writer`;
      }
    };
    let res;
    try {
      res = await dismiss(once.reportId, { note: 'retry' });
    } finally {
      cloudant.beforePut = null;
    }
    assert.equal(bumped, true, 'the conflict really happened');
    assert.equal(res.status, 200);
    assert.equal(storedReport(once.reportId).status, 'dismissed');

    const always = await freshListingReport('Conflict always jumper');
    cloudant.beforePut = (docId, store) => {
      if (docId === `report:${always.reportId}`) store.get(docId)._rev = `${++cloudant.seq}-other-writer`;
    };
    try {
      res = await dismiss(always.reportId, {});
    } finally {
      cloudant.beforePut = null;
    }
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CONFLICT');
    assert.equal(storedReport(always.reportId).status, 'open');
  });

  it('removes the listing only once when saving the report conflicts and is retried', async () => {
    const { reportId, listingId } = await freshListingReport('Conflict removal jumper');
    let bumped = false;
    cloudant.beforePut = (docId, store) => {
      if (!bumped && docId === `report:${reportId}`) {
        bumped = true;
        store.get(docId)._rev = `${++cloudant.seq}-other-writer`;
      }
    };
    let res;
    try {
      res = await resolve(reportId, { action: 'remove_listing', note: 'Prohibited.' });
    } finally {
      cloudant.beforePut = null;
    }
    assert.equal(bumped, true, 'the conflict really happened');
    assert.equal(res.status, 200, 'the second attempt must not fail because the listing is already removed');
    assert.equal(res.body.data.report.resolution.action, 'remove_listing');
    assert.equal(storedListing(listingId).isDeleted, true);
    assert.equal(storedListing(listingId).deletedBy, admin.id);
    assert.equal(storedListing(listingId).removalNote, 'Prohibited.');
  });

  it('answers 503 when the database is down', async () => {
    const { reportId } = await freshListingReport('Outage jumper');
    cloudant.down = true;
    let res;
    try {
      res = await dismiss(reportId, {});
    } finally {
      cloudant.down = false;
    }
    assert.equal(res.status, 503);
    assert.equal(storedReport(reportId).status, 'open');
  });
});
