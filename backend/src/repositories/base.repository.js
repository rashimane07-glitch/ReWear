// Shared low-level Cloudant helpers used by every repository
// (user.repository.js, listing.repository.js, ...).
// Nothing here knows about HTTP or about a specific kind of document.

const config = require('../config/env');
const { getClient } = require('../config/cloudant');
const ApiError = require('../utils/ApiError');
const withTimeout = require('../utils/withTimeout');

const REQUEST_TIMEOUT_MS = 15000;

// Cloudant answers 404 both for "no such document" and "no such database".
function isMissingDatabase(err) {
  const text = `${(err && err.message) || ''} ${JSON.stringify((err && err.body) || '')}`;
  return Boolean(err) && err.status === 404 && /database does not exist/i.test(text);
}

function isDocumentNotFound(err) {
  return Boolean(err) && err.status === 404 && !isMissingDatabase(err);
}

// Turns ANY failure into a safe error for the client.
// We log only the HTTP status / error code, never the raw error
// (SDK errors can contain request headers with access tokens).
function toApiError(err) {
  if (err instanceof ApiError) {
    return err;
  }
  if (err && err.code === 'CLOUDANT_NOT_CONFIGURED') {
    return new ApiError(
      503,
      'DATABASE_NOT_CONFIGURED',
      'The database is not configured on the server yet. Please try again later.'
    );
  }
  if (isMissingDatabase(err)) {
    console.error('[database] The Cloudant database does not exist. Run "npm run db:setup".');
    return new ApiError(503, 'DATABASE_NOT_FOUND', 'The database has not been set up yet. Please try again later.');
  }
  const status = err && Number.isInteger(err.status) ? `HTTP ${err.status}` : 'no HTTP status';
  const code = err && typeof err.code === 'string' ? `, ${err.code}` : '';
  console.error(`[database] Cloudant request failed (${status}${code}).`);
  return new ApiError(503, 'DATABASE_UNAVAILABLE', 'The database is temporarily unavailable. Please try again later.');
}

// Runs one Cloudant operation with the shared client and the configured database.
async function run(operation) {
  let client;
  try {
    client = getClient();
  } catch (err) {
    throw toApiError(err);
  }
  return withTimeout(operation(client, config.cloudant.database), REQUEST_TIMEOUT_MS);
}

// Reads a document. Returns null if it does not exist.
async function getDoc(docId) {
  try {
    const response = await run((client, db) => client.getDocument({ db, docId }));
    return response.result;
  } catch (err) {
    if (isDocumentNotFound(err)) {
      return null;
    }
    throw toApiError(err);
  }
}

// Writes a document. Pass `rev` to update an existing one.
// Returns { ok: true } or { ok: false } when someone else got there first (409).
async function putDoc(docId, document, rev) {
  try {
    const params = rev ? { docId, document, rev } : { docId, document };
    await run((client, db) => client.putDocument({ db, ...params }));
    return { ok: true };
  } catch (err) {
    if (err && err.status === 409) {
      return { ok: false };
    }
    throw toApiError(err);
  }
}

module.exports = { run, getDoc, putDoc, toApiError };
