// Read-only check of the Task 9 REQUEST queries and indexes against your REAL IBM Cloudant database.
// Run it yourself with:  npm run db:verify-requests
//
// WHY: the automated tests use an in-memory fake of Cloudant. It cannot prove that the real
// Cloudant (a) has the request indexes, (b) accepts the queries request.repository.js sends, and
// (c) answers them from those indexes instead of scanning the whole database. This script asks
// the real Cloudant exactly that.
//
// IT ONLY READS. It sends GET /_index, POST /_explain, POST /_find, GET /<doc> and POST /_all_docs.
// It never creates, changes or deletes anything, and it never creates test users or requests.
// Run "npm run db:setup" first so the request indexes exist.
//
// What it does NOT prove (these need writes, so they are covered only by the fake-Cloudant tests):
// creating, accepting, declining, cancelling or completing a request, duplicate prevention (two
// documents with the same _id), revision conflicts, and the API-level contact privacy rule.
//
// It prints only our own messages: counts and PASS / FAIL / SKIP lines. It never prints credentials,
// ids, names, messages or contact details, and never raw Cloudant errors.

const fs = require('fs');
const path = require('path');

const config = require('../src/config/env');
const { getClient } = require('../src/config/cloudant');
const { checkConnection } = require('../src/config/database');
const { REQUEST_STATUSES } = require('../src/config/constants');
const requestRepository = require('../src/repositories/request.repository');
const listingRepository = require('../src/repositories/listing.repository');
const userRepository = require('../src/repositories/user.repository');

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

// A query id that cannot belong to anyone (letters and dashes only, so the repository accepts it).
const PROBE = 'verify-probe';

// The request indexes are READ from src/config/database.js (the INDEXES list that
// "npm run db:setup" uses), so this script can never drift away from the real definitions.
const EXPECTED_INDEX_NAMES = ['request-by-owner', 'request-by-requester', 'request-by-listing'];

