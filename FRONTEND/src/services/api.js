// One place for all backend calls. React never talks to IBM Cloudant directly.
// While VITE_API_URL is empty we return MOCK data; nothing is stored anywhere.
import { products, categories, impactStats } from '../data/mockData'
import { listings } from '../data/listings'
import { getToken } from './auth'

const API_URL = import.meta.env.VITE_API_URL
const mock = (data) => new Promise((resolve) => setTimeout(() => resolve(data), 150))

// ---------------------------------------------------------------------------
// Real-API helpers (only used when VITE_API_URL is set)
// Backend responses look like { success: true, data: {...} }.
// ---------------------------------------------------------------------------
const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

async function call(path, opts = {}) {
  const token = getToken()
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData
  const headers = {
    ...(opts.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers })
  let json = null
  try { json = await res.json() } catch { /* empty or non-JSON body */ }
  if (!res.ok || (json && json.success === false)) {
    const err = new Error(json?.error?.message || json?.message || `Request failed (${res.status})`)
    err.status = res.status
    err.details = json?.error?.details
    throw err
  }
  return json && json.data !== undefined ? json.data : json
}

// The list may come back as an array or wrapped in an object; handle both safely.
const pickList = (d, keys) => {
  if (Array.isArray(d)) return d
  for (const k of keys) if (Array.isArray(d?.[k])) return d[k]
  return []
}
const toMillis = (v) => {
  if (typeof v === 'number') return v
  const t = Date.parse(v)
  return Number.isNaN(t) ? undefined : t
}
// Backend images are { id, url }; the UI components expect plain URL strings.
const imageUrls = (imgs) => (Array.isArray(imgs) ? imgs : []).map((i) => (typeof i === 'string' ? i : i?.url)).filter(Boolean)

// Backend listing -> the shape the existing UI components use.
// Seller contact is NOT invented: only what the backend sends is kept.
const normalizeListing = (l) => {
  if (!l) return l
  const images = imageUrls(l.images)
  const owner = l.owner || {}
  return {
    ...l,
    name: l.title ?? l.name,
    images,
    image: images[0],
    listedAt: toMillis(l.createdAt),
    ownerId: owner.id ?? l.ownerId,
    seller: { name: owner.name || owner.displayName || 'Seller', college: owner.college },
  }
}
const normalizeRequest = (r) => ({
  ...r,
  createdAt: toMillis(r.createdAt) ?? r.createdAt,
  listing: r.listing ? normalizeListing(r.listing) : r.listing,
})

// ---------------------------------------------------------------------------
// Browse
// ---------------------------------------------------------------------------
// The backend has no "trending" sort, so we show the newest 4 listings.
export const getTrendingProducts = () =>
  API_URL
    ? call('/listings')
        .then((d) => pickList(d, ['listings', 'items', 'results']).slice(0, 4).map(normalizeListing))
        .catch(() => [])
    : mock(listings.filter((l) => l.status === 'active').slice(0, 4).map((l) => ({ ...l, image: l.images[0] })))
export const getCategories = () => mock(categories)
export const getImpactStats = () => mock(impactStats)

// ---- Phase 2 ----
export const getListings = () =>
  API_URL
    ? call('/listings').then((d) => pickList(d, ['listings', 'items', 'results']).map(normalizeListing))
    : mock([...listings])
// The real endpoint needs a logged-in user (JWT).
export const getListingById = (id) =>
  API_URL
    ? call(`/listings/${id}`).then((d) => normalizeListing(d?.listing || d))
    : mock(listings.find((l) => String(l.id) === String(id)) || null)

// Real API accepts: listingId, optional message, optional offeredItem { title, description }.
// It does NOT accept offeredListingId, so the real call sends offeredItem instead.
// MOCK: pretends to send a request. The seller is not actually notified until the backend exists.
export const submitRequest = (listingId, message, user, offeredListingId, offeredItem) =>
  API_URL
    ? call('/requests', {
        method: 'POST',
        body: JSON.stringify({
          listingId,
          ...(message ? { message } : {}),
          ...(offeredItem?.title ? { offeredItem: { title: offeredItem.title, description: offeredItem.description || '' } } : {}),
        }),
      }).then((d) => normalizeRequest(d?.request || d))
    : mock().then(() => addRequest(listingId, message, user, offeredListingId))

