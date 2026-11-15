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

// Requests (Task 9). One request = one student asking for one listing.
//   pending   -> accepted | declined (by the owner) | cancelled (withdrawn by the requester)
//   accepted  -> completed (owner) | cancelled (owner or requester: the arrangement fell through)
// declined, cancelled and completed are final (a cancelled request may be sent again).
const REQUEST_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
});
const REQUEST_STATUSES = Object.values(REQUEST_STATUS);

const REQUEST_LIMITS = Object.freeze({
  MAX_MESSAGE_LENGTH: 300,
  OFFER_TITLE: { min: 3, max: 100 },
  OFFER_DESCRIPTION: { min: 10, max: 500 },
  MAX_LIST_RESULTS: 200, // requests returned by one list call
});

// Administration (Task 10). Admin accounts are never created through the API: a person with
// access to the server promotes an existing account with "npm run admin:create -- <email>".
const ROLES = Object.freeze({ STUDENT: 'student', ADMIN: 'admin' });

const ADMIN = Object.freeze({
  MAX_NOTE_LENGTH: 500, // admin note on a removal / report decision
  DEFAULT_LIST_LIMIT: 20,
  MAX_LIST_LIMIT: 50,
});

// ?state= on GET /admin/listings. Without it: every listing that has not been removed.
const ADMIN_LISTING_STATES = ['available', 'reserved', 'completed', 'removed'];

// Reports (Task 10). A student reports a listing or a user; an administrator decides.
const REPORT_TARGET_TYPES = ['listing', 'user'];
const REPORT_REASONS = ['spam', 'inappropriate', 'misleading', 'prohibited_item', 'harassment', 'other'];
const REPORT_STATUS = Object.freeze({ OPEN: 'open', RESOLVED: 'resolved', DISMISSED: 'dismissed' });
const REPORT_STATUSES = Object.values(REPORT_STATUS);
// What an administrator can do when resolving a report. 'none' = looked at and handled, no automatic
// change; 'remove_listing' = also remove the reported listing (listing reports only).
const REPORT_RESOLUTION_ACTIONS = ['none', 'remove_listing'];
const REPORT_LIMITS = Object.freeze({
  MAX_DETAILS_LENGTH: 500,
  MAX_OPEN_PER_REPORTER: 10, // stops one account from flooding the admin queue
  MAX_LIST_RESULTS: 200, // reports returned by one list call
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
  REQUEST_STATUS,
  REQUEST_STATUSES,
  REQUEST_LIMITS,
  ROLES,
  ADMIN,
  ADMIN_LISTING_STATES,
  REPORT_TARGET_TYPES,
  REPORT_REASONS,
  REPORT_STATUS,
  REPORT_STATUSES,
  REPORT_RESOLUTION_ACTIONS,
  REPORT_LIMITS,
};
