// One place for all backend calls. React never talks to IBM Cloudant directly.
// While VITE_API_URL is empty we return MOCK data; nothing is stored anywhere.
import { products, categories, impactStats } from '../data/mockData'
import { get, post, del, getPage, ApiError } from './http'
import { API_MODE } from './config'
import { fromBackend, toCreatePayload, toBrowseQuery } from './listingMapper'
import { fromBackendRequest, contactText, toOfferedItem, REQUEST_ACTIONS } from './requestMapper'

// REAL mode = VITE_API_URL is set (see config.js). Task 11, phase 2: listings, photos and "my listings" use the
// backend (through http.js + listingMapper.js). Phase 3: requests, exchange offers and the accept / decline / cancel /
// complete actions use the backend too (http.js + requestMapper.js). A failed real call is thrown to the screen; it is
// NEVER answered with demo data.
const API_URL = API_MODE
const mock = (data) => new Promise((resolve) => setTimeout(() => resolve(data), 150))

// REAL mode: one page of the public browse (no login needed), mapped to the shape the screens use.
// params: { query, sort: 'newest'|'low'|'high', filters: { category, size, condition, type }, limit, cursor, listingType }.
// Returns { listings, nextCursor } (nextCursor is null on the last page). `options.signal` cancels the call.
export const browseListings = (params, options = {}) =>
  getPage(`/listings?${toBrowseQuery(params)}`, { auth: false, signal: options.signal })
    .then(({ data, meta }) => ({ listings: data.listings.map(fromBackend), nextCursor: (meta && meta.nextCursor) || null }))

export const getTrendingProducts = () => (API_URL ? browseListings({ limit: 4 }).then(({ listings }) => listings.map((l) => ({ ...l, image: l.images[0] }))) : mock(listings.filter((l) => l.status === 'active').slice(0, 4).map((l) => ({ ...l, image: l.images[0] }))))
// REAL mode: Home category tiles named like the backend's categories (the demo tiles use names the backend does not have).
// The pictures are the existing placeholder photos, reused in order.
const REAL_CATEGORY_TILES = [
  { name: 'Tops', image: '/images/cat-western.jpg' }, { name: 'Ethnic wear', image: '/images/cat-ethnic.jpg' },
  { name: 'Bottoms', image: '/images/cat-casual.jpg' }, { name: 'Outerwear', image: '/images/cat-formal.jpg' },
  { name: 'Accessories', image: '/images/cat-accessories.jpg' }, { name: 'Activewear', image: '/images/cat-men.jpg' },
]
export const getCategories = () => mock(API_URL ? REAL_CATEGORY_TILES : categories)
export const getImpactStats = () => mock(impactStats)

// ---- Phase 2 ----
import { listings } from '../data/listings'
// REAL mode: the newest listings (up to 50, one page). params can add { listingType: 'exchange' } etc.
export const getListings = (params = {}) => (API_URL ? browseListings({ limit: 50, ...params }).then((r) => r.listings) : mock([...listings]))
// REAL mode: needs a login (the backend's GET /listings/:id does). A missing listing gives null; a guest gets an
// ApiError with status 401 that the page turns into "please log in".
export const getListingById = (id) =>
  API_URL
    ? get(`/listings/${encodeURIComponent(id)}`).then((d) => fromBackend(d.listing)).catch((e) => { if (e instanceof ApiError && e.status === 404) return null; throw e })
    : mock(listings.find((l) => String(l.id) === String(id)) || null)
// Up to 4 other listings of the same category ("You may also like").
export const getSimilarListings = (item) =>
  API_URL
    ? browseListings({ filters: { category: [item.category] }, limit: 5 }).then((r) => r.listings.filter((l) => l.id !== item.id).slice(0, 4))
    : mock(listings.filter((l) => l.category === item.category && l.id !== item.id).slice(0, 4))
// The saved (wishlist) listings. REAL mode reads them one by one (login needed); ones that no longer exist are skipped.
export const getListingsByIds = (ids) =>
  API_URL ? Promise.all(ids.map((id) => getListingById(id).catch(() => null))).then((all) => all.filter(Boolean)) : mock(listings.filter((l) => ids.includes(l.id)))
