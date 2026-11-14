// One place for all backend calls. React never talks to IBM Cloudant directly.
// While VITE_API_URL is empty we return MOCK data; nothing is stored anywhere.
import { products, categories, impactStats } from '../data/mockData'

const API_URL = import.meta.env.VITE_API_URL
const mock = (data) => new Promise((resolve) => setTimeout(() => resolve(data), 150))

export const getTrendingProducts = () => (API_URL ? fetch(`${API_URL}/listings?sort=trending`).then((r) => r.json()) : mock(listings.filter((l) => l.status === 'active').slice(0, 4).map((l) => ({ ...l, image: l.images[0] }))))
export const getCategories = () => mock(categories)
export const getImpactStats = () => mock(impactStats)

// ---- Phase 2 ----
import { listings } from '../data/listings'
export const getListings = () => (API_URL ? fetch(`${API_URL}/listings`).then((r) => r.json()) : mock([...listings]))
export const getListingById = (id) =>
  API_URL ? fetch(`${API_URL}/listings/${id}`).then((r) => r.json()) : mock(listings.find((l) => String(l.id) === String(id)) || null)
// MOCK: pretends to send a request. The seller is not actually notified until the backend exists.
export const submitRequest = (listingId, message, user, offeredListingId) =>
  API_URL
    ? fetch(`${API_URL}/requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId, message, offeredListingId }) }).then((r) => r.json())
    : mock().then(() => addRequest(listingId, message, user, offeredListingId))

// ---- Phase 3 ----
// MOCK: adds the listing to memory for this browser session only (lost on refresh). Nothing is uploaded or stored.
// Real version: POST multipart form data to the Express API, which stores images in IBM Cloud Object Storage.
export const createListing = (data) => {
  if (API_URL) {
    const body = new FormData()
    Object.entries(data).forEach(([k, v]) => k !== 'images' && k !== 'owner' && v !== undefined && body.append(k, v))
    data.images.forEach((img) => body.append('images', img.file))
    return fetch(`${API_URL}/listings`, { method: 'POST', body }).then((r) => r.json())
  }
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
import { getToken } from './auth'
const call = (path, opts = {}) =>
  fetch(`${API_URL}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` } }).then((r) => r.json())

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

export const getMyListings = (userId) => (API_URL ? call('/listings/mine') : mock(listings.filter((l) => l.ownerId === userId)))
export const deleteListing = (id) => {
  if (API_URL) return call(`/listings/${id}`, { method: 'DELETE' })
  const i = listings.findIndex((l) => l.id === id); if (i > -1) listings.splice(i, 1)
  return mock({ ok: true })
}
export const getRequests = (userId) =>
  API_URL ? call('/requests') : mock({ incoming: requests.filter((r) => r.toUserId === userId).map(withListing), sent: requests.filter((r) => r.from.id === userId).map(withListing) })
export const updateRequestStatus = (id, status) => {
  if (API_URL) return call(`/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
  const r = requests.find((x) => x.id === id); r.status = status
  // Accepting reserves the item (and the piece offered in exchange) and declines other pending requests for it.
  const next = status === 'accepted' ? 'reserved' : status === 'completed' ? 'completed' : null
  if (next) [r.listingId, r.offeredListingId].forEach((lid) => { const l = listings.find((x) => x.id === lid); if (l) l.status = next })
  if (status === 'accepted') requests.forEach((x) => { if (x.listingId === r.listingId && x.id !== r.id && x.status === 'pending') x.status = 'rejected' })
  return mock(r)
}
