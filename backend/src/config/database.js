// Database connection checks and one-time database setup for IBM Cloudant.
//
// Every function here returns a result object instead of throwing, so a
// Cloudant problem can never crash the Express server. Result shape:
//   { ok: true/false, status: '<CODE>', message: '<plain English>', database: '<name>' }
//
// Messages are written by us and never include credentials or raw SDK errors.

const config = require('./env');
const { isConfigured, getClient } = require('./cloudant');

const STATUS = {
  CONNECTED: 'CONNECTED',
  NOT_CONFIGURED: 'DATABASE_NOT_CONFIGURED',
  INVALID_URL: 'DATABASE_INVALID_URL',
  INVALID_NAME: 'DATABASE_INVALID_NAME',
  CLIENT_ERROR: 'DATABASE_CLIENT_ERROR',
  AUTH_FAILED: 'DATABASE_AUTH_FAILED',
  NOT_FOUND: 'DATABASE_NOT_FOUND',
  NETWORK_ERROR: 'DATABASE_NETWORK_ERROR',
  SERVICE_ERROR: 'DATABASE_SERVICE_ERROR',
  UNKNOWN: 'DATABASE_ERROR',
};

// Stop waiting after 10 seconds so the health check can never hang.
const REQUEST_TIMEOUT_MS = 10000;

// Cloudant database names: start with a lowercase letter, then only
// lowercase letters, digits and the characters _ $ ( ) + - /
const DATABASE_NAME_PATTERN = /^[a-z][a-z0-9_$()+/-]*$/;

function fail(status, message, extra = {}) {
  return { ok: false, status, message, database: config.cloudant.database, ...extra };
}

// Rejects if the promise takes longer than `ms`.
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error('Request timed out.');
      error.code = 'ETIMEDOUT';
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Turns a raw SDK/network error into one of our friendly results.
function classifyError(err) {
  const dbName = config.cloudant.database;

  // The SDK puts the HTTP status (401, 404, ...) on the error.
  let httpStatus;
  if (err && Number.isInteger(err.status)) {
    httpStatus = err.status;
  } else if (err && Number.isInteger(err.code)) {
    httpStatus = err.code;
  }
  const extra = { httpStatus, errorCode: typeof (err && err.code) === 'string' ? err.code : undefined };

  if (httpStatus === 400 || httpStatus === 401 || httpStatus === 403) {
    return fail(
      STATUS.AUTH_FAILED,
      'Cloudant rejected the credentials. Check that CLOUDANT_APIKEY is correct and that its service credentials have access to this Cloudant instance.',
      extra
    );
  }

  if (httpStatus === 404) {
    return fail(
      STATUS.NOT_FOUND,
      `The database "${dbName}" was not found. Run "npm run db:setup" to create it. (If you are sure it exists, double-check CLOUDANT_URL.)`,
      extra
    );
  }

  if (httpStatus === 429) {
    return fail(
      STATUS.SERVICE_ERROR,
      'Cloudant says too many requests were made (rate limit of your plan). Wait a moment and try again.',
      extra
    );
  }

  if (httpStatus >= 500) {
    return fail(STATUS.SERVICE_ERROR, 'Cloudant reported a problem on its side. Try again in a few minutes.', extra);
  }

  if (httpStatus) {
    return fail(STATUS.UNKNOWN, `Cloudant returned an unexpected response (HTTP ${httpStatus}).`, extra);
  }

  // No HTTP status at all means we never got a response: a network problem.
  return fail(
    STATUS.NETWORK_ERROR,
    'Could not reach Cloudant. Check your internet connection and that CLOUDANT_URL is correct.',
    extra
  );
}

