// Administrator actions on listings (Task 10): see every listing and remove one.
// Who may call these is decided by the requireAdmin middleware (the role is read from the
// database); this file only holds the rules. It never talks to HTTP.
//
// Removing a listing is the same soft delete the owner has, plus the admin's note:
//   isDeleted true, deletionReason 'admin_removed', deletedBy <admin id>, removalNote.
// An admin may remove a listing in ANY state (an owner may only delete an available one).
// Open requests need no change: request.service.js already shows a removed listing as
// "removed" and never shows the owner's contact for it.

const ApiError = require('../utils/ApiError');
const userRepository = require('../repositories/user.repository');
const listingRepository = require('../repositories/listing.repository');
const storageService = require('./storage.service');
const { toAdminListing } = require('../serializers/admin.serializer');

const MAX_ATTEMPTS = 3;

// One page of listings. Owners are loaded with ONE bulk request; only their name is used.
async function listListings({ state, limit, cursor }) {
  const { docs, bookmark } = await listingRepository.findListingsForAdmin({ state, limit, bookmark: cursor });
  const owners = await userRepository.findUsersByIds(docs.map((doc) => doc.ownerId));
  const listings = docs.map((doc) => {
    const owner = owners.get(doc.ownerId);
    return toAdminListing(doc, { ownerName: owner ? owner.name : null });
  });
  const hasMore = docs.length >= limit && bookmark !== null;
  return { listings, meta: { limit, count: listings.length, nextCursor: hasMore ? bookmark : null } };
}

// Removes a listing. Returns the raw removed document (callers present it themselves).
// 404 if it does not exist, 409 if it is already removed (by the owner or an admin).
async function removeListingDoc(adminId, listingId, note) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const fresh = await listingRepository.findListingById(listingId);
    if (!fresh) {
      throw new ApiError(404, 'NOT_FOUND', 'Listing not found.');
    }
    if (fresh.isDeleted) {
      throw new ApiError(409, 'LISTING_ALREADY_REMOVED', 'This listing has already been removed.');
    }

    const keysToRemove = fresh.imageKeys || [];
    const now = new Date().toISOString();
    const removed = {
      ...fresh,
      imageKeys: [],
      isDeleted: true,
      deletedAt: now,
      deletedBy: adminId,
      deletionReason: 'admin_removed',
      removalNote: note || null,
      updatedAt: now,
    };

    if (await listingRepository.updateListing(removed)) {
      await storageService.deleteImages(keysToRemove); // best effort, never throws
      return removed;
    }
    // Revision conflict (e.g. the owner changed it at the same moment): re-read and try again.
  }
  throw new ApiError(409, 'CONFLICT', 'The listing was changed at the same time. Please try again.');
}

async function removeListing(adminId, listingId, note) {
  const removed = await removeListingDoc(adminId, listingId, note);
  const owner = await userRepository.findUserById(removed.ownerId);
  return toAdminListing(removed, { ownerName: owner ? owner.name : null });
}

module.exports = { listListings, removeListing, removeListingDoc };
