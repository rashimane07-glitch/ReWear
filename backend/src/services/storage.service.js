// Image storage for listing photos. Two places can hold an image:
//
//  1. ImageKit (cloud) - used for NEW uploads when the three IMAGEKIT_* settings are filled in.
//     Cloudant stores an object describing the file:
//       { provider: 'imagekit', key, fileId, url, filePath, width, height, size, uploadedAt }
//     `url` is the public ImageKit link; `fileId` is what ImageKit needs to delete the file.
//
//  2. The local uploads folder (backend/uploads/) - used for the older demo images, and for new
//     uploads when ImageKit is not configured (tests, teammates without keys).
//     Cloudant stores just the key string:   listings/<listingId>/<imageId>.jpg
//       file on disk:     <uploadsDir>/listings/<listingId>/<imageId>.jpg
//       public URL:       <BACKEND_URL>/uploads/listings/<listingId>/<imageId>.jpg
//
// A listing's `imageKeys` array can mix both kinds, so every function here accepts either.
// The image bytes are never stored in Cloudant.
//
// SAFETY: local keys are checked against a strict pattern AND the final path is verified to be
// inside the uploads folder, so nothing can be written to, or deleted from, anywhere else.
// Failures become safe errors; keys, paths and system details never reach the client.

const fs = require('fs/promises');
const path = require('path');

const ImageKit = require('@imagekit/nodejs').default;
const { toFile } = require('@imagekit/nodejs');

const config = require('../config/env');
const ApiError = require('../utils/ApiError');

// listings/<listingId>/<imageId>.<jpg|png|webp>  (IDs: letters, digits, dashes only)
const KEY_PATTERN = /^listings\/[A-Za-z0-9-]{1,64}\/[A-Za-z0-9-]{1,64}\.(?:jpg|png|webp)$/;

// ---------- ImageKit ----------

let imageKitClient = null;

// True only when all three ImageKit settings are present.
function isImageKitConfigured() {
  const { publicKey, privateKey, urlEndpoint } = config.imagekit;
  return Boolean(publicKey && privateKey && urlEndpoint);
}

// Created once, on first use. Only the PRIVATE key is needed on the server.
function getImageKitClient() {
  if (!imageKitClient) {
    imageKitClient = new ImageKit({ privateKey: config.imagekit.privateKey });
  }
  return imageKitClient;
}

// Tests only: replace the real ImageKit client with a fake one (null = back to the real one).
function setImageKitClientForTests(client) {
  imageKitClient = client;
}

function isImageKitEntry(entry) {
  return Boolean(entry) && typeof entry === 'object' && entry.provider === 'imagekit';
}

