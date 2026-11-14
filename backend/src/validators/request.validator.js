// Checks and cleans the input of the request endpoints (Task 9).
//
//   validateCreateRequest(body)   POST /api/v1/requests
//   validateListQuery(query)      GET  /api/v1/requests/received  and  /sent
//
// Only the fields below are accepted. Anything else (requesterId, ownerId, status, ...) is
// REJECTED, so a client can never choose who the requester is or what the status is: both
// always come from the login token and the server.
//
// Rules that depend on the stored listing (an exchange listing NEEDS an offered item, other
// types must not have one) are applied by the service, which is the only one that knows
// the listing.

const ApiError = require('../utils/ApiError');
const { REQUEST_STATUSES, REQUEST_LIMITS } = require('../config/constants');

const ALLOWED_FIELDS = ['listingId', 'message', 'offeredItem'];
const OFFER_FIELDS = ['title', 'description'];
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;
// Same, but keeps tab (\u0009) and new line (\u000A) for longer texts.
const CONTROL_CHARACTERS_EXCEPT_NEWLINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const cleanSingleLine = (value) => value.replace(CONTROL_CHARACTERS, '').replace(/\s+/g, ' ').trim();
const cleanMultiLine = (value) => value.replace(/\r\n?/g, '\n').replace(CONTROL_CHARACTERS_EXCEPT_NEWLINE, '').trim();

function validateOfferedItem(raw, addError) {
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    addError('offeredItem', 'Offered item must be an object: { "title": "...", "description": "..." }.');
    return null;
  }
  const unknown = Object.keys(raw).filter((key) => !OFFER_FIELDS.includes(key));
  if (unknown.length > 0) {
    addError('offeredItem', 'Offered item may only have "title" and "description".');
    return null;
  }

  const offer = {};
  const checks = [
    ['title', 'Offered item title', cleanSingleLine, REQUEST_LIMITS.OFFER_TITLE],
    ['description', 'Offered item description', cleanMultiLine, REQUEST_LIMITS.OFFER_DESCRIPTION],
  ];
  let ok = true;
  for (const [field, label, clean, { min, max }] of checks) {
    const value = typeof raw[field] === 'string' ? clean(raw[field]) : '';
    if (value === '') {
      addError(`offeredItem.${field}`, `${label} is required.`);
      ok = false;
    } else if (value.length < min || value.length > max) {
      addError(`offeredItem.${field}`, `${label} must be ${min}-${max} characters long.`);
      ok = false;
    } else {
      offer[field] = value;
    }
  }
  return ok ? offer : null;
}

// Returns { listingId, message, offeredItem } (message/offeredItem are null when not given).
function validateCreateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  const errors = [];
  const addError = (field, message) => errors.push({ field, message });

  Object.keys(body)
    .filter((key) => !ALLOWED_FIELDS.includes(key))
    .forEach((key) => addError(key.slice(0, 40), 'This field is not allowed.'));

  let listingId = null;
  if (typeof body.listingId !== 'string' || body.listingId.trim() === '') {
    addError('listingId', 'Listing ID is required.');
  } else if (!SAFE_ID.test(body.listingId.trim())) {
    addError('listingId', 'Listing ID is not valid.');
  } else {
    listingId = body.listingId.trim();
  }

  let message = null;
  if (body.message !== undefined && body.message !== null) {
    if (typeof body.message !== 'string') {
      addError('message', 'Message must be text.');
    } else {
      const text = cleanMultiLine(body.message);
      if (text.length > REQUEST_LIMITS.MAX_MESSAGE_LENGTH) {
        addError('message', `Message can be at most ${REQUEST_LIMITS.MAX_MESSAGE_LENGTH} characters.`);
      } else if (text !== '') {
        message = text;
      }
    }
  }

  let offeredItem = null;
  if (body.offeredItem !== undefined && body.offeredItem !== null) {
    offeredItem = validateOfferedItem(body.offeredItem, addError);
  }

  if (errors.length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
  }
  return { listingId, message, offeredItem };
}

// ?status=pending  or  ?status=pending,accepted  (or repeated). Returns { statuses } where
// statuses is an array, or null for "all".
function validateListQuery(query) {
  const input = query && typeof query === 'object' ? query : {};
  const errors = [];

  Object.keys(input)
    .filter((key) => key !== 'status')
    .forEach((key) => errors.push({ field: key.slice(0, 40), message: 'Unknown query parameter.' }));

  let statuses = null;
  if (input.status !== undefined) {
    const parts = Array.isArray(input.status) ? input.status : [input.status];
    if (!parts.every((part) => typeof part === 'string')) {
      errors.push({ field: 'status', message: 'Status must be plain text values.' });
    } else {
      const values = [
        ...new Set(
          parts
            .join(',')
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .filter((value) => value !== '')
        ),
      ];
      const unknown = values.filter((value) => !REQUEST_STATUSES.includes(value));
      if (unknown.length > 0) {
        errors.push({ field: 'status', message: `Status must be one of: ${REQUEST_STATUSES.join(', ')}.` });
      } else if (values.length > 0) {
        statuses = values;
      }
    }
  }

  if (errors.length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted query parameters.', errors);
  }
  return { statuses };
}

module.exports = { validateCreateRequest, validateListQuery };
