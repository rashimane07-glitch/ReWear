// Request rules (Task 9): who may ask for a listing, who may answer, how the status changes,
// and who may see a contact detail. It talks to Cloudant through the repositories, never to HTTP.
//
// LIFECYCLE (a request is one student asking for one listing; for an exchange listing the
// request also describes the item offered; there is no separate "exchange" document):
//
//   pending  --owner accepts-->   accepted   (listing: available -> reserved)
//   pending  --owner declines-->  declined   (final)
//   pending  --requester withdraws--> cancelled
//   accepted --owner marks done--> completed (listing: reserved -> completed, final)
//   accepted --owner or requester cancels--> cancelled (listing: reserved -> available again)
//
// When one request is accepted, the other pending requests of that listing are declined.
// A cancelled request may be sent again, and so may one that was declined only because the
// listing got reserved for someone else (the arrangement may fall through). A request the
// owner declined, or a completed one, may not be sent again.
//
// CONTACT PRIVACY: the ONLY way to read a contact detail through this API is the requester
// reading their own request while it is accepted and the listing is reserved for it
// (canSeeOwnerContact). It is the owner's contact, and the owner must have one to accept.
// Nobody else, in no other state and no other endpoint, receives a contact detail.
//
// Non-participants get 404 (never 403), so nobody can find out which requests exist.

const ApiError = require('../utils/ApiError');
const { LISTING_STATUS, REQUEST_STATUS } = require('../config/constants');
const userRepository = require('../repositories/user.repository');
const listingRepository = require('../repositories/listing.repository');
const requestRepository = require('../repositories/request.repository');
const { toPublicRequest, toRequestId } = require('../serializers/request.serializer');

// A change made at the same moment by someone else makes Cloudant reject our save (revision
// conflict). We re-read the fresh documents and try again a few times.
const MAX_ATTEMPTS = 3;

const conflictError = () => new ApiError(409, 'CONFLICT', 'The request was changed at the same time. Please try again.');
const notFoundError = () => new ApiError(404, 'NOT_FOUND', 'Request not found.');
const accountMissingError = () =>
  new ApiError(401, 'UNAUTHORIZED', 'Your account could not be found. Please log in again.');
const invalidTransition = (status, verb) =>
  new ApiError(409, 'INVALID_STATUS_TRANSITION', `This request is ${status} and can no longer be ${verb}.`);
const forbidden = (message) => new ApiError(403, 'FORBIDDEN', message);
const listingUnavailable = (message) => new ApiError(409, 'LISTING_UNAVAILABLE', message);

// ---------- building responses ----------

function roleOf(requestDoc, userId) {
  if (requestDoc.ownerId === userId) return 'owner';
  if (requestDoc.requesterId === userId) return 'requester';
  return null;
}

function listingSummary(requestDoc, listingDoc) {
  const gone = !listingDoc || listingDoc.isDeleted;
  return {
    id: requestDoc.listingId,
    title: gone ? requestDoc.listingTitle : listingDoc.title,
    listingType: gone ? requestDoc.listingType : listingDoc.listingType,
    price: gone || listingDoc.price === undefined ? null : listingDoc.price,
    status: gone ? 'removed' : listingDoc.status,
  };
}

function person(users, id) {
  const user = users.get(id);
  return { id, name: user ? user.name : null };
}

// The single rule that decides who may see a contact detail (see the header of this file).
function canSeeOwnerContact(requestDoc, role, listingDoc) {
  return (
    role === 'requester' &&
    requestDoc.status === REQUEST_STATUS.ACCEPTED &&
    Boolean(listingDoc) &&
    !listingDoc.isDeleted &&
    listingDoc.status === LISTING_STATUS.RESERVED &&
    listingDoc.acceptedRequestId === toRequestId(requestDoc)
  );
}

// `includeContact` is true ONLY for the single-request view (GET /requests/:id).
function present(requestDoc, role, { listing, users, includeContact }) {
  const entitled = includeContact && canSeeOwnerContact(requestDoc, role, listing);
  const ownerDoc = users.get(requestDoc.ownerId);
  return toPublicRequest(requestDoc, {
    listing: listingSummary(requestDoc, listing),
    owner: person(users, requestDoc.ownerId),
    requester: person(users, requestDoc.requesterId),
    role,
    ownerContact: entitled ? (ownerDoc && ownerDoc.contact) || null : undefined,
  });
}

async function presentOne(requestDoc, role, includeContact = false) {
  const [listing, users] = await Promise.all([
    listingRepository.findListingById(requestDoc.listingId),
    userRepository.findUsersByIds([requestDoc.ownerId, requestDoc.requesterId]),
  ]);
  return present(requestDoc, role, { listing, users, includeContact });
}