// ImageKit folder for one listing, e.g. /rewear/listings/<listingId>
function imageKitFolder(key) {
  const base = config.imagekit.folder.replace(/\/+$/, '');
  return `${base}/${path.posix.dirname(key)}`.replace(/^\/*/, '/');
}

async function uploadToImageKit({ key, buffer }) {
  const fileName = path.posix.basename(key); // <imageId>.jpg (already unique)
  const result = await getImageKitClient().files.upload({
    file: await toFile(buffer, fileName),
    fileName,
    folder: imageKitFolder(key),
    useUniqueFileName: false, // our file name is already a random UUID
    isPrivateFile: false, // listing photos are public, like on the website
  });
  if (!result || typeof result.fileId !== 'string' || typeof result.url !== 'string') {
    throw new Error('ImageKit returned an incomplete upload response.');
  }
  // This object is what gets saved in Cloudant (references and metadata only).
  return {
    provider: 'imagekit',
    key,
    fileId: result.fileId,
    url: result.url,
    filePath: result.filePath || null,
    width: typeof result.width === 'number' ? result.width : null,
    height: typeof result.height === 'number' ? result.height : null,
    size: typeof result.size === 'number' ? result.size : buffer.length,
    uploadedAt: new Date().toISOString(),
  };
}

// ---------- Local uploads folder ----------

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
  // Log only a short code (e.g. ENOSPC, or an HTTP status from ImageKit), never keys, paths or messages.
  let code = 'unknown error';
  if (err && typeof err.code === 'string') {
    code = err.code;
  } else if (err && typeof err.status === 'number') {
    code = `HTTP ${err.status}`;
  }
  console.error(`[storage] Image storage operation failed (${code}).`);
  return new ApiError(503, 'STORAGE_UNAVAILABLE', 'Image storage is temporarily unavailable. Please try again later.');
}

// Always saves to the local uploads folder (used for local uploads and by the demo-image
// restore script, which must never send the demo photos to ImageKit). Returns the key.
async function saveLocalImage({ key, buffer }) {
  const fullPath = resolveKey(key);
  try {
    // Two attempts: a rollback running at the same moment may remove the (empty)
    // listing folder between our mkdir and our write.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        // flag "wx": fail instead of overwriting if the file somehow already exists
        await fs.writeFile(fullPath, buffer, { flag: 'wx' });
        return key;
      } catch (err) {
        if (attempt === 2 || !err || err.code !== 'ENOENT') {
          throw err;
        }
      }
    }
  } catch (err) {
    throw toStorageError(err);
  }
  return key;
}

// ---------- Used by the rest of the app ----------

// Saves one new image and returns what must be stored in the listing's `imageKeys`:
//   ImageKit configured  -> the ImageKit object described at the top of this file
//   otherwise            -> the local key string
// (`contentType` is accepted for compatibility; the type comes from the file extension.)
async function uploadImage({ key, buffer }) {
  resolveKey(key); // same strict key rules for both places
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Image is empty.');
  }
  if (!isImageKitConfigured()) {
    return saveLocalImage({ key, buffer });
  }
  try {
    return await uploadToImageKit({ key, buffer });
  } catch (err) {
    throw toStorageError(err);
  }
}

// Returns the public link for one stored image (ImageKit object or local key).
// (Name kept from the earlier cloud version; links are plain and permanent, not signed.)
function getSignedUrl(entry) {
  if (isImageKitEntry(entry)) {
    if (typeof entry.url !== 'string' || !/^https:\/\//.test(entry.url)) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong on the server.');
    }
    return entry.url;
  }
  resolveKey(entry); // validates the local key
  return `${config.storage.backendUrl}/uploads/${entry}`;
}

// The image id shown to the frontend: "listings/<listingId>/<imageId>.jpg" -> "<imageId>"
function imageIdOf(entry) {
  const key = isImageKitEntry(entry) ? entry.key : entry;
  if (typeof key !== 'string') {
    return '';
  }
  const fileName = key.slice(key.lastIndexOf('/') + 1);
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? fileName : fileName.slice(0, dot);
}

async function deleteLocalImage(key) {
  let fullPath;
  try {
    fullPath = resolveKey(key);
  } catch (err) {
    return false; // not a valid key: refuse to touch the disk
  }
  try {
    await fs.unlink(fullPath);
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      return false; // "already gone" is fine; anything else is a problem
    }
  }
  try {
    await fs.rmdir(path.dirname(fullPath)); // removes the listing folder only if now empty
  } catch (err) {
    // not empty (or already gone): leave it
  }
  return true;
}

async function deleteImageKitImage(entry) {
  if (typeof entry.fileId !== 'string' || entry.fileId === '' || !isImageKitConfigured()) {
    return false;
  }
  try {
    await getImageKitClient().files.delete(entry.fileId);
    return true;
  } catch (err) {
    return Boolean(err && err.status === 404); // already gone on ImageKit: fine
  }
}

// Best-effort cleanup (deleted listing, or rollback after a failed save). NEVER throws.
// Accepts a mix of ImageKit objects and local keys.
async function deleteImages(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }
  const results = await Promise.all(
    entries.map((entry) => (isImageKitEntry(entry) ? deleteImageKitImage(entry) : deleteLocalImage(entry)))
  );
  const problems = results.filter((ok) => !ok).length;
  if (problems > 0) {
    console.error(`[storage] ${problems} image(s) could not be deleted (unused files may remain).`);
  }
}

// Logged once at startup. Never throws and never stops the server.
async function logStorageStatus() {
  const root = uploadsRoot();
  try {
    await fs.mkdir(root, { recursive: true });
    await fs.access(root, fs.constants.W_OK);
    console.log(`[storage] Local uploads folder ready (older/demo images): ${root}`);
  } catch (err) {
    const code = err && typeof err.code === 'string' ? err.code : 'unknown error';
    console.warn(`[storage] The local uploads folder is not usable (${code}): ${root}`);
  }
  if (isImageKitConfigured()) {
    console.log(`[storage] New listing photos upload to ImageKit (folder ${config.imagekit.folder}).`);
  } else {
    console.warn('[storage] ImageKit is not configured: new listing photos are saved in the local uploads folder.');
  }
}

module.exports = {
  uploadImage,
  saveLocalImage,
  getSignedUrl,
  imageIdOf,
  deleteImages,
  logStorageStatus,
  isImageKitConfigured,
  setImageKitClientForTests,
};
