// All Cloudant access for listings. Nothing here knows about HTTP.
//
// A listing document has _id "listing:<random uuid>". It stores only TEXT data and
// the keys (names) of its images in Object Storage, never the image bytes.

const ApiError = require('../utils/ApiError');
const { run, getDoc, putDoc, toApiError } = require('./base.repository');

const LISTING_PREFIX = 'listing:';
const SAFE_LISTING_ID = /^[A-Za-z0-9-]{1,64}$/;

function toDocId(listingId) {
  return `${LISTING_PREFIX}${listingId}`;
}

async function insertListing(listingId, listingBody) {
  const result = await putDoc(toDocId(listingId), listingBody);
  if (!result.ok) {
    throw new ApiError(409, 'CONFLICT', 'Something went wrong while creating the listing. Please try again.');
  }
}

// Returns the raw listing document (with _id and _rev) or null. Soft-deleted
// listings ARE returned here; the service decides what to do with them.
async function findListingById(listingId) {
  if (typeof listingId !== 'string' || !SAFE_LISTING_ID.test(listingId)) {
    return null;
  }
  const doc = await getDoc(toDocId(listingId));
  return doc && doc.type === 'listing' ? doc : null;
}

// Saves a changed listing. `listingDoc` must be the document as read (with _id and _rev).
// Returns true if saved, false on a revision conflict (caller should re-read and retry).
async function updateListing(listingDoc) {
  const { _id, _rev, ...body } = listingDoc;
  const result = await putDoc(_id, body, _rev);
  return result.ok;
}

// Cloudant answers a query with 25 documents unless told otherwise, so the limit is explicit.
// Paging for browsing is a later task; a single user will not have this many listings.
const MY_LISTINGS_LIMIT = 200;

// All non-deleted listings of one owner (raw documents), newest first.
// Uses the "listing-by-owner" index created by "npm run db:setup" (see config/database.js);
// without it Cloudant still answers, only slower.
async function findListingsByOwner(ownerId) {
  if (typeof ownerId !== 'string' || !SAFE_LISTING_ID.test(ownerId)) {
    return [];
  }
  const response = await run((client, db) =>
    client.postFind({
      db,
      selector: { type: 'listing', ownerId, isDeleted: false },
      limit: MY_LISTINGS_LIMIT,
    })
  ).catch((err) => {
    throw toApiError(err);
  });
  const docs = (response.result && response.result.docs) || [];
  return docs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

module.exports = { insertListing, findListingById, updateListing, findListingsByOwner };
