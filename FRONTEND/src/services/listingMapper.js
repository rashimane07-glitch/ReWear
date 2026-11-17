// Translates between the screens' vocabulary and the backend's (REAL mode), in ONE place.
//
//   Screens use:   name, images: [url], category "Ethnic wear", size "M", condition "Like new",
//                  seller: { name, college }, ownerId, status 'active' | 'reserved' | 'completed', listedAt.
//   Backend uses:  title, images: [{ id, url }], category "ethnic_wear", size "m", condition "like_new",
//                  owner: { id, name }, status 'available' | 'reserved' | 'completed', createdAt.
//
// The lists below (categories, sizes, conditions) are the backend's fixed lists from backend/src/config/constants.js.
// gender is stored by the backend as men | women | unisex (optional; older listings have none).
// The backend has NO fields for: location, "looking for" (exchange), original price, college. They are never sent
// (the backend would answer 400 "This field is not allowed"), and the screens show nothing for them in REAL mode.
import { API_MODE } from './config'
import { FILTER_OPTIONS as MOCK_OPTIONS } from '../data/listings'

// [backend value, label shown on the screens]. The backend codes never change; only the labels are friendlier.
// Kurtis are filed under `dresses` ("Dresses & Kurtis"); sarees, lehengas, kurta sets etc. under `ethnic_wear`.
const CATEGORY = [
  ['tops', 'Tops & Shirts'], ['dresses', 'Dresses & Kurtis'], ['bottoms', 'Jeans & Trousers'], ['outerwear', 'Jackets & Hoodies'],
  ['ethnic_wear', 'Ethnic Wear'], ['accessories', 'Shoes & Accessories'], ['activewear', 'Activewear'], ['other', 'Other'],
]
const GENDER = [['men', 'Men'], ['women', 'Women'], ['unisex', 'Unisex']]
const SIZE = [['xs', 'XS'], ['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL'], ['xxl', 'XXL'], ['free_size', 'Free size']]
const CONDITION = [['new_with_tags', 'New with tags'], ['like_new', 'Like new'], ['good', 'Good'], ['fair', 'Fair']]

const labelOf = (pairs, value) => (pairs.find(([code]) => code === value) || [value, value || ''])[1]
const codeOf = (pairs, label) => (pairs.find(([, text]) => text === label) || [])[0]

// What the filter sidebar and the listing form offer. MOCK mode keeps the original demo lists.
const REAL_OPTIONS = {
  categories: CATEGORY.map(([, label]) => label),
  sizes: SIZE.map(([, label]) => label),
  genders: GENDER.map(([, label]) => label),
  formSizes: SIZE.map(([, label]) => label), // sizes offered by the listing form
  conditions: CONDITION.map(([, label]) => label),
  types: MOCK_OPTIONS.types, // [['sell', 'For sale'], ['exchange', 'For exchange'], ['donate', 'Donation']] (same values as the backend)
  maxPrice: 5000, // the slider only; the backend has no price filter (see Explore.jsx)
  colourRequired: true, // the backend requires a colour (2-30 characters)
  maxImageMb: 5, // the backend accepts 5 MB per photo
}
const DEMO_OPTIONS = { ...MOCK_OPTIONS, genders: GENDER.map(([, label]) => label), formSizes: ['XS', 'S', 'M', 'L', 'XL', 'Free size'], colourRequired: false, maxImageMb: 10 }
export const OPTIONS = API_MODE ? REAL_OPTIONS : DEMO_OPTIONS
export const FILTER_OPTIONS = OPTIONS // older name
export const BACKEND_DESCRIPTION_MAX = 1000 // backend: description 10-1000 characters

// Home page category tiles in REAL mode (the demo tiles use names the backend does not have). The photos are the
// existing placeholder pictures, reused in order.
// Each tile uses the closest existing photo. No existing photo shows Indian ethnic wear, so that tile expects a new
// file public/images/cat-ethnic-wear.jpg (until it exists, ImageWithFallback shows the blush placeholder).
export const CATEGORY_TILES = [
  { name: 'Tops & Shirts', image: '/images/cat-men.jpg' }, // rack of T-shirts
  { name: 'Ethnic Wear', image: '/images/cat-ethnic-wear.jpg' }, // add a saree / kurta photo here
  { name: 'Jeans & Trousers', image: '/images/cat-casual.jpg' }, // jeans + knitwear flat lay
  { name: 'Jackets & Hoodies', image: '/images/p7.jpg' }, // rack of jackets
  { name: 'Shoes & Accessories', image: '/images/cat-accessories.jpg' }, // boots, belt, watch
  { name: 'Dresses & Kurtis', image: '/images/cat-ethnic.jpg' }, // floral printed dresses on hangers
]