// MOCK: pretends to send a request. The seller is not actually notified in demo mode.
// REAL mode: POST /requests { listingId, message?, offeredItem? }. For an exchange, `offeredListing` (the piece the person picked)
// is turned into the backend's offeredItem { title, description } (the backend has no "offeredListingId"). Returns the new request.
async function sendRealRequest(listingId, message, offeredListing) {
  const body = { listingId: String(listingId) }
  const text = String(message || '').trim()
  if (text) body.message = text
  if (offeredListing) body.offeredItem = toOfferedItem(offeredListing)
  return fromBackendRequest((await post('/requests', body)).request)
}
export const submitRequest = (listingId, message, user, offeredListingId, offeredListing) =>
  API_URL
    ? sendRealRequest(listingId, message, offeredListing)
    : mock().then(() => addRequest(listingId, message, user, offeredListingId))

// ---- Phase 3 ----
// MOCK: adds the listing to memory for this browser session only (lost on refresh). Nothing is uploaded or stored.
// REAL mode: two backend calls, because the backend takes the details and the photos separately:
//   1) POST /listings (JSON) creates the listing, 2) POST /listings/:id/images (multipart, field "images") adds the photos.
// If the photos fail, the listing that was just created is KEPT (it is not deleted again): the error thrown has code
// 'PHOTOS_NOT_UPLOADED' and the new listing's id in `error.listingId` (and in the message), so the screen can point to it.
async function createRealListing(data) {
  const created = (await post('/listings', toCreatePayload(data))).listing
  const files = (data.images || []).map((image) => image.file).filter(Boolean)
  if (files.length === 0) return fromBackend(created)

  const form = new FormData()
  files.forEach((file) => form.append('images', file))
  try {
    const uploaded = await post(`/listings/${created.id}/images`, form)
    return fromBackend((uploaded && uploaded.listing) || created)
  } catch (err) {
    const why = (err && err.message) || 'unknown problem'
    const failure = new ApiError(
      `Your listing was saved (listing ID ${created.id}), but its photos could not be uploaded: ${why} Find it under My Listings (a donation: My Donations); delete it there and list it again with its photos. Do not submit this form again, or a second listing is created.`,
      { status: err && err.status, code: 'PHOTOS_NOT_UPLOADED', details: { listingId: created.id } }
    )
    failure.listingId = created.id // the saved listing, so the screen can identify it (also in error.details.listingId)
    throw failure
  }
}
export const createListing = (data) => {
  if (API_URL) return createRealListing(data)
  const listing = {
    ...data, id: Date.now(), listedAt: Date.now(), originalPrice: undefined,
    images: data.images.map((i) => i.url), status: 'active', ownerId: data.owner?.id,
    seller: { name: data.owner?.name || 'You', college: data.owner?.college || data.location },
  }
  listings.unshift(listing)
  return mock(listing)
}

// ---- Phase 4: ownership, requests, dashboard ----
// MOCK data lives in memory and resets on refresh. Real versions call the Express API with the user's JWT.

;[1, 3, 4].forEach((id) => { const l = listings.find((x) => x.id === id); if (l) l.ownerId = 'demo' }) // the demo account owns these
listings.forEach((l) => { l.status = l.status || 'active' })

const who = (id, name, college, email) => ({ id, name, college, email })
const ananya = who('demo', 'Ananya Sharma', 'Delhi University', 'demo@rewear.test')
const ago = (h) => Date.now() - h * 36e5
let requests = [
  { id: 'r1', listingId: 3, type: 'exchange', from: who('u2', 'Ishita R.', 'Lady Shri Ram College', 'ishita@campus.example'), toUserId: 'demo', message: 'I can swap my wool coat, size M.', status: 'pending', createdAt: ago(2) },
  { id: 'r2', listingId: 1, type: 'sell', from: who('u3', 'Karan M.', 'Hansraj College', 'karan@campus.example'), toUserId: 'demo', message: 'Is the blazer still available?', status: 'pending', createdAt: ago(5) },
  { id: 'r3', listingId: 4, type: 'donate', from: who('u4', 'Sneha T.', 'Gargi College', 'sneha@campus.example'), toUserId: 'demo', message: 'I would love the jeans.', status: 'accepted', createdAt: ago(30) },
  { id: 'r4', listingId: 6, type: 'sell', from: ananya, toUserId: 'u9', message: '', status: 'accepted', createdAt: ago(50) },
  { id: 'r5', listingId: 2, type: 'sell', from: ananya, toUserId: 'u8', message: '', status: 'pending', createdAt: ago(8) },
]