// ---- Phase 3 ----
// Real version: 1) POST the listing as JSON (only the fields the backend accepts),
// 2) POST the images separately to /listings/:id/images (max 5 images, 5 MB each).
// MOCK: adds the listing to memory for this browser session only (lost on refresh).
export const createListing = async (data) => {
  if (API_URL) {
    const images = data.images || []
    if (images.length > MAX_IMAGES) throw new Error(`You can upload at most ${MAX_IMAGES} images.`)
    if (images.some((i) => i.file && i.file.size > MAX_IMAGE_BYTES)) throw new Error('Each image must be 5 MB or smaller.')

    const price = data.listingType === 'sell' ? Number(data.price) : undefined
    const payload = {
      title: data.title ?? data.name,
      description: data.description,
      category: data.category,
      size: data.size,
      colour: data.colour ?? data.color,
      condition: data.condition,
      listingType: data.listingType,
      ...(price !== undefined ? { price } : {}),
    }
    const created = await call('/listings', { method: 'POST', body: JSON.stringify(payload) })
    const listing = created?.listing || created

    const files = images.map((i) => i.file).filter(Boolean)
    if (files.length > 0) {
      const form = new FormData()
      files.forEach((f) => form.append('images', f))
      try {
        await call(`/listings/${listing.id}/images`, { method: 'POST', body: form })
      } catch (e) {
        throw new Error(`Listing was created but the images failed to upload: ${e.message}`)
      }
      const fresh = await call(`/listings/${listing.id}`)
      return normalizeListing(fresh?.listing || fresh)
    }
    return normalizeListing(listing)
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

export const getMyListings = (userId) =>
  API_URL
    ? call('/listings/mine').then((d) => pickList(d, ['listings', 'items', 'results']).map(normalizeListing))
    : mock(listings.filter((l) => l.ownerId === userId))
// NOTE: the backend cannot set a listing's status (the PATCH validator rejects "status"),
// so "mark unavailable" is not possible yet. Delete is the only removal available.
export const deleteListing = (id) => {
  if (API_URL) return call(`/listings/${id}`, { method: 'DELETE' })
  const i = listings.findIndex((l) => l.id === id); if (i > -1) listings.splice(i, 1)
  return mock({ ok: true })
}
export const getRequests = (userId) =>
  API_URL
    ? Promise.all([call('/requests/received'), call('/requests/sent')]).then(([inc, sent]) => ({
        incoming: pickList(inc, ['requests', 'items', 'results']).map(normalizeRequest),
        sent: pickList(sent, ['requests', 'items', 'results']).map(normalizeRequest),
      }))
    : mock({ incoming: requests.filter((r) => r.toUserId === userId).map(withListing), sent: requests.filter((r) => r.from.id === userId).map(withListing) })

// Real backend actions: accept, decline, cancel, complete.
const ACTION = { accepted: 'accept', declined: 'decline', rejected: 'decline', cancelled: 'cancel', completed: 'complete' }
export const updateRequestStatus = (id, status) => {
  if (API_URL) {
    const action = ACTION[status]
    if (!action) return Promise.reject(new Error(`Unsupported request action: ${status}`))
    return call(`/requests/${id}/${action}`, { method: 'POST' }).then((d) => normalizeRequest(d?.request || d))
  }
  const r = requests.find((x) => x.id === id); r.status = status === 'rejected' ? 'declined' : status
  // Accepting reserves the item (and the piece offered in exchange) and declines other pending requests for it.
  const next = status === 'accepted' ? 'reserved' : status === 'completed' ? 'completed' : null
  if (next) [r.listingId, r.offeredListingId].forEach((lid) => { const l = listings.find((x) => x.id === lid); if (l) l.status = next })
  if (status === 'accepted') requests.forEach((x) => { if (x.listingId === r.listingId && x.id !== r.id && x.status === 'pending') x.status = 'declined' })
  return mock(r)
}

// Edit a listing. Real backend: PATCH /listings/:id (only title, description and, for "sell" listings, price).
export const updateListing = (id, changes) => {
  if (API_URL) {
    const body = {}
    if (changes.title !== undefined) body.title = changes.title
    if (changes.description !== undefined) body.description = changes.description
    if (changes.price !== undefined) body.price = changes.price
    return call(`/listings/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((d) => normalizeListing(d?.listing || d))
  }
  const l = listings.find((x) => x.id === id)
  if (l) {
    if (changes.title !== undefined) { l.name = changes.title; l.title = changes.title }
    if (changes.description !== undefined) l.description = changes.description
    if (changes.price !== undefined) l.price = changes.price
  }
  return mock(l)
}