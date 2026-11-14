// Decides exactly which request fields leave the server.
// Internal fields (ownerId, requesterId, _id, _rev, snapshots, cancelledBy, ...) are never
// copied over; the two participants are shown only as { id, name }.
//
// CONTACT PRIVACY: a contact detail appears in a response ONLY when the service passes
// `ownerContact` (a { type, value } object, or null) to this function, and the service does
// that for exactly one case: the requester reading their own ACCEPTED request. The key is
// absent in every other response, so no list, no owner view and no error can carry it.

const REQUEST_ID_PREFIX = 'request:';

function toRequestId(requestDoc) {
  return requestDoc._id.startsWith(REQUEST_ID_PREFIX) ? requestDoc._id.slice(REQUEST_ID_PREFIX.length) : requestDoc._id;
}

function toPublicContact(contact) {
  return contact && typeof contact === 'object' ? { type: contact.type, value: contact.value } : null;
}

// listing:   { id, title, listingType, price, status }   (built by the service)
// owner / requester: { id, name }
// role:      'owner' | 'requester' (who is looking)
function toPublicRequest(requestDoc, { listing, owner, requester, role, ownerContact }) {
  const result = {
    id: toRequestId(requestDoc),
    status: requestDoc.status,
    role,
    message: requestDoc.message || null,
    offeredItem: requestDoc.offeredItem
      ? { title: requestDoc.offeredItem.title, description: requestDoc.offeredItem.description }
      : null,
    listing,
    owner,
    requester,
    createdAt: requestDoc.createdAt,
    updatedAt: requestDoc.updatedAt,
    respondedAt: requestDoc.respondedAt || null,
  };
  if (ownerContact !== undefined) {
    result.ownerContact = toPublicContact(ownerContact);
  }
  return result;
}

module.exports = { toPublicRequest, toRequestId };