// Loads a request for one of its two participants. Anyone else (or a missing request) gets 404.
async function loadForParticipant(userId, requestId) {
  const doc = await requestRepository.findRequestById(requestId);
  const role = doc ? roleOf(doc, userId) : null;
  if (!role) {
    throw notFoundError();
  }
  return { doc, role };
}

// ---------- create ----------

// `userId` comes from the verified login token. `input` is already validated.
async function createRequest(userId, input) {
  const requester = await userRepository.findUserById(userId);
  if (!requester) {
    throw accountMissingError();
  }

  const listing = await listingRepository.findListingById(input.listingId);
  if (!listing || listing.isDeleted) {
    throw new ApiError(404, 'NOT_FOUND', 'Listing not found.');
  }
  if (listing.ownerId === userId) {
    throw new ApiError(403, 'CANNOT_REQUEST_OWN_LISTING', 'You cannot send a request for your own listing.');
  }
  if (listing.status !== LISTING_STATUS.AVAILABLE) {
    throw listingUnavailable('This listing is no longer available.');
  }

  // Exchange listings need the offered item; other types must not have one.
  if (listing.listingType === 'exchange' && !input.offeredItem) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', [
      { field: 'offeredItem', message: 'Describe the item you offer in exchange.' },
    ]);
  }
  if (listing.listingType !== 'exchange' && input.offeredItem) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', [
      { field: 'offeredItem', message: 'An offered item can only be sent for exchange listings.' },
    ]);
  }

  const now = new Date().toISOString();
  const body = {
    type: 'request',
    listingId: input.listingId,
    ownerId: listing.ownerId,
    requesterId: userId, // always the logged-in user, never taken from the request
    status: REQUEST_STATUS.PENDING,
    message: input.message,
    offeredItem: input.offeredItem,
    listingTitle: listing.title,
    listingType: listing.listingType,
    createdAt: now,
    updatedAt: now,
    respondedAt: null,
    cancelledBy: null,
    declinedReason: null,
  };
  const requestId = requestRepository.makeRequestId(input.listingId, userId);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const existing = await requestRepository.findRequestById(requestId);
    let saved = null;

    if (!existing) {
      if (await requestRepository.insertRequest(requestId, body)) {
        saved = { _id: `request:${requestId}`, ...body };
      }
    } else if (
      existing.status === REQUEST_STATUS.CANCELLED ||
      (existing.status === REQUEST_STATUS.DECLINED && existing.declinedReason === 'listing_reserved')
    ) {
      // A withdrawn request (or one that was only closed because the listing got reserved for
      // someone else) may be sent again: the same document starts over.
      const restarted = { ...existing, ...body };
      if (await requestRepository.updateRequest(restarted)) {
        saved = restarted;
      }
    } else if (existing.status === REQUEST_STATUS.DECLINED) {
      throw new ApiError(409, 'REQUEST_DECLINED', 'The owner declined your earlier request for this listing.');
    } else if (existing.status === REQUEST_STATUS.COMPLETED) {
      throw new ApiError(409, 'REQUEST_CLOSED', 'Your earlier request for this listing is already completed.');
    } else {
      throw requestRepository.duplicateRequestError();
    }

    if (saved) {
      // Race guard (review finding M2): the listing may have been reserved for someone else while
      // this request was being saved. See declineIfListingTaken.
      await declineIfListingTaken(saved);
      const users = new Map([[userId, requester]]);
      const owner = await userRepository.findUserById(listing.ownerId);
      if (owner) users.set(listing.ownerId, owner);
      return present(saved, 'requester', { listing, users, includeContact: false });
    }
    // Someone else changed it at the same moment: loop again with a fresh read.
  }
  throw conflictError();
}

// ---------- read ----------

// kind: 'received' (I am the owner) or 'sent' (I am the requester). Never includes contact details.
async function listRequests(userId, kind, statuses) {
  const user = await userRepository.findUserById(userId);
  if (!user) {
    throw accountMissingError();
  }

  const role = kind === 'received' ? 'owner' : 'requester';
  const docs =
    kind === 'received'
      ? await requestRepository.findReceivedRequests(userId, statuses)
      : await requestRepository.findSentRequests(userId, statuses);

  const [listings, users] = await Promise.all([
    listingRepository.findListingsByIds(docs.map((doc) => doc.listingId)),
    userRepository.findUsersByIds(docs.flatMap((doc) => [doc.ownerId, doc.requesterId])),
  ]);
  return docs.map((doc) => present(doc, role, { listing: listings.get(doc.listingId), users, includeContact: false }));
}

// One request, for its owner or its requester only. The only place a contact detail can appear.
async function getRequest(userId, requestId) {
  const { doc, role } = await loadForParticipant(userId, requestId);
  return presentOne(doc, role, true);
}

