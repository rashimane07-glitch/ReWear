// Decides exactly which listing fields an ADMINISTRATOR sees. Whitelist, like the others.
// More than the public view (the full description, the removal history), but never an
// email, a contact detail, a password hash, an image storage key or a Cloudant field.
// Who removed a listing is shown only as "by an admin" or "by the owner", not as an id.

const LISTING_ID_PREFIX = 'listing:';

function toAdminListing(listingDoc, { ownerName }) {
  const removed = listingDoc.isDeleted === true;
  return {
    id: listingDoc._id.startsWith(LISTING_ID_PREFIX) ? listingDoc._id.slice(LISTING_ID_PREFIX.length) : listingDoc._id,
    title: listingDoc.title,
    description: listingDoc.description,
    category: listingDoc.category,
    size: listingDoc.size,
    colour: listingDoc.colour,
    condition: listingDoc.condition,
    listingType: listingDoc.listingType,
    price: listingDoc.price === undefined ? null : listingDoc.price,
    status: removed ? 'removed' : listingDoc.status,
    imageCount: Array.isArray(listingDoc.imageKeys) ? listingDoc.imageKeys.length : 0,
    owner: { id: listingDoc.ownerId, name: ownerName },
    removal: removed
      ? {
          removedAt: listingDoc.deletedAt || null,
          removedBy: listingDoc.deletionReason === 'admin_removed' ? 'admin' : 'owner',
          note: listingDoc.removalNote || null,
        }
      : null,
    createdAt: listingDoc.createdAt,
    updatedAt: listingDoc.updatedAt,
  };
}

module.exports = { toAdminListing };
