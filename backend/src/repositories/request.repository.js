// All Cloudant access for requests. Nothing here knows about HTTP.
//
// A request document has _id "request:<listingId>_<requesterId>". Building the id from the
// listing and the requester is what makes duplicates impossible: Cloudant refuses to create
// two documents with the same _id, so "create the document" doubles as "reserve this
// (listing, requester) pair", even if two requests arrive at the same moment (the same trick
// the email key uses in user.repository.js).
//
// Document (see request.service.js for who may change what):
//   type 'request', listingId, ownerId, requesterId, status, message, offeredItem,
//   listingTitle / listingType (snapshots, for when the listing is gone),
//   createdAt, updatedAt, respondedAt, cancelledBy

const ApiError = require('../utils/ApiError');
const { REQUEST_LIMITS } = require('../config/constants');
const { run, getDoc, putDoc, toApiError } = require('./base.repository');

const REQUEST_PREFIX = 'request:';
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{1,64}_[A-Za-z0-9-]{1,64}$/;

const toDocId = (requestId) => `${REQUEST_PREFIX}${requestId}`;
const makeRequestId = (listingId, requesterId) => `${listingId}_${requesterId}`;

// Returns the raw request document (with _id and _rev) or null.
async function findRequestById(requestId) {
  if (typeof requestId !== 'string' || !SAFE_REQUEST_ID.test(requestId)) {
    return null;
  }
  const doc = await getDoc(toDocId(requestId));
  return doc && doc.type === 'request' ? doc : null;
}

// Creates a request. Returns false if a request for this id already exists.
async function insertRequest(requestId, body) {
  const result = await putDoc(toDocId(requestId), body);
  return result.ok;
}

// Saves a changed request. `requestDoc` must be the document as read (with _id and _rev).
// Returns true if saved, false on a revision conflict (caller should re-read and retry).
async function updateRequest(requestDoc) {
  const { _id, _rev, ...body } = requestDoc;
  const result = await putDoc(_id, body, _rev);
  return result.ok;
}

// Requests are found with plain equality selectors, answered from the "request-by-*" indexes
// created by "npm run db:setup" (see config/database.js). Without them Cloudant still
// answers, only slower. The limit is explicit because Cloudant answers 25 documents otherwise.
async function findRequests(selector) {
  const response = await run((client, db) =>
    client.postFind({ db, selector: { type: 'request', ...selector }, limit: REQUEST_LIMITS.MAX_LIST_RESULTS })
  ).catch((err) => {
    throw toApiError(err);
  });
  return (response.result && response.result.docs) || [];
}

const byNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

function statusCondition(statuses) {
  if (!statuses || statuses.length === 0) return {};
  return { status: statuses.length === 1 ? statuses[0] : { $in: statuses } };
}

// Requests RECEIVED by an owner, newest first. `statuses` (optional) filters by status.
async function findReceivedRequests(ownerId, statuses) {
  if (typeof ownerId !== 'string' || !SAFE_ID.test(ownerId)) return [];
  return (await findRequests({ ownerId, ...statusCondition(statuses) })).sort(byNewest);
}

// Requests SENT by a requester, newest first.
async function findSentRequests(requesterId, statuses) {
  if (typeof requesterId !== 'string' || !SAFE_ID.test(requesterId)) return [];
  return (await findRequests({ requesterId, ...statusCondition(statuses) })).sort(byNewest);
}

// The requests of one listing that are still waiting for an answer.
async function findPendingRequestsForListing(listingId) {
  if (typeof listingId !== 'string' || !SAFE_ID.test(listingId)) return [];
  return findRequests({ listingId, status: 'pending' });
}

function duplicateRequestError() {
  return new ApiError(409, 'DUPLICATE_REQUEST', 'You have already sent a request for this listing.');
}

module.exports = {
  makeRequestId,
  findRequestById,
  insertRequest,
  updateRequest,
  findReceivedRequests,
  findSentRequests,
  findPendingRequestsForListing,
  duplicateRequestError,
};
