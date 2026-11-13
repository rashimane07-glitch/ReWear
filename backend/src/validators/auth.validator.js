// Checks and cleans the data sent to the auth endpoints.
// Each function returns the CLEANED values, or throws a 400 ApiError listing
// every problem at once so the frontend can show all field errors together.
//
// Only the fields we expect are ever read. Anything else in the request body
// (for example a "role" field) is ignored, so nobody can sneak in extra data.

const ApiError = require('../utils/ApiError');

const NAME_MIN = 2;
const NAME_MAX = 60;
const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt silently ignores everything after 72 bytes

// A practical email pattern: something@domain.tld (the domain needs a dot).
const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

// The request body may be missing or not an object (e.g. no JSON was sent).
function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function cleanName(value) {
  return value.replace(CONTROL_CHARACTERS, '').replace(/\s+/g, ' ').trim();
}

function throwIfErrors(errors) {
  if (errors.length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
  }
}

function validateRegisterInput(body) {
  const input = asObject(body);
  const errors = [];

  // --- name ---
  let name = '';
  if (typeof input.name !== 'string' || input.name.trim() === '') {
    errors.push({ field: 'name', message: 'Name is required.' });
  } else {
    name = cleanName(input.name);
    if (name.length < NAME_MIN || name.length > NAME_MAX) {
      errors.push({ field: 'name', message: `Name must be ${NAME_MIN}-${NAME_MAX} characters long.` });
    } else if (/[<>]/.test(name)) {
      errors.push({ field: 'name', message: 'Name cannot contain < or > characters.' });
    }
  }

  // --- email ---
  let email = '';
  if (typeof input.email !== 'string' || input.email.trim() === '') {
    errors.push({ field: 'email', message: 'Email is required.' });
  } else {
    email = normalizeEmail(input.email);
    if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
      errors.push({ field: 'email', message: 'Please enter a valid email address.' });
    }
  }

  // --- password (never trimmed or changed: spaces may be intentional) ---
  const password = input.password;
  if (typeof password !== 'string' || password === '') {
    errors.push({ field: 'password', message: 'Password is required.' });
  } else if (password.length < PASSWORD_MIN) {
    errors.push({ field: 'password', message: `Password must be at least ${PASSWORD_MIN} characters long.` });
  } else if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    errors.push({ field: 'password', message: `Password is too long (maximum ${PASSWORD_MAX_BYTES} bytes).` });
  }

  throwIfErrors(errors);
  return { name, email, password };
}

function validateLoginInput(body) {
  const input = asObject(body);
  const errors = [];

  let email = '';
  if (typeof input.email !== 'string' || input.email.trim() === '') {
    errors.push({ field: 'email', message: 'Email is required.' });
  } else {
    // No format check here on purpose: a malformed email simply won't match
    // any account and gets the same generic "invalid credentials" answer.
    email = normalizeEmail(input.email);
  }

  const password = input.password;
  if (typeof password !== 'string' || password === '') {
    errors.push({ field: 'password', message: 'Password is required.' });
  }

  throwIfErrors(errors);
  return { email, password };
}

module.exports = { validateRegisterInput, validateLoginInput };