function addRequest(listingId, message, user, offeredListingId) {
  const item = listings.find((l) => l.id === Number(listingId))
  if (requests.some((x) => x.listingId === item.id && x.from.id === user.id && ['pending', 'accepted'].includes(x.status))) throw new Error('You have already sent a request for this item.')
  const r = { id: `r${Date.now()}`, listingId: item.id, type: item.listingType, from: who(user.id, user.name, user.college, user.email), toUserId: item.ownerId, message, offeredListingId, status: 'pending', createdAt: Date.now() }
  requests.unshift(r)
  return r
}
// Contact details are only included once a request is accepted (or completed).
const withListing = (r) => {
  const listing = listings.find((l) => l.id === r.listingId)
  const shared = r.status === 'accepted' || r.status === 'completed'
  return { ...r, listing, offered: listings.find((l) => l.id === r.offeredListingId), ownerContact: shared && listing ? `${listing.seller.name.split(' ')[0].toLowerCase()}@campus.example` : null }
}

export const getMyListings = (userId) => (API_URL ? get('/listings/mine').then((d) => d.listings.map(fromBackend)) : mock(listings.filter((l) => l.ownerId === userId)))
export const deleteListing = (id) => {
  if (API_URL) return del(`/listings/${encodeURIComponent(id)}`)
  const i = listings.findIndex((l) => l.id === id); if (i > -1) listings.splice(i, 1)
  return mock({ ok: true })
}
// REAL mode: GET /requests/received (I am the owner) + GET /requests/sent (I asked), both mapped for the screens.
// CONTACT PRIVACY: the lists never carry a contact. For each ACCEPTED request I SENT, the single-request view
// (GET /requests/:id) is read, because only that view can contain the owner's contact, and only while the backend
// itself allows it (accepted + the listing reserved for that request). If it returns none, none is shown.
async function getRealRequests() {
  const [received, sent] = await Promise.all([get('/requests/received'), get('/requests/sent')])
  const incoming = received.requests.map(fromBackendRequest)
  const outgoing = sent.requests.map(fromBackendRequest)
  await Promise.all(outgoing.filter((r) => r.status === 'accepted').map(async (r) => {
    try { r.ownerContact = contactText((await get(`/requests/${encodeURIComponent(r.id)}`)).request.ownerContact) } catch { r.ownerContact = null }
  }))
  return { incoming, sent: outgoing }
}
export const getRequests = (userId) =>
  API_URL ? getRealRequests() : mock({ incoming: requests.filter((r) => r.toUserId === userId).map(withListing), sent: requests.filter((r) => r.from.id === userId).map(withListing) })
// status: 'accepted' | 'rejected' (= decline) | 'cancelled' | 'completed'. REAL mode: POST /requests/:id/<accept|decline|cancel|complete>.
export const updateRequestStatus = (id, status) => {
  if (API_URL) {
    const action = REQUEST_ACTIONS[status]
    if (!action) return Promise.reject(new Error('That action is not available.'))
    return post(`/requests/${encodeURIComponent(id)}/${action}`).then((d) => fromBackendRequest(d.request))
  }
  const r = requests.find((x) => x.id === id); const was = r.status; r.status = status
  // Calling off an accepted request puts the item (and the piece offered in exchange) back on the market.
  if (status === 'cancelled' && was === 'accepted') [r.listingId, r.offeredListingId].forEach((lid) => { const l = listings.find((x) => x.id === lid); if (l) l.status = 'active' })
  // Accepting reserves the item (and the piece offered in exchange) and declines other pending requests for it.
  const next = status === 'accepted' ? 'reserved' : status === 'completed' ? 'completed' : null
  if (next) [r.listingId, r.offeredListingId].forEach((lid) => { const l = listings.find((x) => x.id === lid); if (l) l.status = next })
  if (status === 'accepted') requests.forEach((x) => { if (x.listingId === r.listingId && x.id !== r.id && x.status === 'pending') x.status = 'rejected' })
  return mock(r)
}