// ---------- listing helpers ----------

// Puts the listing back to "available" if (and only if) it is reserved for THIS request.
// Never throws for "nothing to do"; throws a 409 only if it keeps losing a race.
async function reopenListing(requestId, listingId) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const listing = await listingRepository.findListingById(listingId);
    if (!listing || listing.isDeleted) return;
    if (listing.status !== LISTING_STATUS.RESERVED || listing.acceptedRequestId !== requestId) return;

    const reopened = { ...listing, status: LISTING_STATUS.AVAILABLE, acceptedRequestId: null, updatedAt: new Date().toISOString() };
    if (await listingRepository.updateListing(reopened)) return;
  }
  throw conflictError();
}

// Declines one request because its listing was reserved for someone else (review finding M2).
// A revision conflict (somebody changed the request at the same moment) is NOT treated as success:
// the request is read again and, only if it is STILL pending, declined again (a few attempts). A
// request that is no longer pending (withdrawn or answered meanwhile) is never overwritten.
// `knownDoc` (optional) saves a read when the caller just loaded the document.
// Returns true when the request is no longer pending, false when it could not be declined.
async function declineBecauseReserved(requestId, knownDoc) {
  let current = knownDoc || (await requestRepository.findRequestById(requestId));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (!current || current.status !== REQUEST_STATUS.PENDING) return true;

    const now = new Date().toISOString();
    const declined = {
      ...current,
      status: REQUEST_STATUS.DECLINED,
      respondedAt: now,
      updatedAt: now,
      declinedReason: 'listing_reserved',
    };
    if (await requestRepository.updateRequest(declined)) return true;
    current = await requestRepository.findRequestById(requestId); // conflict: look at the fresh document
  }
  return false;
}

// After one request is accepted, the others for the same listing can no longer be answered.
// Each competing request is handled on its own: a failure for one never stops the others.
// A failure here never undoes the acceptance, but it is NOT hidden: it is logged (without ids or
// details) with the number of requests that may still be pending. Cloudant cannot lock the
// listing and all its requests together, so a request saved at the very moment of the acceptance
// can still be missed by this one query; declineIfListingTaken (used by createRequest) covers
// most of that window, not all of it.
async function declineOtherPending(listingId, acceptedRequestId) {
  let pending;
  try {
    pending = await requestRepository.findPendingRequestsForListing(listingId);
  } catch (err) {
    console.error(`[requests] Could not look up the other pending requests (${(err && err.code) || 'error'}).`);
    return;
  }

  let notDeclined = 0;
  for (const other of pending) {
    const otherId = toRequestId(other);
    if (otherId === acceptedRequestId) continue;
    try {
      if (!(await declineBecauseReserved(otherId, other))) notDeclined += 1;
    } catch (err) {
      notDeclined += 1;
      console.error(`[requests] Could not decline a competing request (${(err && err.code) || 'error'}).`);
    }
  }
  if (notDeclined > 0) {
    console.error(`[requests] ${notDeclined} competing request(s) may still be pending for a reserved listing.`);
  }
}

// Called right after a request was saved. If another request got the listing in the meantime
// (so the accept's "decline the others" query may have missed this one), the new request is
// declined and the sender is told with 409 instead of being left waiting for ever. A listing that
// is reserved for THIS very request (the owner accepted it at once) is fine and is left alone. A
// deleted listing is not handled here (that case is shown as "removed", as before).
async function declineIfListingTaken(savedRequest) {
  const latest = await listingRepository.findListingById(savedRequest.listingId);
  if (!latest || latest.isDeleted || latest.status === LISTING_STATUS.AVAILABLE) return;
  if (latest.acceptedRequestId === toRequestId(savedRequest)) return;

  try {
    await declineBecauseReserved(toRequestId(savedRequest));
  } catch (err) {
    console.error(`[requests] Could not decline a request sent while its listing was being reserved (${(err && err.code) || 'error'}).`);
  }
  throw listingUnavailable('This listing is no longer available.');
}

// ---------- status changes ----------

async function declineRequest(userId, requestId) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { doc, role } = await loadForParticipant(userId, requestId);
    if (role !== 'owner') throw forbidden('Only the listing owner can decline a request.');
    if (doc.status !== REQUEST_STATUS.PENDING) throw invalidTransition(doc.status, 'declined');

    // Recovery (review finding M1): a pending request should never have a reserved listing, but a
    // failed accept can leave the listing reserved for THIS request. reopenListing only touches a
    // listing reserved for exactly this request, so this is a no-op in every normal case. It goes
    // FIRST and its failure is not hidden: the request then stays pending and can be declined again.
    await reopenListing(toRequestId(doc), doc.listingId);

    const now = new Date().toISOString();
    const updated = { ...doc, status: REQUEST_STATUS.DECLINED, respondedAt: now, updatedAt: now };
    if (await requestRepository.updateRequest(updated)) {
      return presentOne(updated, role);
    }
  }
  throw conflictError();
}

