// Listing rules: who may create a listing, who may add images, and how.
// It talks to Cloudant through the repositories and to the image storage through
// storage.service.js, and never to HTTP.

const crypto = require('crypto');

const ApiError = require('../utils/ApiError');
const { LISTING_STATUS, IMAGE_LIMITS } = require('../config/constants');
const { detectImageType } = require('../utils/imageType');
const userRepository = require('../repositories/user.repository');
const listingRepository = require('../repositories/listing.repository');
const storageService = require('./storage.service');
const { toPublicListing } = require('../serializers/listing.serializer');

// If someone changes the same listing at the same moment, Cloudant rejects our save
// (revision conflict). We re-read the fresh document and try again a few times.
const MAX_ATTEMPTS = 3;

// Builds the API shape of a listing, including the public image links.
// Each `imageKeys` entry is either an ImageKit object (new photos) or a local key string
// (older demo photos); the storage service turns both into a link the browser can open.
// `knownOwner` (optional) avoids one database read per listing when the owner is already loaded.
async function toListingResponse(listingDoc, knownOwner) {
  const owner = knownOwner !== undefined ? knownOwner : await userRepository.findUserById(listingDoc.ownerId);
  const images = (listingDoc.imageKeys || []).map((entry) => ({
    id: storageService.imageIdOf(entry),
    url: storageService.getSignedUrl(entry),
  }));
  return toPublicListing(listingDoc, { images, ownerName: owner ? owner.name : null });
}

// `userId` comes from the verified login token. `input` is already validated.
async function createListing(userId, input) {
  // Also confirms the account still exists.
  const owner = await userRepository.findUserById(userId);
  if (!owner) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Your account could not be found. Please log in again.');
  }

  const listingId = crypto.randomUUID();
  const now = new Date().toISOString();

  const listingBody = {
    type: 'listing',
    ownerId: userId, // always the logged-in user, never taken from the request
    title: input.title,
    description: input.description,
    category: input.category,
    size: input.size,
    gender: input.gender === undefined ? null : input.gender,
    colour: input.colour,
    condition: input.condition,
    listingType: input.listingType,
    price: input.price,
    imageKeys: [], // images are added afterwards: POST /listings/:id/images
    status: LISTING_STATUS.AVAILABLE,
    acceptedRequestId: null,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    deletionReason: null,
    createdAt: now,
    updatedAt: now,
  };

  await listingRepository.insertListing(listingId, listingBody);

  return toPublicListing(
    { _id: `listing:${listingId}`, ...listingBody },
    { images: [], ownerName: owner.name }
  );
}

// The rules for adding images. Checked before uploading AND again on the fresh
// document just before saving, because things can change in between.
function assertCanAddImages(listingDoc, userId, incomingCount) {
  if (!listingDoc || listingDoc.isDeleted) {
    throw new ApiError(404, 'NOT_FOUND', 'Listing not found.');
  }
  if (listingDoc.ownerId !== userId) {
    throw new ApiError(403, 'FORBIDDEN', 'You can only add images to your own listings.');
  }
  if (listingDoc.status !== LISTING_STATUS.AVAILABLE) {
    throw new ApiError(409, 'LISTING_LOCKED', 'Images can only be changed while the listing is available.');
  }
  const existing = (listingDoc.imageKeys || []).length;
  if (existing + incomingCount > IMAGE_LIMITS.MAX_PER_LISTING) {
    throw new ApiError(
      409,
      'IMAGE_LIMIT_EXCEEDED',
      `A listing can have at most ${IMAGE_LIMITS.MAX_PER_LISTING} images (this one already has ${existing}).`
    );
  }
}

// Checks every file BEFORE anything is uploaded, so a bad file never causes a partial upload.
// Trusts the file's real bytes, not its name or the Content-Type the browser claimed.
function inspectFiles(files) {
  return files.map((file, index) => {
    const label = `Image ${index + 1}`;
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', `${label} is empty.`);
    }
    if (file.buffer.length > IMAGE_LIMITS.MAX_FILE_BYTES) {
      throw new ApiError(
        413,
        'FILE_TOO_LARGE',
        `${label} is too large. Each image must be ${IMAGE_LIMITS.MAX_FILE_BYTES / (1024 * 1024)} MB or smaller.`
      );
    }
    const type = detectImageType(file.buffer);
    if (!type) {
      throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', `${label} is not a JPEG, PNG or WebP image.`);
    }
    return { buffer: file.buffer, mime: type.mime, ext: type.ext };
  });
}

// Adds the uploaded keys to the listing document (retrying on revision conflicts).
async function saveImageKeys(userId, listingId, newKeys) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const fresh = await listingRepository.findListingById(listingId);
    assertCanAddImages(fresh, userId, newKeys.length);

    fresh.imageKeys = [...(fresh.imageKeys || []), ...newKeys];
    fresh.updatedAt = new Date().toISOString();

    if (await listingRepository.updateListing(fresh)) {
      return fresh;
    }
    // Revision conflict: loop again with a fresh copy.
  }
  throw new ApiError(409, 'CONFLICT', 'The listing was changed at the same time. Please try again.');
}

// `files` are the uploaded files from multer: [{ buffer, ... }]
async function addImages(userId, listingId, files) {
  const listing = await listingRepository.findListingById(listingId);
  assertCanAddImages(listing, userId, files.length);

  const images = inspectFiles(files);

  // What gets saved in Cloudant for each photo: the ImageKit object (url, fileId, size, ...)
  // or, when ImageKit is not configured, the local key string.
  const storedEntries = [];
  let saved;
  try {
    for (const image of images) {
      const key = `listings/${listingId}/${crypto.randomUUID()}.${image.ext}`; // unique: no name collisions
      const entry = await storageService.uploadImage({ key, buffer: image.buffer, contentType: image.mime });
      storedEntries.push(entry);
    }
    saved = await saveImageKeys(userId, listingId, storedEntries);
  } catch (err) {
    // Nothing was saved to the listing, so don't leave the uploaded files behind.
    await storageService.deleteImages(storedEntries);
    throw err;
  }

  return toListingResponse(saved);
}

