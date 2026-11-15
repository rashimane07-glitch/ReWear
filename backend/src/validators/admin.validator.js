// Checks and cleans the input of the admin endpoints (Task 10).
//
//   validateAdminListingsQuery(query)   GET  /api/v1/admin/listings
//   validateNoteBody(body)              POST bodies that carry only an optional admin note
//
// Unknown query parameters and body fields are REJECTED, so a typo never silently changes
// what an administrator sees or does.

const ApiError = require('../utils/ApiError');
const { ADMIN, ADMIN_LISTING_STATES } = require('../config/constants');

const CURSOR_PATTERN = /^[A-Za-z0-9_\-+/=]{1,2000}$/;
const CONTROL_CHARACTERS_EXCEPT_NEWLINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const cleanMultiLine = (value) => value.replace(/\r\n?/g, '\n').replace(CONTROL_CHARACTERS_EXCEPT_NEWLINE, '').trim();

function fail(errors, message = 'Please correct the highlighted fields.') {
  throw new ApiError(400, 'VALIDATION_ERROR', message, errors);
}

// Returns { state, limit, cursor }:  state is one of ADMIN_LISTING_STATES or null ("all live listings").
function validateAdminListingsQuery(query) {
  const input = query && typeof query === 'object' ? query : {};
  const errors = [];
  const allowed = ['state', 'limit', 'cursor'];

  Object.keys(input)
    .filter((key) => !allowed.includes(key))
    .forEach((key) => errors.push({ field: key.slice(0, 40), message: 'Unknown query parameter.' }));

  // A parameter that is missing or empty counts as "not given".
  const single = (name) => {
    const raw = input[name];
    if (raw === undefined || raw === '') return undefined;
    if (typeof raw !== 'string') {
      errors.push({ field: name, message: `${name} must be a single value.` });
      return undefined;
    }
    return raw.trim();
  };

  let state = null;
  const rawState = single('state');
  if (rawState !== undefined && rawState !== '') {
    const value = rawState.toLowerCase();
    if (ADMIN_LISTING_STATES.includes(value)) state = value;
    else errors.push({ field: 'state', message: `State must be one of: ${ADMIN_LISTING_STATES.join(', ')}.` });
  }

  let limit = ADMIN.DEFAULT_LIST_LIMIT;
  const rawLimit = single('limit');
  if (rawLimit !== undefined && rawLimit !== '') {
    const parsed = /^\d{1,6}$/.test(rawLimit) ? Number(rawLimit) : NaN;
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > ADMIN.MAX_LIST_LIMIT) {
      errors.push({ field: 'limit', message: `Limit must be a whole number from 1 to ${ADMIN.MAX_LIST_LIMIT}.` });
    } else {
      limit = parsed;
    }
  }

  let cursor;
  const rawCursor = single('cursor');
  if (rawCursor !== undefined && rawCursor !== '') {
    if (CURSOR_PATTERN.test(rawCursor)) cursor = rawCursor;
    else errors.push({ field: 'cursor', message: 'Invalid cursor. Start again without it.' });
  }

  if (errors.length > 0) fail(errors, 'Please correct the highlighted query parameters.');
  return { state, limit, cursor };
}

// Body is either missing/empty or { "note": "..." }. Returns { note } (null when not given).
function validateNoteBody(body) {
  if (body === undefined || body === null) return { note: null };
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  const errors = [];
  Object.keys(body)
    .filter((key) => key !== 'note')
    .forEach((key) => errors.push({ field: key.slice(0, 40), message: 'This field is not allowed.' }));

  let note = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') {
      errors.push({ field: 'note', message: 'Note must be text.' });
    } else {
      const text = cleanMultiLine(body.note);
      if (text.length > ADMIN.MAX_NOTE_LENGTH) {
        errors.push({ field: 'note', message: `Note can be at most ${ADMIN.MAX_NOTE_LENGTH} characters.` });
      } else if (text !== '') {
        note = text;
      }
    }
  }

  if (errors.length > 0) fail(errors);
  return { note };
}

module.exports = { validateAdminListingsQuery, validateNoteBody, cleanMultiLine };