// Checks configuration and builds the client. Returns { client, dbName } or { failure }.
function prepare() {
  const dbName = config.cloudant.database;

  if (!isConfigured()) {
    return {
      failure: fail(
        STATUS.NOT_CONFIGURED,
        'Cloudant is not configured yet. Add CLOUDANT_URL and CLOUDANT_APIKEY to your .env file, then restart the server.'
      ),
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(config.cloudant.url);
  } catch (err) {
    parsedUrl = null;
  }
  if (!parsedUrl || (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:')) {
    return {
      failure: fail(
        STATUS.INVALID_URL,
        'CLOUDANT_URL is not a valid web address. It should look like https://<your-instance>.cloudantnosqldb.appdomain.cloud'
      ),
    };
  }

  if (!DATABASE_NAME_PATTERN.test(dbName)) {
    return {
      failure: fail(
        STATUS.INVALID_NAME,
        `CLOUDANT_DATABASE "${dbName}" is not allowed. Use lowercase letters, digits and _ $ ( ) + - / only, starting with a letter.`
      ),
    };
  }

  try {
    return { client: getClient(), dbName };
  } catch (err) {
    return {
      failure: fail(
        STATUS.CLIENT_ERROR,
        'Could not start the Cloudant client. Make sure you ran "npm install @ibm-cloud/cloudant" and that you use Node.js 22 or newer.',
        { errorCode: typeof err.code === 'string' ? err.code : undefined }
      ),
    };
  }
}

// Read-only check: can we reach Cloudant AND open the configured database?
// Never creates or changes anything.
async function checkConnection() {
  const prepared = prepare();
  if (prepared.failure) {
    return prepared.failure;
  }
  const { client, dbName } = prepared;

  try {
    await withTimeout(client.getDatabaseInformation({ db: dbName }), REQUEST_TIMEOUT_MS);
    return {
      ok: true,
      status: STATUS.CONNECTED,
      message: `Connected to IBM Cloudant. Database "${dbName}" is accessible.`,
      database: dbName,
    };
  } catch (err) {
    return classifyError(err);
  }
}

// Creates the database ONLY if it does not exist. Never deletes or overwrites.
// Run on demand with "npm run db:setup" (not on every server start).
async function setupDatabase() {
  const prepared = prepare();
  if (prepared.failure) {
    return prepared.failure;
  }
  const { client, dbName } = prepared;

  // 1) Does it already exist?
  const existing = await withTimeout(client.getDatabaseInformation({ db: dbName }), REQUEST_TIMEOUT_MS)
    .then(() => ({ exists: true }))
    .catch((err) => ({ exists: false, result: classifyError(err) }));

  if (existing.exists) {
    return {
      ok: true,
      created: false,
      status: STATUS.CONNECTED,
      message: `Database "${dbName}" already exists. Nothing was changed.`,
      database: dbName,
    };
  }

  // Any problem other than "not found" (bad key, no network...) stops here.
  if (existing.result.status !== STATUS.NOT_FOUND) {
    return existing.result;
  }

  // 2) It does not exist: create it.
  try {
    await withTimeout(client.putDatabase({ db: dbName }), REQUEST_TIMEOUT_MS);
    return {
      ok: true,
      created: true,
      status: STATUS.CONNECTED,
      message: `Database "${dbName}" was created successfully.`,
      database: dbName,
    };
  } catch (err) {
    // 412 = it was created by someone else a moment ago. That's fine, and nothing was overwritten.
    if (err && err.status === 412) {
      return {
        ok: true,
        created: false,
        status: STATUS.CONNECTED,
        message: `Database "${dbName}" already exists. Nothing was changed.`,
        database: dbName,
      };
    }
    if (err && err.status === 403) {
      return fail(
        STATUS.AUTH_FAILED,
        'Your credentials can read from Cloudant but are not allowed to create a database. Use credentials with the Manager role, or create the database in the IBM Cloud dashboard.',
        { httpStatus: 403 }
      );
    }
    return classifyError(err);
  }
}

// The indexes the queries need (Cloudant answers sorted queries only when a matching index exists).
// The two "listing-feed-*" indexes serve public browsing (GET /api/v1/listings):
// fields are type, isDeleted, status (fixed by the selector) + the sort field.
// Cloudant only uses a json index when the query mentions EVERY field of the index, so the
// browse query adds one condition on the sort field (see SORTS in listing.repository.js).
// A database created before Task 8 needs "npm run db:setup" again to get the two feed indexes.
const INDEXES = [
  { name: 'listing-by-owner', fields: ['type', 'ownerId', 'isDeleted'] }, // "my listings"
  { name: 'listing-feed-created', fields: ['type', 'isDeleted', 'status', 'createdAt'] }, // sort=newest|oldest
  { name: 'listing-feed-price', fields: ['type', 'isDeleted', 'status', 'price'] }, // sort=price_asc|price_desc
];

// Creates the indexes the queries need. Safe to run repeatedly (Cloudant answers
// "exists" for an index that is already there); never deletes anything.
async function ensureIndexes() {
  const prepared = prepare();
  if (prepared.failure) {
    return prepared.failure;
  }
  const { client, dbName } = prepared;

  try {
    for (const { name, fields } of INDEXES) {
      await withTimeout(
        client.postIndex({ db: dbName, ddoc: name, name, type: 'json', index: { fields } }),
        REQUEST_TIMEOUT_MS
      );
    }
    return { ok: true, status: STATUS.CONNECTED, message: 'Indexes are in place.', database: dbName };
  } catch (err) {
    return classifyError(err);
  }
}

// Logs the connection state at server start. Never throws, never blocks startup.
async function logConnectionStatus() {
  try {
    const result = await checkConnection();
    if (result.ok) {
      console.log(`[database] ${result.message}`);
    } else {
      console.warn(`[database] ${result.message}`);
      console.warn('[database] The server is still running; only database features are unavailable.');
    }
  } catch (err) {
    console.warn('[database] Could not check the Cloudant connection.');
  }
}

module.exports = { STATUS, checkConnection, setupDatabase, ensureIndexes, logConnectionStatus };
