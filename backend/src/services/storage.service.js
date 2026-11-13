// Local image storage: images are saved as files under backend/uploads/ and shown
// through the public /uploads URL (see app.js). Only the image KEYS are saved in
// Cloudant, never the image bytes.
//
// A key looks like:   listings/<listingId>/<imageId>.jpg
//   file on disk:     <uploadsDir>/listings/<listingId>/<imageId>.jpg
//   public URL:       <BACKEND_URL>/uploads/listings/<listingId>/<imageId>.jpg
//
// SAFETY: every key is checked against a strict pattern AND the final path is
// verified to be inside the uploads folder, so nothing can be written to, or
// deleted from, anywhere else ("path traversal").
//
// Failures become safe errors; file paths and system details never reach the client.

const fs = require('fs/promises');
const path = require('path');

const config = require('../config/env');
const ApiError = require('../utils/ApiError');

// listings/<listingId>/<imageId>.<jpg|png|webp>  (IDs: letters, digits, dashes only)
const KEY_PATTERN = /^listings\/[A-Za-z0-9-]{1,64}\/[A-Za-z0-9-]{1,64}\.(?:jpg|png|webp)$/;

// Read at call time (not cached) so the folder is always the configured one.
function uploadsRoot() {
  return path.resolve(config.storage.uploadsDir);
}

// Turns a key into an absolute file path INSIDE the uploads folder, or throws.
function resolveKey(key) {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong on the server.');
  }
  const root = uploadsRoot();
  const fullPath = path.resolve(root, key);
  if (!fullPath.startsWith(root + path.sep)) {
    throw new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong on the server.');
  }
  return fullPath;
}

function toStorageError(err) {
  if (err instanceof ApiError) {
    return err;
  }
  // Log only the error code (e.g. ENOSPC, EACCES), never the raw error or paths.
  const code = err && typeof err.code === 'string' ? err.code : 'unknown error';
  console.error(`[storage] Local storage operation failed (${code}).`);
  return new ApiError(503, 'STORAGE_UNAVAILABLE', 'Image storage is temporarily unavailable. Please try again later.');
}

// Saves one image under `key`. Throws a safe ApiError on failure.
// (`contentType` is accepted for compatibility but not needed: the type is
// decided by the file extension when the file is served.)
async function uploadImage({ key, buffer }) {
  const fullPath = resolveKey(key);
  try {
    // Two attempts: a rollback running at the same moment may remove the (empty)
    // listing folder between our mkdir and our write.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        // flag "wx": fail instead of overwriting if the file somehow already exists
        await fs.writeFile(fullPath, buffer, { flag: 'wx' });
        return;
      } catch (err) {
        if (attempt === 2 || !err || err.code !== 'ENOENT') {
          throw err;
        }
      }
    }
  } catch (err) {
    throw toStorageError(err);
  }
}

// Returns the public link for an image. (Name kept from the cloud version; links
// are plain and permanent now, not signed or expiring.)
function getSignedUrl(key) {
  resolveKey(key); // validates the key
  return `${config.storage.backendUrl}/uploads/${key}`;
}

// Best-effort cleanup (e.g. after a failed save). NEVER throws, and can only ever
// delete image files inside the uploads folder; anything else is skipped.
async function deleteImages(keys) {
  if (!Array.isArray(keys) || keys.length === 0) {
    return;
  }

  let problems = 0;
  await Promise.all(
    keys.map(async (key) => {
      let fullPath;
      try {
        fullPath = resolveKey(key);
      } catch (err) {
        problems += 1; // not a valid key: refuse to touch the disk
        return;
      }
      try {
        await fs.unlink(fullPath);
      } catch (err) {
        if (!err || err.code !== 'ENOENT') {
          problems += 1; // "already gone" is fine; anything else is a problem
          return;
        }
      }
      try {
        await fs.rmdir(path.dirname(fullPath)); // removes the listing folder only if now empty
      } catch (err) {
        // not empty (or already gone): leave it
      }
    })
  );

  if (problems > 0) {
    console.error('[storage] Some images could not be deleted (unused files may remain in the uploads folder).');
  }
}

// Logged once at startup: makes sure the uploads folder exists and is writable.
// Never throws and never stops the server.
async function logStorageStatus() {
  const root = uploadsRoot();
  try {
    await fs.mkdir(root, { recursive: true });
    await fs.access(root, fs.constants.W_OK);
    console.log(`[storage] Local image storage ready: ${root}`);
    console.log(`[storage] Image links start with: ${config.storage.backendUrl}/uploads/`);
  } catch (err) {
    const code = err && typeof err.code === 'string' ? err.code : 'unknown error';
    console.warn(`[storage] The uploads folder is not usable (${code}): ${root}`);
    console.warn('[storage] The server is still running; only image uploads are unavailable.');
  }
}

module.exports = { uploadImage, getSignedUrl, deleteImages, logStorageStatus };
