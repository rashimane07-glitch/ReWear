// All Cloudant access for listings. Nothing here knows about HTTP.
//
// A listing document has _id "listing:<random uuid>". It stores only TEXT data and
// the keys (names) of its images in the local uploads folder (backend/uploads/),
// never the image bytes.

const crypto = require('crypto');

const ApiError = require('../utils/ApiError');
const { LISTING_STATUS } = require('../config/constants');
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
// "My listings" is not paged (the public feed is: see searchPublicListings below); a single
// user will not have this many listings.
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

// ---------- public browsing ----------
//
// HOW SEARCH WORKS (and its limits), checked against the IBM Cloudant documentation:
//   * The equality parts of the selector (type, isDeleted, status) ARE answered from a JSON
//     index, so Cloudant only walks the AVAILABLE listings, never the whole database.
//   * The word search ($regex / $or) and the multi-value filters ($in) can NOT be answered
//     from an index (IBM says so). Cloudant applies them to every available listing it walks.
//     That is fine for a prototype with up to a few thousand listings, but the work grows
//     with the number of available listings.
//   * A Cloudant text index ($text) was considered and NOT used: it matches whole words only
//     (no "jack" -> "jacket"), treats several words as "any of them", searches every string
//     field of a document, and IBM describes text-index queries as meant for small result
//     slices. It would also have to be verified against a real Cloudant instance, which
//     was not possible here. Switching later only means changing buildPublicSelector().

// Makes text safe to put inside a regular expression, so a search for "(vintage)" or ".*"
// is matched literally and cannot be used to build expensive patterns.
function escapeRegex(text) {
  return text.replace(/[\\^$.|?*+()[\]{}\-/]/g, '\\$&');
}

// The Cloudant (Mango) selector for the public feed: only listings that are available and
// not deleted, plus the filters and search words. Pure function (no database access).
//   filters      { category?: [..], size?: [..], condition?: [..], listingType?: [..], colour?: 'Blue' }
//   searchTerms  ['denim', 'jacket']  (every word must appear in the title or the description)
function buildPublicSelector(filters = {}, searchTerms = []) {
  const selector = { type: 'listing', isDeleted: false, status: LISTING_STATUS.AVAILABLE };

  for (const field of ['category', 'size', 'condition', 'listingType']) {
    const values = filters[field];
    if (values && values.length > 0) {
      selector[field] = values.length === 1 ? values[0] : { $in: values };
    }
  }

  if (filters.colour) {
    selector.colour = { $regex: `(?i)^${escapeRegex(filters.colour)}$` }; // exact, any letter case
  }

  if (searchTerms.length > 0) {
    selector.$and = searchTerms.map((term) => {
      const pattern = `(?i)${escapeRegex(term)}`;
      return { $or: [{ title: { $regex: pattern } }, { description: { $regex: pattern } }] };
    });
  }

  return selector;
}

// Each sort needs a Cloudant index whose fields are exactly: type, isDeleted, status, <sort field>
// (created by "npm run db:setup"; see config/database.js). Cloudant needs every field of the
// index in the sort, all in the same direction; the first three are fixed by the selector.
//
// Two things to know about the price sort:
//   * A JSON index only contains documents that HAVE every indexed field (IBM documentation).
//     Listings created by this backend always have "price" (a number, or null for exchange and
//     donate), so they are all included. An older document with NO "price" field at all still
//     appears in newest/oldest, but is left out of price_asc / price_desc.
//   * price is null for exchange/donate and a number for sell, so this sort mixes two value
//     types. IBM calls the order of mixed types undefined; the expected order (null before
//     every number: first for price_asc, last for price_desc) is how CouchDB-style indexes
//     sort, but it has NOT been verified against a real Cloudant instance.
const SORTS = {
  newest: { field: 'createdAt', direction: 'desc' },
  oldest: { field: 'createdAt', direction: 'asc' },
  price_asc: { field: 'price', direction: 'asc' },
  price_desc: { field: 'price', direction: 'desc' },
};

// ---------- cursors ----------
//
// The client's "cursor" is Cloudant's bookmark with a short fingerprint of the query in front
// of it. Cloudant says results are undefined if the selector changes between pages, so a cursor
// is only accepted together with the SAME filters, search words and sort it was created for;
// otherwise the client gets a clear 400 instead of odd results. The bookmark itself stays an
// opaque value: we never read or build it, we only hand it back to Cloudant.
const FINGERPRINT_LENGTH = 12;

function queryFingerprint(selector, sort) {
  return crypto.createHash('sha256').update(JSON.stringify({ selector, sort })).digest('hex').slice(0, FINGERPRINT_LENGTH);
}

function invalidCursorError() {
  return new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted query parameters.', [
    { field: 'cursor', message: 'Invalid or expired cursor. Start again without it.' },
  ]);
}

// Returns the Cloudant bookmark inside a cursor, or throws a 400 if the cursor was not made
// for this exact query (or is not one of ours at all).
function bookmarkFromCursor(cursor, fingerprint) {
  if (cursor.length <= FINGERPRINT_LENGTH || !cursor.startsWith(fingerprint)) {
    throw invalidCursorError();
  }
  return cursor.slice(FINGERPRINT_LENGTH);
}

// One page of the public feed (raw documents). `bookmark` is the cursor returned with the
// previous page. Never reads more than `limit` documents into memory.
// Returns { docs, bookmark }; bookmark is null when Cloudant gave none. A bookmark does NOT
// promise another page (Cloudant docs): the service decides from the page size.
async function searchPublicListings({ filters, searchTerms, sort, limit, bookmark }) {
  const { field, direction } = SORTS[sort];

  const selector = buildPublicSelector(filters, searchTerms);
  // The sort field must be required to exist, so Cloudant can use the matching JSON index.
  selector[field] = { $exists: true };
  const sortSpec = ['type', 'isDeleted', 'status', field].map((name) => ({ [name]: direction }));

  const fingerprint = queryFingerprint(selector, sortSpec);
  const params = { selector, sort: sortSpec, limit };
  if (bookmark) {
    params.bookmark = bookmarkFromCursor(bookmark, fingerprint);
  }

  let response;
  try {
    response = await run((client, db) => client.postFind({ db, ...params }));
  } catch (err) {
    throw translateFindError(err, Boolean(bookmark));
  }

  const result = response.result || {};
  const hasBookmark = typeof result.bookmark === 'string' && result.bookmark !== '' && result.bookmark !== 'nil';
  return {
    docs: result.docs || [],
    bookmark: hasBookmark ? `${fingerprint}${result.bookmark}` : null,
  };
}

// Turns the two "expected" Cloudant query failures into clear errors.
function translateFindError(err, hadBookmark) {
  const text = `${(err && err.message) || ''} ${JSON.stringify((err && err.body) || '')}`;
  if (err && err.status === 400) {
    const mentionsBookmark = /bookmark/i.test(text);
    const mentionsIndex = /index/i.test(text);
    // A rejected bookmark, or any other 400 that is not about a missing index while a cursor
    // was sent, is treated as a bad cursor (a client problem), never as a server error.
    if (mentionsBookmark || (hadBookmark && !mentionsIndex)) {
      return invalidCursorError();
    }
    if (mentionsIndex) {
      console.error('[database] A listing search index is missing. Run "npm run db:setup".');
      return new ApiError(503, 'DATABASE_INDEX_MISSING', 'Listing search is not set up yet. Please try again later.');
    }
  }
  return toApiError(err);
}

module.exports = {
  insertListing,
  findListingById,
  updateListing,
  findListingsByOwner,
  buildPublicSelector,
  searchPublicListings,
};