// The requester withdraws a pending request, or either participant cancels an accepted one
// (the arrangement fell through): the listing then becomes available again.
async function cancelRequest(userId, requestId) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { doc, role } = await loadForParticipant(userId, requestId);

    if (role === 'owner' && doc.status === REQUEST_STATUS.PENDING) {
      throw new ApiError(409, 'INVALID_STATUS_TRANSITION', 'A pending request is answered with "decline", not "cancel".');
    }
    const allowed =
      doc.status === REQUEST_STATUS.ACCEPTED || (role === 'requester' && doc.status === REQUEST_STATUS.PENDING);
    if (!allowed) throw invalidTransition(doc.status, 'cancelled');

    // The listing is the source of truth: it goes first. For an accepted request this puts the
    // listing back on the market. For a pending one it is only a recovery (review finding M1) for a
    // listing a failed accept left reserved for this request. reopenListing never touches a listing
    // reserved for another request or already completed, and a failure is reported, not hidden.
    await reopenListing(toRequestId(doc), doc.listingId);
    const now = new Date().toISOString();
    const updated = { ...doc, status: REQUEST_STATUS.CANCELLED, cancelledBy: role, updatedAt: now };
    if (await requestRepository.updateRequest(updated)) {
      return presentOne(updated, role);
    }
  }
  throw conflictError();
}

// The owner accepts: the listing is reserved FIRST (this write is the lock: if two accepts or
// an edit race, only one listing write wins), then the request is marked accepted.
async function acceptRequest(userId, requestId) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { doc, role } = await loadForParticipant(userId, requestId);
    if (role !== 'owner') throw forbidden('Only the listing owner can accept a request.');
    if (doc.status !== REQUEST_STATUS.PENDING) throw invalidTransition(doc.status, 'accepted');

    // Accepting shares the owner's contact with the requester, so there must be one to share.
    const owner = await userRepository.findUserById(userId);
    if (!owner) throw accountMissingError();
    if (!owner.contact || typeof owner.contact.value !== 'string') {
      throw new ApiError(
        409,
        'CONTACT_REQUIRED',
        'Add a contact detail to your profile before accepting a request: it is shared only with the student you accept.'
      );
    }

    const listing = await listingRepository.findListingById(doc.listingId);
    if (!listing || listing.isDeleted || listing.ownerId !== userId || listing.status !== LISTING_STATUS.AVAILABLE) {
      throw listingUnavailable('This listing is no longer available, so the request cannot be accepted.');
    }

    const now = new Date().toISOString();
    const reserved = { ...listing, status: LISTING_STATUS.RESERVED, acceptedRequestId: requestId, updatedAt: now };
    if (!(await listingRepository.updateListing(reserved))) {
      continue; // the listing changed meanwhile: look again
    }

    const updated = { ...doc, status: REQUEST_STATUS.ACCEPTED, respondedAt: now, updatedAt: now };
    if (await requestRepository.updateRequest(updated)) {
      await declineOtherPending(doc.listingId, requestId);
      return presentOne(updated, role);
    }
    await reopenListing(requestId, doc.listingId); // the request changed meanwhile: undo the reservation
  }
  throw conflictError();
}

// The owner marks an accepted request as done (the hand-over happened).
async function completeRequest(userId, requestId) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { doc, role } = await loadForParticipant(userId, requestId);
    if (role !== 'owner') throw forbidden('Only the listing owner can complete a request.');
    if (doc.status !== REQUEST_STATUS.ACCEPTED) throw invalidTransition(doc.status, 'completed');

    const listing = await listingRepository.findListingById(doc.listingId);
    const ours = Boolean(listing) && !listing.isDeleted && listing.acceptedRequestId === requestId;
    if (!ours || ![LISTING_STATUS.RESERVED, LISTING_STATUS.COMPLETED].includes(listing.status)) {
      throw listingUnavailable('The listing is not reserved for this request.');
    }

    const now = new Date().toISOString();
    if (listing.status === LISTING_STATUS.RESERVED) {
      const done = { ...listing, status: LISTING_STATUS.COMPLETED, updatedAt: now };
      if (!(await listingRepository.updateListing(done))) continue;
    }
    const updated = { ...doc, status: REQUEST_STATUS.COMPLETED, updatedAt: now };
    if (await requestRepository.updateRequest(updated)) {
      return presentOne(updated, role);
    }
  }
  throw conflictError();
}

module.exports = {
  createRequest,
  listRequests,
  getRequest,
  acceptRequest,
  declineRequest,
  cancelRequest,
  completeRequest,
};
