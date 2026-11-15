// Translates between the screens' request vocabulary and the backend's (REAL mode), in ONE place.
//
//   Screens use:   { id, listingId, type, status, message, createdAt (a number), from: { id, name, college, email },
//                    toUserId, listing: { id, name, images, seller: { name, college } }, offered: { name, size },
//                    ownerContact (a text) }   and the statuses pending / accepted / rejected / completed.
//   Backend sends: { id, status, role, message, offeredItem: { title, description }, listing: { id, title, listingType,
//                    price, status }, owner: { id, name }, requester: { id, name }, createdAt (text), updatedAt,
//                    respondedAt, ownerContact? }   and the statuses pending / accepted / DECLINED / CANCELLED / completed.
//
// CONTACT PRIVACY (the backend decides, this file only carries what it sends):
//  - Lists NEVER contain a contact. `ownerContact` is filled in only by api.js for an ACCEPTED request the person SENT, from
//    GET /requests/:id, and only when the backend itself returned one (accepted + listing reserved for that request).
//  - The backend never sends the requester's email or phone, so `from.email` is left out: the screens then show no
//    "requester contact". Nothing is guessed or built from a name.
//  - The request summary has no photos, so `listing.images` is empty (the screens show their placeholder).

// What the screens ask for -> the backend's action endpoint (POST /requests/:id/<action>).
// The "Reject" button says 'rejected' (the demo's word); the backend calls it "decline".
export const REQUEST_ACTIONS = { accepted: 'accept', rejected: 'decline', declined: 'decline', cancelled: 'cancel', completed: 'complete' }

export function fromBackendRequest(r) {
  const listing = r.listing || {}
  const owner = r.owner || {}
  const requester = r.requester || {}
  const title = listing.title || 'Listing'
  return {
    id: r.id,
    listingId: listing.id,
    type: listing.listingType,
    status: r.status, // 'declined' and 'cancelled' are kept as they are (StatusBadge knows them)
    message: r.message || '',
    createdAt: Date.parse(r.createdAt) || 0,
    from: { id: requester.id, name: requester.name || 'A student', college: '' }, // no email: the backend never shares it
    toUserId: owner.id,
    listing: {
      id: listing.id,
      name: listing.status === 'removed' ? `${title} (removed)` : title,
      images: [],
      listingType: listing.listingType,
      price: listing.price,
      status: listing.status,
      seller: { name: owner.name || 'The owner', college: '' },
    },
    offered: r.offeredItem ? { name: r.offeredItem.title, description: r.offeredItem.description } : null,
    ownerContact: null, // filled in by getRequests for accepted SENT requests, only if the backend returns it
  }
}

// The text shown for a backend contact { type: 'phone', value } (or nothing).
export const contactText = (contact) => (contact && typeof contact.value === 'string' && contact.value ? contact.value : null)

// The backend takes no "offeredListingId": an exchange offer is a title + a description (3-100 / 10-500 characters).
// The listing the person picked is turned into those two texts.
export function toOfferedItem(listing) {
  const title = String(listing.name || '').trim().slice(0, 100)
  const facts = [listing.size ? `Size ${listing.size}` : '', listing.condition || ''].filter(Boolean).join(', ')
  let description = [facts, String(listing.description || '').trim()].filter(Boolean).join('. ')
  if (description.length < 10) description = `${title}. ${description}`.trim()
  if (description.length < 10) description = `${title} (offered in exchange)`
  return { title, description: description.slice(0, 500) }
}
