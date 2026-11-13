// All Cloudant access for users lives in this file (the "repository" layer).
// Nothing here knows about HTTP; it only reads and writes documents.
//
// Two kinds of documents are used:
//
//   user document      _id: "user:<random uuid>"       (the account itself)
//   email key document _id: "emailkey:<sha256 of email>" (internal; guarantees unique emails)
//
// Why an "email key"? Cloudant has no UNIQUE constraint, but it refuses to
// create two documents with the same _id. By making the _id come from the
// email, "create the key document" doubles as "reserve this email": if two
// people register the same email at the same moment, only one create succeeds.
// The email itself never appears in any document ID (only its hash), and no
// Mango index is needed for login or registration.
//
// The low-level helpers (getDoc, putDoc, run, error handling) are shared with the
// other repositories and live in base.repository.js.

const crypto = require('crypto');

const ApiError = require('../utils/ApiError');
const { run, getDoc, putDoc } = require('./base.repository');

const USER_PREFIX = 'user:';
const EMAIL_KEY_PREFIX = 'emailkey:';
const SAFE_USER_ID = /^[A-Za-z0-9-]{1,64}$/;

// ---------- small helpers ----------

function toDocId(userId) {
  return `${USER_PREFIX}${userId}`;
}

function emailKeyId(email) {
  return EMAIL_KEY_PREFIX + crypto.createHash('sha256').update(email).digest('hex');
}

// ---------- email reservation ----------

// Tries to reserve an email for a new user.
// Returns { claimed: true } or { claimed: false, existing: { userId, rev, createdAt } }.
async function claimEmail(email, userId) {
  const docId = emailKeyId(email);

  // Two attempts: the second only matters if the key vanished between our two calls.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const created = await putDoc(docId, { type: 'emailKey', userId, createdAt: new Date().toISOString() });
    if (created.ok) {
      return { claimed: true };
    }
    const existing = await getDoc(docId);
    if (existing) {
      return {
        claimed: false,
        existing: { userId: existing.userId, rev: existing._rev, createdAt: existing.createdAt },
      };
    }
  }
  return { claimed: false, existing: null };
}

// Takes over a leftover key whose account was never created. Returns true on success.
async function repointEmail(email, userId, rev) {
  const result = await putDoc(
    emailKeyId(email),
    { type: 'emailKey', userId, createdAt: new Date().toISOString() },
    rev
  );
  return result.ok;
}

// Best-effort cleanup if creating the user failed after reserving the email.
// Never throws: a failed cleanup is repaired later by the "leftover key" rule.
async function releaseEmail(email, userId) {
  try {
    const docId = emailKeyId(email);
    const existing = await getDoc(docId);
    if (existing && existing.userId === userId) {
      await run((client, db) => client.deleteDocument({ db, docId, rev: existing._rev }));
    }
  } catch (err) {
    console.error('[database] Could not release a reserved email (it will be cleaned up automatically later).');
  }
}

// ---------- users ----------

async function insertUser(userId, userBody) {
  const result = await putDoc(toDocId(userId), userBody);
  if (!result.ok) {
    throw new ApiError(409, 'CONFLICT', 'Something went wrong while creating the account. Please try again.');
  }
}

// Returns the raw user document (includes passwordHash; callers must serialize!) or null.
async function findUserById(userId) {
  if (typeof userId !== 'string' || !SAFE_USER_ID.test(userId)) {
    return null;
  }
  const doc = await getDoc(toDocId(userId));
  return doc && doc.type === 'user' ? doc : null;
}

async function findUserByEmail(email) {
  const key = await getDoc(emailKeyId(email));
  if (!key || typeof key.userId !== 'string') {
    return null;
  }
  return findUserById(key.userId);
}

// Saves a changed user document. `userDoc` must be the document as read
// (including _id and _rev). Cloudant only accepts the write if _rev is still
// the latest version, so a concurrent change can never be overwritten silently.
// Returns true if saved, false on a revision conflict (caller should re-read and retry).
async function updateUser(userDoc) {
  const { _id, _rev, ...body } = userDoc;
  const result = await putDoc(_id, body, _rev);
  return result.ok;
}

module.exports = {
  claimEmail,
  repointEmail,
  releaseEmail,
  insertUser,
  findUserById,
  findUserByEmail,
  updateUser,
};
