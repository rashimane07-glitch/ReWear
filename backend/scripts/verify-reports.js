// Read-only check of the Task 10 REPORT and ADMIN-OVERVIEW queries and indexes against your REAL IBM Cloudant database.
// Run it yourself with:  npm run db:verify-reports
//
// WHY: the automated tests use an in-memory fake of Cloudant. It cannot prove that the real
// Cloudant (a) has the report indexes and the admin listing index, (b) accepts the queries
// report.repository.js and listing.repository.js send (including the SORTED admin overview query),
// and (c) answers them from those indexes instead of scanning the whole database. This script asks
// the real Cloudant exactly that.
//
// IT ONLY READS. It sends GET /_index, POST /_explain, POST /_find, GET /<doc> and POST /_all_docs.
// It never creates, changes or deletes anything: no reports, no listings, no admin accounts.
// Run "npm run db:setup" first so the indexes exist.
//
// What it does NOT prove (these need writes, so they are covered only by the fake-Cloudant tests):
// sending, dismissing or resolving a report, duplicate prevention (two documents with the same _id),
// revision conflicts, removing a listing, the admin-only access rule and the API-level privacy rules.
//
// It prints only our own messages: counts and PASS / FAIL / SKIP lines. It never prints credentials,
// ids, names, notes, details or contact details, and never raw Cloudant errors.

const fs = require('fs');
const path = require('path');

const config = require('../src/config/env');
const { getClient } = require('../src/config/cloudant');
const { checkConnection } = require('../src/config/database');
const {
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  REPORT_REASONS,
  REPORT_RESOLUTION_ACTIONS,
  REPORT_LIMITS,
} = require('../src/config/constants');
const reportRepository = require('../src/repositories/report.repository');
const listingRepository = require('../src/repositories/listing.repository');

let passed = 0;
let failed = 0;
let skipped = 0;
const pass = (message) => {
  passed += 1;
  console.log(`PASS  ${message}`);
};
const fail = (message) => {
  failed += 1;
  console.log(`FAIL  ${message}`);
};
const skip = (message) => {
  skipped += 1;
  console.log(`SKIP  ${message}`);
};
const info = (message) => console.log(`INFO  ${message}`);

// Describes an error WITHOUT its message (messages may contain details we must not print).
function describeError(err) {
  if (err && err.code && err.statusCode) return `${err.code} (HTTP ${err.statusCode})`;
  if (err && Number.isInteger(err.status)) return `HTTP ${err.status}`;
  if (err && typeof err.code === 'string') return err.code;
  return 'unexpected error';
}

// A query id that cannot belong to anyone (letters and dashes only, so the repositories accept it).
const PROBE = 'verify-probe';

// The indexes are READ from src/config/database.js (the INDEXES list that "npm run db:setup"
// uses), so this script can never drift away from the real definitions.
const EXPECTED_INDEX_NAMES = ['report-by-reporter', 'report-by-status', 'listing-admin-created'];

function readIndexDefinitions() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'database.js'), 'utf8');
  const definitions = {};
  const pattern = /\{\s*name:\s*'((?:report-|listing-admin-)[a-z-]+)',\s*fields:\s*\[([^\]]*)\]\s*\}/g;
  let match = pattern.exec(source);
  while (match) {
    definitions[match[1]] = match[2]
      .split(',')
      .map((field) => field.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);
    match = pattern.exec(source);
  }
  return definitions;
}

// Field names used by one index, from the shapes Cloudant returns ([{ field: 'asc' }, ...]).
const indexFieldNames = (index) =>
  ((index && index.def && index.def.fields) || []).map((entry) => (typeof entry === 'string' ? entry : Object.keys(entry)[0]));

const sameList = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
const countOf = (result) => (Array.isArray(result) ? result.length : result && result.docs ? result.docs.length : Number(result) || 0);