// A listing from the backend -> the shape the screens already use.
export function fromBackend(l) {
  const owner = l.owner || {}
  return {
    id: l.id, // a uuid string
    name: l.title,
    description: l.description,
    category: labelOf(CATEGORY, l.category),
    size: labelOf(SIZE, l.size),
    gender: l.gender ? labelOf(GENDER, l.gender) : '', // older listings have no gender
    condition: labelOf(CONDITION, l.condition),
    colour: l.colour,
    listingType: l.listingType,
    price: l.price, // a number for "sell", null otherwise
    images: Array.isArray(l.images) ? l.images.map((image) => image.url) : [], // absolute URLs on the backend (/uploads/...)
    status: l.status === 'available' ? 'active' : l.status,
    ownerId: owner.id,
    seller: { name: owner.name || 'Student', college: '' }, // the backend stores no college
    listedAt: Date.parse(l.createdAt) || 0,
    createdAt: l.createdAt,
  }
}

// The backend has no location / "looking for" fields, so what the person typed is written at the end of the description
// (nothing is lost, and no unsupported field is sent).
export function encodeDescription(values) {
  let text = String(values.description || '').trim()
  const location = String(values.location || '').trim()
  const lookingFor = String(values.lookingFor || '').trim()
  if (location) text += `\n\nLocation: ${location}`
  if (lookingFor) text += `\n\nLooking for in exchange: ${lookingFor}`
  return text
}

// The listing form's values -> the body of POST /listings. ONLY the fields the backend accepts are included.
export function toCreatePayload(data) {
  const description = encodeDescription({ ...data, lookingFor: data.listingType === 'exchange' ? data.lookingFor : '' })
  const payload = {
    title: String(data.name || '').trim(),
    description,
    category: codeOf(CATEGORY, data.category),
    size: codeOf(SIZE, data.size),
    gender: codeOf(GENDER, data.gender) || null,
    colour: String(data.colour || '').trim(),
    condition: codeOf(CONDITION, data.condition),
    listingType: data.listingType,
  }
  if (data.listingType === 'sell') payload.price = Number(data.price)
  return payload
}

// The edit form's values -> the body of PATCH /listings/:id: ONLY the fields that really changed (backend codes).
// `original` is the listing as fromBackend() made it. The listing type is not editable here; price only for "sell".
export function toUpdatePayload(original, values) {
  const text = (v) => String(v ?? '').trim()
  const out = {}
  if (text(values.name) !== text(original.name)) out.title = text(values.name)
  if (text(values.description) !== text(original.description)) out.description = text(values.description)
  if (text(values.colour) !== text(original.colour)) out.colour = text(values.colour)
  if (values.category !== original.category) out.category = codeOf(CATEGORY, values.category)
  if (values.size !== original.size) out.size = codeOf(SIZE, values.size)
  if (values.condition !== original.condition) out.condition = codeOf(CONDITION, values.condition)
  if ((values.gender || '') !== (original.gender || '')) out.gender = values.gender ? codeOf(GENDER, values.gender) : null
  if (original.listingType === 'sell' && Number(values.price) !== Number(original.price)) out.price = Number(values.price)
  return out
}

// Explore's search / sort / filters -> the query string of GET /listings (the backend rejects unknown parameters).
// params: { query, sort: 'newest' | 'oldest' | 'low' | 'high', filters: { category, size, condition, type }, limit, cursor }
export function toBrowseQuery(params = {}) {
  const query = new URLSearchParams()
  const words = String(params.query || '').trim().split(/\s+/).filter(Boolean).slice(0, 5).join(' ').slice(0, 100).trim() // the backend allows 5 words / 100 characters
  if (words) query.set('q', words)

  const sort = { newest: 'newest', oldest: 'oldest', low: 'price_asc', high: 'price_desc' }[params.sort]
  if (sort) query.set('sort', sort)

  const filters = params.filters || {}
  const codes = (pairs, labels) => (labels || []).map((label) => codeOf(pairs, label)).filter(Boolean).join(',')
  const category = codes(CATEGORY, filters.category)
  const size = codes(SIZE, filters.size)
  const gender = codes(GENDER, filters.gender)
  const condition = codes(CONDITION, filters.condition)
  const listingType = [...new Set([...(filters.type || []), ...(params.listingType ? [params.listingType] : [])])].join(',')
  if (category) query.set('category', category)
  if (size) query.set('size', size)
  if (gender) query.set('gender', gender)
  if (condition) query.set('condition', condition)
  if (listingType) query.set('listingType', listingType)

  if (params.limit) query.set('limit', String(params.limit))
  if (params.cursor) query.set('cursor', params.cursor)
  return query.toString()
}

// A backend validation error -> { formFieldName: message } for the messages under the form fields.
export function formErrorsFrom(error) {
  const result = {}
  if (error && Array.isArray(error.details)) {
    error.details.forEach((d) => {
      const key = d && d.field === 'title' ? 'name' : d && d.field
      if (key && !result[key]) result[key] = d.message
    })
  }
  return result
}
export const uiFieldErrors = (error) => formErrorsFrom(error) // name used by ListingForm