function readIndexDefinitions() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'database.js'), 'utf8');
  const definitions = {};
  const pattern = /\{\s*name:\s*'(request-[a-z-]+)',\s*fields:\s*\[([^\]]*)\]\s*\}/g;
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

  // ---------- 1) do the request indexes exist, with the fields database.js defines? ----------
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

  // ---------- 2) does Cloudant accept the queries the repository really sends? ----------
  // The repository's own functions are called with an id that cannot exist. Each Cloudant
  // _find call they make is captured, then the SAME selector is sent to _explain to learn which
  // index Cloudant would use. Nothing is written; results are expected to be empty.
  const captured = [];
  const originalPostFind = client.postFind.bind(client);
  client.postFind = (params) => {
    captured.push(params);
    return originalPostFind(params);
  };

  const queries = [
    ['requests received, no status filter', 'request-by-owner', () => requestRepository.findReceivedRequests(PROBE)],
    ['requests received, status = pending', 'request-by-owner', () => requestRepository.findReceivedRequests(PROBE, ['pending'])],
    [
      'requests received, several statuses ($in)',
      'request-by-owner',
      () => requestRepository.findReceivedRequests(PROBE, ['pending', 'accepted']),
    ],
    ['requests sent, no status filter', 'request-by-requester', () => requestRepository.findSentRequests(PROBE)],
    ['requests sent, status = declined', 'request-by-requester', () => requestRepository.findSentRequests(PROBE, ['declined'])],
    [
      'requests sent, several statuses ($in)',
      'request-by-requester',
      () => requestRepository.findSentRequests(PROBE, ['pending', 'accepted']),
    ],
    ['pending requests of one listing', 'request-by-listing', () => requestRepository.findPendingRequestsForListing(PROBE)],
  ];

  for (const [label, expectedIndex, run] of queries) {
    captured.length = 0;
    let docs;
    try {
      docs = await run();
    } catch (err) {
      fail(`${label}: rejected - ${describeError(err)}`);
      continue;
    }
    if (docs.length > 0) {
      fail(`${label}: returned ${docs.length} request(s) for an id that cannot exist (the selector is not being applied)`);
      continue;
    }
    if (captured.length !== 1) {
      fail(`${label}: expected exactly one _find call but saw ${captured.length}`);
      continue;
    }

    // Which index would Cloudant use for exactly this query?
    const { selector, limit } = captured[0];
    try {
      const explained = await client.postExplain({ db, selector, limit });
      const used = explained.result && explained.result.index;
      if (used && used.name === expectedIndex) {
        pass(`${label}: accepted, answered from index "${expectedIndex}" (limit ${limit})`);
      } else {
        fail(`${label}: accepted, but Cloudant would use "${used ? used.name : 'no index'}" instead of "${expectedIndex}" (a slower scan)`);
      }
    } catch (err) {
      fail(`${label}: the query plan could not be read (POST /_explain): ${describeError(err)}`);
    }
  }
  client.postFind = originalPostFind;

  // One request by id: a plain document read. An id that cannot exist must come back as "none", not an error.
  try {
    const none = await requestRepository.findRequestById(`${PROBE}_${PROBE}`);
    if (none === null) pass('request by id: a missing request is answered with "not found" (no error)');
    else fail('request by id: returned a document for an id that cannot exist');
  } catch (err) {
    fail(`request by id: rejected - ${describeError(err)}`);
  }

  // The two bulk lookups behind the request lists (listing + people names).
  try {
    const listings = await listingRepository.findListingsByIds([PROBE]);
    const users = await userRepository.findUsersByIds([PROBE]);
    if (listings instanceof Map && users instanceof Map && listings.size === 0 && users.size === 0) {
      pass('bulk lookups of listings and users (_all_docs with keys) are accepted');
    } else {
      fail('bulk lookups returned something for ids that cannot exist');
    }
  } catch (err) {
    fail(`bulk lookups: rejected - ${describeError(err)}`);
  }

  // ---------- 3) checks on REAL request data (only if some exists) ----------
  // Reads at most 25 request documents straight from the primary index (their ids all start with "request:").
  let sample = [];
  try {
    const response = await client.postAllDocs({ db, startKey: 'request:', endKey: 'request:\ufff0', limit: 25, includeDocs: true });
    sample = ((response.result && response.result.rows) || []).map((row) => row.doc).filter((doc) => doc && doc.type === 'request');
  } catch (err) {
    fail(`could not read a sample of request documents: ${describeError(err)}`);
  }

  if (sample.length === 0) {
    skip('no request documents exist in this database yet, so the checks on real request data were skipped.');
    skip('Create a few requests through the API (send, accept, decline, cancel) and run this script again.');
  } else {
    info(`checking a sample of ${sample.length} real request document(s) (at most 25; this is a sample, not the whole database)`);

    // 3a) shape and privacy of the stored documents (field NAMES only; values are never printed)
    const badStatus = sample.filter((doc) => !REQUEST_STATUSES.includes(doc.status));
    if (badStatus.length === 0) pass('every sampled request has a valid status');
    else fail(`${badStatus.length} sampled request(s) have a status that is not one of: ${REQUEST_STATUSES.join(', ')}`);

    const badId = sample.filter((doc) => doc._id !== `request:${doc.listingId}_${doc.requesterId}`);
    if (badId.length === 0) pass('every sampled request id is request:<listingId>_<requesterId> (duplicate prevention intact)');
    else fail(`${badId.length} sampled request(s) have an id that does not match their listingId and requesterId`);

    const forbidden = /contact|phone|email|password|token|secret/i;
    const leaking = new Set();
    sample.forEach((doc) => Object.keys(doc).filter((key) => forbidden.test(key)).forEach((key) => leaking.add(key)));
    if (leaking.size === 0) pass('no sampled request document stores a contact, email, password or token field');
    else fail(`request documents contain private-looking field(s): ${[...leaking].join(', ')}`);

    // 3b) the repository finds each sampled request through its indexes, in the right order
    const first = sample[0];
    try {
      const byId = await requestRepository.findRequestById(first._id.slice('request:'.length));
      if (byId && byId._id === first._id) pass('request by id finds a real request');
      else fail('request by id did NOT find a request that exists');

      const received = await requestRepository.findReceivedRequests(first.ownerId);
      if (received.some((doc) => doc._id === first._id)) pass('"received" query finds a real request through its owner');
      else fail('"received" query did NOT find a request that exists');
      const newestFirst = received.every((doc, i) => i === 0 || String(received[i - 1].createdAt) >= String(doc.createdAt));
      if (received.length < 2) skip('newest-first order of "received": the owner has fewer than 2 requests');
      else if (newestFirst) pass('"received" results are newest first');
      else fail('"received" results are NOT newest first');

      const sent = await requestRepository.findSentRequests(first.requesterId);
      if (sent.some((doc) => doc._id === first._id)) pass('"sent" query finds a real request through its requester');
      else fail('"sent" query did NOT find a request that exists');

      const sameStatus = await requestRepository.findReceivedRequests(first.ownerId, [first.status]);
      const otherStatus = REQUEST_STATUSES.find((status) => status !== first.status);
      const wrongStatus = await requestRepository.findReceivedRequests(first.ownerId, [otherStatus]);
      if (sameStatus.some((doc) => doc._id === first._id) && !wrongStatus.some((doc) => doc._id === first._id)) {
        pass('the status filter keeps matching requests and drops the others');
      } else {
        fail('the status filter does not behave as expected');
      }

      const pending = await requestRepository.findPendingRequestsForListing(first.listingId);
      const isListed = pending.some((doc) => doc._id === first._id);
      if (isListed === (first.status === 'pending')) pass('"pending requests of a listing" matches the request\'s real status');
      else fail('"pending requests of a listing" disagrees with the request\'s real status');
    } catch (err) {
      fail(`queries with real ids were rejected: ${describeError(err)}`);
    }

    // 3c) bulk lookups with real ids must work (deleted listings or users are simply missing)
    try {
      const listings = await listingRepository.findListingsByIds(sample.map((doc) => doc.listingId));
      const users = await userRepository.findUsersByIds(sample.flatMap((doc) => [doc.ownerId, doc.requesterId]));
      pass(`bulk lookups with real ids work (${listings.size} listing(s) and ${users.size} user(s) found)`);
    } catch (err) {
      fail(`bulk lookups with real ids: rejected - ${describeError(err)}`);
    }

    // 3d) the accept rule on real data: an accepted request means "its" listing is reserved for it
    const accepted = sample.filter((doc) => doc.status === 'accepted' || doc.status === 'completed');
    if (accepted.length === 0) {
      skip('accepted-request consistency: no accepted or completed request in the sample');
    } else {
      let consistent = 0;
      let removed = 0;
      let broken = 0;
      for (const doc of accepted) {
        try {
          const listing = await listingRepository.findListingById(doc.listingId);
          const requestId = doc._id.slice('request:'.length);
          if (!listing || listing.isDeleted) removed += 1;
          else if (
            listing.acceptedRequestId === requestId &&
            listing.status === (doc.status === 'accepted' ? 'reserved' : 'completed')
          ) {
            consistent += 1;
          } else broken += 1;
        } catch (err) {
          broken += 1;
        }
      }
      if (broken === 0) pass(`accepted/completed requests match their listing (${consistent} consistent, ${removed} listing(s) removed)`);
      else fail(`${broken} accepted/completed request(s) do NOT match their listing (reserved for this request / completed)`);

      const perListing = new Map();
      accepted
        .filter((doc) => doc.status === 'accepted')
        .forEach((doc) => perListing.set(doc.listingId, (perListing.get(doc.listingId) || 0) + 1));
      if ([...perListing.values()].every((count) => count === 1)) pass('no listing has more than one accepted request');
      else fail('a listing has more than one accepted request');
    }
  }

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped.`);
  console.log(
    'Verified here: indexes, query acceptance, index usage and (if data exists) stored-data consistency.\n' +
      'NOT verified here (needs writes; covered only by the fake-Cloudant tests): creating, accepting, declining, cancelling\n' +
      'and completing requests, duplicate prevention, revision conflicts and the API-level contact privacy rule.'
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(() => {
  console.log('FAIL  The check stopped because of an unexpected error.');
  process.exit(1);
});