async function main() {
  // ---------- 0) connection ----------
  const connection = await checkConnection();
  if (!connection.ok) {
    console.log(`FAIL  Cannot reach Cloudant: ${connection.message}`);
    process.exit(1);
  }
  info(connection.message);

  const client = getClient();
  const db = config.cloudant.database;

  // ---------- 1) do the indexes exist, with the fields database.js defines? ----------
  const definitions = readIndexDefinitions();
  let listed = null;
  try {
    const response = await client.getIndexesInformation({ db });
    listed = (response.result && response.result.indexes) || [];
  } catch (err) {
    fail(`could not list the indexes (GET /_index): ${describeError(err)}`);
  }

  if (listed) {
    for (const name of EXPECTED_INDEX_NAMES) {
      if (!definitions[name]) {
        fail(`index "${name}": not found in the INDEXES list of src/config/database.js (this script is out of date)`);
        continue;
      }
      const found = listed.find((index) => index.name === name && index.type === 'json');
      if (!found) {
        fail(`index "${name}" does NOT exist in Cloudant. Run "npm run db:setup".`);
      } else if (!sameList(indexFieldNames(found), definitions[name])) {
        fail(`index "${name}" exists but on other fields than database.js defines (${indexFieldNames(found).join(', ')}).`);
      } else {
        pass(`index "${name}" exists on [${definitions[name].join(', ')}]`);
      }
    }
  }

  // ---------- 2) does Cloudant accept the queries the repositories really send? ----------
  // The repositories' own functions are called; each Cloudant _find call they make is captured, then
  // the SAME selector (and sort) is sent to _explain to learn which index Cloudant would use.
  // Report queries use an id that cannot exist, so they must return nothing. The admin overview
  // queries cannot use a probe id, so they run on real data (limit 5) and only their plan is checked.
  const captured = [];
  const originalPostFind = client.postFind.bind(client);
  client.postFind = (params) => {
    captured.push(params);
    return originalPostFind(params);
  };

  // [label, indexes that are acceptable, number of _find calls expected, function, results must be empty?]
  const eitherReportIndex = ['report-by-reporter', 'report-by-status']; // the selector fits both; Cloudant picks one
  const queries = [
    ['reports of one student, no status filter', ['report-by-reporter'], 1, () => reportRepository.findReportsByReporter(PROBE), true],
    ['reports of one student, status = open', eitherReportIndex, 1, () => reportRepository.findReportsByReporter(PROBE, ['open']), true],
    [
      'reports of one student, several statuses (one query each)',
      eitherReportIndex,
      2,
      () => reportRepository.findReportsByReporter(PROBE, ['open', 'resolved']),
      true,
    ],
    ['open reports of one student (the flood limit)', eitherReportIndex, 1, () => reportRepository.countOpenReportsByReporter(PROBE), true],
    ['admin queue, status = open', ['report-by-status'], 1, () => reportRepository.findReportsByStatus(['open']), false],
    [
      'admin queue, all statuses (one query each)',
      ['report-by-status'],
      REPORT_STATUSES.length,
      () => reportRepository.findReportsByStatus([...REPORT_STATUSES]),
      false,
    ],
    ['admin queue, status + target type', ['report-by-status'], 1, () => reportRepository.findReportsByStatus(['open'], 'listing'), false],
    [
      'admin listing overview, not removed (SORTED newest first)',
      ['listing-admin-created'],
      1,
      () => listingRepository.findListingsForAdmin({ state: null, limit: 5 }),
      false,
    ],
    [
      'admin listing overview, state = removed (SORTED)',
      ['listing-admin-created'],
      1,
      () => listingRepository.findListingsForAdmin({ state: 'removed', limit: 5 }),
      false,
    ],
    [
      'admin listing overview, state = reserved (SORTED + status filter)',
      ['listing-admin-created', 'listing-feed-created'],
      1,
      () => listingRepository.findListingsForAdmin({ state: 'reserved', limit: 5 }),
      false,
    ],
  ];

  for (const [label, expectedIndexes, expectedCalls, run, mustBeEmpty] of queries) {
    captured.length = 0;
    let result;
    try {
      result = await run();
    } catch (err) {
      fail(`${label}: rejected - ${describeError(err)}`);
      continue;
    }
    if (mustBeEmpty && countOf(result) > 0) {
      fail(`${label}: returned a result for an id that cannot exist (the selector is not being applied)`);
      continue;
    }
    if (captured.length !== expectedCalls) {
      fail(`${label}: expected ${expectedCalls} _find call(s) but saw ${captured.length}`);
      continue;
    }

    let plansOk = true;
    for (const { selector, sort, limit } of captured) {
      try {
        const explained = await client.postExplain({ db, selector, ...(sort ? { sort } : {}), limit });
        const used = explained.result && explained.result.index;
        if (!used || !expectedIndexes.includes(used.name)) {
          plansOk = false;
          fail(`${label}: accepted, but Cloudant would use "${used ? used.name : 'no index'}" instead of ${expectedIndexes.map((n) => `"${n}"`).join(' or ')} (a slower scan)`);
          break;
        }
      } catch (err) {
        plansOk = false;
        fail(`${label}: the query plan could not be read (POST /_explain): ${describeError(err)}`);
        break;
      }
    }
    if (plansOk) pass(`${label}: accepted, answered from ${expectedIndexes.map((n) => `"${n}"`).join(' or ')} (limit ${captured[0].limit})`);
  }
  client.postFind = originalPostFind;

  // One report by id: a plain document read. An id that cannot exist must come back as "none", not an error.
  try {
    const none = await reportRepository.findReportById(`listing_${PROBE}_${PROBE}`);
    if (none === null) pass('report by id: a missing report is answered with "not found" (no error)');
    else fail('report by id: returned a document for an id that cannot exist');
  } catch (err) {
    fail(`report by id: rejected - ${describeError(err)}`);
  }

  // ---------- 3) the sorted admin overview on REAL listings (only if enough exist) ----------
  try {
    const page = await listingRepository.findListingsForAdmin({ state: null, limit: 25 });
    const docs = page.docs;
    if (docs.some((doc) => doc.isDeleted !== false || doc.type !== 'listing')) {
      fail('the admin overview "not removed" returned a removed listing or a non-listing');
    } else if (docs.length < 2) {
      skip('admin overview order and paging: fewer than 2 listings exist');
    } else {
      const newestFirst = docs.every((doc, i) => i === 0 || String(docs[i - 1].createdAt) >= String(doc.createdAt));
      if (newestFirst) pass(`admin overview is newest first (${docs.length} listing(s) checked)`);
      else fail('admin overview is NOT newest first (is the sort being applied?)');

      const one = await listingRepository.findListingsForAdmin({ state: null, limit: 1 });
      if (one.docs.length === 1 && one.bookmark) {
        const next = await listingRepository.findListingsForAdmin({ state: null, limit: 1, bookmark: one.bookmark });
        if (next.docs.length === 1 && next.docs[0]._id === docs[1]._id && next.docs[0]._id !== one.docs[0]._id) {
          pass('admin overview cursor: page 2 continues exactly where page 1 stopped');
        } else {
          fail('admin overview cursor: page 2 does not continue where page 1 stopped');
        }
      } else {
        skip('admin overview cursor: Cloudant gave no bookmark for a page of 1');
      }
    }

    const removed = (await listingRepository.findListingsForAdmin({ state: 'removed', limit: 25 })).docs;
    const byAdmin = removed.filter((doc) => doc.deletionReason === 'admin_removed');
    if (removed.some((doc) => doc.isDeleted !== true)) fail('the admin overview "removed" returned a listing that is not removed');
    else pass(`admin overview "removed" returns only removed listings (${removed.length} found)`);
    if (byAdmin.length === 0) {
      skip('admin removals: no listing removed by an admin exists yet');
    } else if (byAdmin.every((doc) => typeof doc.deletedBy === 'string' && doc.deletedBy !== '' && (doc.imageKeys || []).length === 0)) {
      pass(`${byAdmin.length} admin-removed listing(s) record who removed them and have no image keys left`);
    } else {
      fail('an admin-removed listing is missing "deletedBy" or still lists image keys');
    }
  } catch (err) {
    fail(`checks on real listings were rejected: ${describeError(err)}`);
  }

  // ---------- 4) checks on REAL report data (only if some exists) ----------
  // Reads at most 25 report documents straight from the primary index (their ids all start with "report:").
  let sample = [];
  try {
    const response = await client.postAllDocs({ db, startKey: 'report:', endKey: 'report:\ufff0', limit: 25, includeDocs: true });
    sample = ((response.result && response.result.rows) || []).map((row) => row.doc).filter((doc) => doc && doc.type === 'report');
  } catch (err) {
    fail(`could not read a sample of report documents: ${describeError(err)}`);
  }

  if (sample.length === 0) {
    skip('no report documents exist in this database yet, so the checks on real report data were skipped.');
    skip('Send a few reports through the API (and dismiss / resolve some as an admin), then run this script again.');
  } else {
    info(`checking a sample of ${sample.length} real report document(s) (at most 25; this is a sample, not the whole database)`);

    // 4a) shape and privacy of the stored documents (field NAMES only; values are never printed)
    const bad = (test) => sample.filter((doc) => !test(doc)).length;
    const report = (count, okMessage, failMessage) => (count === 0 ? pass(okMessage) : fail(`${count} sampled report(s): ${failMessage}`));

    report(bad((d) => REPORT_STATUSES.includes(d.status)), 'every sampled report has a valid status', `status is not one of ${REPORT_STATUSES.join(', ')}`);
    report(bad((d) => REPORT_TARGET_TYPES.includes(d.targetType)), 'every sampled report has a valid target type', 'target type is not listing or user');
    report(bad((d) => REPORT_REASONS.includes(d.reason)), 'every sampled report has a valid reason', 'reason is not an allowed value');
    report(
      bad((d) => d._id === `report:${d.targetType}_${d.targetId}_${d.reporterId}`),
      'every sampled report id is report:<targetType>_<targetId>_<reporterId> (one report per reporter per target intact)',
      'id does not match its target and reporter'
    );
    report(
      bad((d) => d.details === null || d.details === undefined || (typeof d.details === 'string' && d.details.length <= REPORT_LIMITS.MAX_DETAILS_LENGTH)),
      `details are never longer than ${REPORT_LIMITS.MAX_DETAILS_LENGTH} characters`,
      'details are too long or not text'
    );
    report(
      bad((d) => d.reporterId !== d.targetId && (d.targetType !== 'listing' || d.reporterId !== d.targetOwnerId)),
      'nobody reported themselves or their own listing',
      'a reporter reported themselves or their own listing'
    );
    report(
      bad((d) => {
        if (d.status === 'open') return d.resolution === null || d.resolution === undefined;
        const r = d.resolution;
        return Boolean(r) && REPORT_RESOLUTION_ACTIONS.includes(r.action) && typeof r.adminId === 'string' && Boolean(r.at) && (d.status !== 'dismissed' || r.action === 'none');
      }),
      'open reports have no resolution; decided reports record action, admin and time',
      'resolution does not match the status'
    );

    const forbidden = /contact|phone|email|password|token|secret/i;
    const leaking = new Set();
    sample.forEach((doc) => Object.keys(doc).filter((key) => forbidden.test(key)).forEach((key) => leaking.add(key)));
    if (leaking.size === 0) pass('no sampled report document stores a contact, email, password or token field');
    else fail(`report documents contain private-looking field(s): ${[...leaking].join(', ')}`);

    // 4b) the repository finds each sampled report through its indexes
    const first = sample[0];
    try {
      const byId = await reportRepository.findReportById(first._id.slice('report:'.length));
      if (byId && byId._id === first._id) pass('report by id finds a real report');
      else fail('report by id did NOT find a report that exists');

      const mine = await reportRepository.findReportsByReporter(first.reporterId);
      if (mine.some((doc) => doc._id === first._id)) pass('"reports of one student" finds a real report through its reporter');
      else fail('"reports of one student" did NOT find a report that exists');
      if (mine.length < 2) skip('newest-first order of a student\'s reports: the student has fewer than 2 reports');
      else if (mine.every((doc, i) => i === 0 || String(mine[i - 1].createdAt) >= String(doc.createdAt))) pass('a student\'s reports are newest first');
      else fail('a student\'s reports are NOT newest first');

      const queue = await reportRepository.findReportsByStatus([first.status]);
      if (queue.length >= REPORT_LIMITS.MAX_LIST_RESULTS) skip('admin queue lookup: the queue is longer than one call returns, so presence cannot be asserted');
      else if (queue.some((doc) => doc._id === first._id)) pass('the admin queue finds a real report through its status');
      else fail('the admin queue did NOT find a report that exists');
      const other = REPORT_STATUSES.find((status) => status !== first.status);
      const wrong = await reportRepository.findReportsByStatus([other], first.targetType);
      if (wrong.some((doc) => doc._id === first._id)) fail('the admin queue shows a report under the wrong status');
      else pass('the admin queue does not show a report under another status');

      const open = await reportRepository.countOpenReportsByReporter(first.reporterId);
      const openInSample = sample.filter((doc) => doc.reporterId === first.reporterId && doc.status === 'open').length;
      if (open >= openInSample) pass('the open-report count of a student is at least the open reports seen in the sample');
      else fail('the open-report count of a student is lower than the open reports seen in the sample');
    } catch (err) {
      fail(`queries with real ids were rejected: ${describeError(err)}`);
    }

    // 4c) a report that removed a listing: that listing must really be removed
    const removers = sample.filter((doc) => doc.status === 'resolved' && doc.resolution && doc.resolution.action === 'remove_listing');
    if (removers.length === 0) {
      skip('"remove listing" resolutions: none in the sample');
    } else {
      let wrong = 0;
      for (const doc of removers) {
        try {
          const listing = await listingRepository.findListingById(doc.targetId);
          if (listing && !listing.isDeleted) wrong += 1;
        } catch (err) {
          wrong += 1;
        }
      }
      if (wrong === 0) pass(`${removers.length} "remove listing" resolution(s) match a removed listing`);
      else fail(`${wrong} "remove listing" resolution(s) point at a listing that is NOT removed`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped.`);
  console.log(
    'Verified here: indexes, query acceptance, index usage (including the sorted admin overview) and (if data exists) stored-data consistency.\n' +
      'NOT verified here (needs writes; covered only by the fake-Cloudant tests): sending, dismissing and resolving reports,\n' +
      'duplicate prevention, revision conflicts, removing a listing, the admin-only rule and the API-level privacy rules.'
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(() => {
  console.log('FAIL  The check stopped because of an unexpected error.');
  process.exit(1);
});
