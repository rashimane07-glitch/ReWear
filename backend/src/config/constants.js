// Fixed values shared across the backend. Changing a list here changes the
// validation everywhere. The frontend should read these from the API
// (planned: GET /api/v1/meta/options) instead of hardcoding its own copies.
//
// NOTE: categories, sizes and conditions are the values proposed in the
// architecture plan. They are still to be agreed with the frontend developer.

const LISTING_CATEGORIES = [
  'tops',
  'bottoms',
  'dresses',
  'ethnic_wear',
  'outerwear',
  'activewear',
  'accessories',
  'other',
];

const LISTING_SIZES = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'free_size'];

const LISTING_CONDITIONS = ['new_with_tags', 'like_new', 'good', 'fair'];

const LISTING_TYPES = ['sell', 'exchange', 'donate'];

const LISTING_STATUS = Object.freeze({
  AVAILABLE: 'available',
  RESERVED: 'reserved',
  COMPLETED: 'completed',
});

// Sale price in whole Indian rupees (INR), only for "sell" listings.
const PRICE_LIMITS = Object.freeze({ MIN: 1, MAX: 99999 });

const IMAGE_LIMITS = Object.freeze({
  MAX_PER_LISTING: 5,
  MAX_FILE_BYTES: 5 * 1024 * 1024, // 5 MB per image
});

// Public browsing: GET /api/v1/listings
const BROWSE_SORTS = ['newest', 'oldest', 'price_asc', 'price_desc'];

const BROWSE = Object.freeze({
  DEFAULT_SORT: 'newest',
  DEFAULT_LIMIT: 12,
  MAX_LIMIT: 50,
  MAX_SEARCH_LENGTH: 100, // characters in ?q=
  MAX_SEARCH_TERMS: 5, // words in ?q=
  MAX_FILTER_VALUES: 10, // values in one comma-separated filter
  MAX_COLOUR_LENGTH: 30,
});

module.exports = {
  LISTING_CATEGORIES,
  LISTING_SIZES,
  LISTING_CONDITIONS,
  LISTING_TYPES,
  LISTING_STATUS,
  PRICE_LIMITS,
  IMAGE_LIMITS,
  BROWSE_SORTS,
  BROWSE,
};
