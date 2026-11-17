// Decides exactly which listing fields leave the server.
// Internal fields (imageKeys, ownerId, acceptedRequestId, isDeleted, ...) are never
// copied over; the owner is shown only as { id, name }.
//
// `images` is built by the service (it needs the storage service to create the links):
//   [ { id, url } ]   where url is a public link such as
//   <BACKEND_URL>/uploads/listings/<listingId>/<file>.jpg (the file is on the local disk).

const LISTING_ID_PREFIX = 'listing:';

function toPublicListing(listingDoc, { images, ownerName }) {
  return {
    id: listingDoc._id.startsWith(LISTING_ID_PREFIX) ? listingDoc._id.slice(LISTING_ID_PREFIX.length) : listingDoc._id,
    title: listingDoc.title,
    description: listingDoc.description,
    category: listingDoc.category,
    size: listingDoc.size,
    gender: listingDoc.gender || null, // older listings have no gender
    colour: listingDoc.colour,
    condition: listingDoc.condition,
    listingType: listingDoc.listingType,
    price: listingDoc.price === undefined ? null : listingDoc.price,
    status: listingDoc.status,
    images,
    owner: { id: listingDoc.ownerId, name: ownerName },
    createdAt: listingDoc.createdAt,
    updatedAt: listingDoc.updatedAt,
  };
}

module.exports = { toPublicListing };
