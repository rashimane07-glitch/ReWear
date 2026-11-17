// Checks and cleans the JSON bodies of POST /api/v1/listings (create) and
// PATCH /api/v1/listings/:id (update).
//
// Returns the cleaned values, or throws a 400 ApiError listing every problem.
// Only the fields below are accepted. Anything else (ownerId, status, imageKeys,
// isDeleted, ...) is REJECTED, so a client can never set them. The owner always
// comes from the login token, never from the request.

const ApiError = require('../utils/ApiError');
const {
  LISTING_CATEGORIES,
  LISTING_SIZES,
  LISTING_GENDERS,
  LISTING_CONDITIONS,
  LISTING_TYPES,
  PRICE_LIMITS,
} = require('../config/constants');

const ALLOWED_FIELDS = [
  'title',
  'description',
  'category',
  'size',
  'gender',
  'colour',
  'condition',
  'listingType',
  'price',
];

const LIMITS = {
  title: { min: 3, max: 100 },
  description: { min: 10, max: 1000 },
  colour: { min: 2, max: 30 },
};

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;
// Same, but keeps tab (\u0009) and new line (\u000A) for descriptions.
const CONTROL_CHARACTERS_EXCEPT_NEWLINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function cleanSingleLine(value) {
  return value.replace(CONTROL_CHARACTERS, '').replace(/\s+/g, ' ').trim();
}

function cleanMultiLine(value) {
  return value.replace(/\r\n?/g, '\n').replace(CONTROL_CHARACTERS_EXCEPT_NEWLINE, '').trim();
}

// Builds the field checkers shared by create and update. With `onlyPresent` true
// (update), a field that is not in the body is skipped instead of reported missing.
function makeCheckers(body, cleaned, addError, onlyPresent) {
  const skip = (field) => onlyPresent && !Object.prototype.hasOwnProperty.call(body, field);

  const text = (field, label, clean) => {
    if (skip(field)) return;
    const raw = body[field];
    if (typeof raw !== 'string' || raw.trim() === '') {
      addError(field, `${label} is required.`);
      return;
    }
    const value = clean(raw);
    const { min, max } = LIMITS[field];
    if (value.length < min || value.length > max) {
      addError(field, `${label} must be ${min}-${max} characters long.`);
      return;
    }
    cleaned[field] = value;
  };

  const choice = (field, label, allowed) => {
    if (skip(field)) return;
    const raw = body[field];
    if (typeof raw !== 'string' || raw.trim() === '') {
      addError(field, `${label} is required.`);
      return;
    }
    const value = raw.trim().toLowerCase();
    if (!allowed.includes(value)) {
      addError(field, `${label} must be one of: ${allowed.join(', ')}.`);
      return;
    }
    cleaned[field] = value;
  };

  // An optional choice: missing or null means "not set" (stored as null).
  const optionalChoice = (field, label, allowed) => {
    if (skip(field)) return;
    const raw = body[field];
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      cleaned[field] = null;
      return;
    }
    if (typeof raw !== 'string' || !allowed.includes(raw.trim().toLowerCase())) {
      addError(field, `${label} must be one of: ${allowed.join(', ')}.`);
      return;
    }
    cleaned[field] = raw.trim().toLowerCase();
  };

  return { text, choice, optionalChoice };
}

function checkBodyObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }
}

function unsupportedFields(body, addError) {
  Object.keys(body)
    .filter((key) => !ALLOWED_FIELDS.includes(key))
    .forEach((key) => addError(key.slice(0, 40), 'This field is not allowed.'));
}

function validateCreateListing(body) {
  checkBodyObject(body);

  const errors = [];
  const addError = (field, message) => errors.push({ field, message });
  const cleaned = {};

  unsupportedFields(body, addError);

  const { text, choice, optionalChoice } = makeCheckers(body, cleaned, addError, false);
  text('title', 'Title', cleanSingleLine);
  text('description', 'Description', cleanMultiLine);
  text('colour', 'Colour', cleanSingleLine);
  choice('category', 'Category', LISTING_CATEGORIES);
  choice('size', 'Size', LISTING_SIZES);
  optionalChoice('gender', 'Gender', LISTING_GENDERS);
  choice('condition', 'Condition', LISTING_CONDITIONS);
  choice('listingType', 'Listing type', LISTING_TYPES);

  // --- price: required (whole rupees) for "sell", not allowed otherwise ---
  const price = body.price;
  if (cleaned.listingType === 'sell') {
    if (!isValidPrice(price)) {
      addError('price', priceMessage());
    } else {
      cleaned.price = price;
    }
  } else if (cleaned.listingType !== undefined) {
    if (price !== undefined && price !== null) {
      addError('price', 'Price can only be set for "sell" listings.');
    } else {
      cleaned.price = null;
    }
  }

  if (errors.length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
  }
  return cleaned;
}

// PATCH body: any subset of the same fields, at least one. Each present field gets the
// same checks as on create. The rule that depends on the stored listing (price needs
// "sell") is applied by the service, because only it knows the current values.
// Returns only the fields to change, e.g. { title: 'New', price: null }.
function validateUpdateListing(body) {
  checkBodyObject(body);

  if (Object.keys(body).length === 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `No changes provided. Send at least one of: ${ALLOWED_FIELDS.join(', ')}.`
    );
  }

  const errors = [];
  const addError = (field, message) => errors.push({ field, message });
  const cleaned = {};

  unsupportedFields(body, addError);

  const { text, choice, optionalChoice } = makeCheckers(body, cleaned, addError, true);
  text('title', 'Title', cleanSingleLine);
  text('description', 'Description', cleanMultiLine);
  text('colour', 'Colour', cleanSingleLine);
  choice('category', 'Category', LISTING_CATEGORIES);
  choice('size', 'Size', LISTING_SIZES);
  optionalChoice('gender', 'Gender', LISTING_GENDERS);
  choice('condition', 'Condition', LISTING_CONDITIONS);
  choice('listingType', 'Listing type', LISTING_TYPES);

  if (Object.prototype.hasOwnProperty.call(body, 'price')) {
    if (body.price === null || isValidPrice(body.price)) {
      cleaned.price = body.price;
    } else {
      addError('price', priceMessage());
    }
  }

  if (errors.length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
  }
  return cleaned;
}

function isValidPrice(price) {
  return typeof price === 'number' && Number.isInteger(price) && price >= PRICE_LIMITS.MIN && price <= PRICE_LIMITS.MAX;
}

function priceMessage() {
  return `Price is required for sale listings: a whole number of rupees from ${PRICE_LIMITS.MIN} to ${PRICE_LIMITS.MAX}.`;
}

module.exports = { validateCreateListing, validateUpdateListing };