// ---------- read ----------

function assertVisible(listingDoc) {
  if (!listingDoc || listingDoc.isDeleted) {
    throw new ApiError(404, 'NOT_FOUND', 'Listing not found.');
  }
}

// Anyone (also a visitor who is not logged in) may view a listing that is not deleted, like the public
// browse feed. Only the public fields leave the server (see listing.serializer.js): never contact details.
async function getListing(listingId) {
  const listing = await listingRepository.findListingById(listingId);
  assertVisible(listing);
  return toListingResponse(listing);
}

// The logged-in user's own (non-deleted) listings, newest first.
async function getMyListings(userId) {
  const owner = await userRepository.findUserById(userId);
  if (!owner) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Your account could not be found. Please log in again.');
  }
  const docs = await listingRepository.findListingsByOwner(userId);
  return Promise.all(docs.map((doc) => toListingResponse(doc, owner)));
}

// ---------- public browsing ----------

// One page of the public feed: available, non-deleted listings only (also enforced again
// below as a safety net). `query` is already validated (see browse.validator.js).
// Owners are loaded with a single bulk request, and only their name is ever used.
async function browseListings({ filters, searchTerms, sort, limit, cursor }) {
  const { docs, bookmark } = await listingRepository.searchPublicListings({
    filters,
    searchTerms,
    sort,
    limit,
    bookmark: cursor,
  });

  const publicDocs = docs.filter((doc) => !doc.isDeleted && doc.status === LISTING_STATUS.AVAILABLE);
  const owners = await userRepository.findUsersByIds(publicDocs.map((doc) => doc.ownerId));
  const listings = await Promise.all(
    publicDocs.map((doc) => toListingResponse(doc, owners.get(doc.ownerId) || null))
  );

  // A full page may be followed by more; a short page is the last one. (If the last page
  // is exactly full, the next request simply returns an empty list.)
  const hasMore = docs.length >= limit && bookmark !== null;
  return { listings, meta: { limit, count: listings.length, nextCursor: hasMore ? bookmark : null } };
}

// ---------- edit / delete (owner only, only while the listing is available) ----------

function assertOwnerCanChange(listingDoc, userId, action) {
  assertVisible(listingDoc);
  if (listingDoc.ownerId !== userId) {
    throw new ApiError(403, 'FORBIDDEN', `You can only ${action} your own listings.`);
  }
  if (listingDoc.status !== LISTING_STATUS.AVAILABLE) {
    throw new ApiError(409, 'LISTING_LOCKED', `A listing can only be ${action === 'edit' ? 'edited' : 'deleted'} while it is available.`);
  }
}

// Applies the price rule, which depends on the stored listing: "sell" needs a price,
// other types have none. Returns the price to store, or throws a 400.
function resolvePrice(current, updates) {
  const type = updates.listingType !== undefined ? updates.listingType : current.listingType;
  const hasPriceUpdate = updates.price !== undefined;

  if (type === 'sell') {
    const price = hasPriceUpdate ? updates.price : current.price;
    if (price === null || price === undefined) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', [
        { field: 'price', message: 'Price is required for sale listings.' },
      ]);
    }
    return price;
  }

  if (hasPriceUpdate && updates.price !== null) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', [
      { field: 'price', message: 'Price can only be set for "sell" listings.' },
    ]);
  }
  return null; // switching to exchange/donate clears the price
}

// `updates` is already validated: any of title, description, category, size, gender, colour,
// condition, listingType, price.
async function updateListing(userId, listingId, updates) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const fresh = await listingRepository.findListingById(listingId);
    assertOwnerCanChange(fresh, userId, 'edit');

    const price = resolvePrice(fresh, updates);
    const updated = { ...fresh, ...updates, price };

    const unchanged = Object.keys(updates)
      .concat('price')
      .every((field) => JSON.stringify(updated[field]) === JSON.stringify(fresh[field]));
    if (unchanged) {
      return toListingResponse(fresh);
    }

    updated.updatedAt = new Date().toISOString();
    if (await listingRepository.updateListing(updated)) {
      return toListingResponse(updated);
    }
    // Revision conflict: loop again with a fresh copy.
  }
  throw new ApiError(409, 'CONFLICT', 'The listing was changed at the same time. Please try again.');
}

// Soft delete: the document stays (marked deleted, images forgotten) so later features
// such as reports can still refer to it; the image files are removed from disk.
async function deleteListing(userId, listingId) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const fresh = await listingRepository.findListingById(listingId);
    assertOwnerCanChange(fresh, userId, 'delete');

    const keysToRemove = fresh.imageKeys || [];
    const now = new Date().toISOString();
    const deleted = {
      ...fresh,
      imageKeys: [],
      isDeleted: true,
      deletedAt: now,
      deletedBy: userId,
      deletionReason: 'owner_deleted',
      updatedAt: now,
    };

    if (await listingRepository.updateListing(deleted)) {
      // The listing is gone first; file cleanup is best effort and never throws.
      await storageService.deleteImages(keysToRemove);
      return { id: listingId };
    }
    // Revision conflict: loop again with a fresh copy.
  }
  throw new ApiError(409, 'CONFLICT', 'The listing was changed at the same time. Please try again.');
}

module.exports = { createListing, addImages, getListing, getMyListings, browseListings, updateListing, deleteListing };
