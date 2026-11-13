// Checks and cleans the body of PATCH /api/v1/users/me.
//
// Only "name" and "contact" may be changed. Any other field (email, password,
// role, id, ...) is REJECTED, not silently ignored, so the frontend learns
// immediately if it sends something it shouldn't.
//
// NOTE: the name rules are the same as in auth.validator.js. Keep them in sync.

const ApiError = require('../utils/ApiError');

const ALLOWED_FIELDS = ['name', 'contact'];
const CONTACT_TYPES = ['phone']; // add more types here later (e.g. 'whatsapp')

const NAME_MIN = 2;
const NAME_MAX = 60;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

// Returns { name } or { error }.
function checkName(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return { error: 'Name must be a non-empty text.' };
  }
  const name = value.replace(CONTROL_CHARACTERS, '').replace(/\s+/g, ' ').trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { error: `Name must be ${NAME_MIN}-${NAME_MAX} characters long.` };
  }
  if (/[<>]/.test(name)) {
    return { error: 'Name cannot contain < or > characters.' };
  }
  return { name };
}

// Phone numbers are stored in international format, e.g. +919876543210.
// Spaces, dashes, dots and brackets are removed; a bare 10-digit Indian mobile
// number (starting 6-9) gets the +91 prefix.
function normalizePhone(raw) {
  const compact = raw.replace(/[\s\-().]/g, '');
  if (/^[6-9]\d{9}$/.test(compact)) {
    return `+91${compact}`;
  }
  if (/^\+[1-9]\d{7,14}$/.test(compact)) {
    return compact;
  }
  return null;
}

// Returns { contact } (an object, or null meaning "remove") or { error }.
function checkContact(value) {
  if (value === null) {
    return { contact: null };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Contact must be { "type": "phone", "value": "+91XXXXXXXXXX" }, or null to remove it.' };
  }
  if (Object.keys(value).some((key) => key !== 'type' && key !== 'value')) {
    return { error: 'Contact may only have "type" and "value".' };
  }

  const type = typeof value.type === 'string' ? value.type.trim().toLowerCase() : '';
  if (!CONTACT_TYPES.includes(type)) {
    return { error: `Contact type must be one of: ${CONTACT_TYPES.join(', ')}.` };
  }

  const phone = typeof value.value === 'string' ? normalizePhone(value.value) : null;
  if (!phone) {
    return { error: 'Enter a valid phone number, for example +919876543210.' };
  }
  return { contact: { type, value: phone } };
}

// Returns the cleaned updates, e.g. { name: 'Rashi' } or { contact: null },
// or throws a 400 ApiError listing every problem.
function validateProfileUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  const keys = Object.keys(body);
  if (keys.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'No changes provided. Send at least one of: name, contact.');
  }

  const errors = [];
  const updates = {};

  keys
    .filter((key) => !ALLOWED_FIELDS.includes(key))
    .forEach((key) => {
      errors.push({
        field: key.slice(0, 40),
        message: 'This field cannot be changed here. Only name and contact can be updated.',
      });
    });

  if (keys.includes('name')) {
    const result = checkName(body.name);
    if (result.error) {
      errors.push({ field: 'name', message: result.error });
    } else {
      updates.name = result.name;
    }
  }

  if (keys.includes('contact')) {
    const result = checkContact(body.contact);
    if (result.error) {
      errors.push({ field: 'contact', message: result.error });
    } else {
      updates.contact = result.contact;
    }
  }

  if (errors.length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
  }
  return updates;
}

module.exports = { validateProfileUpdate };
