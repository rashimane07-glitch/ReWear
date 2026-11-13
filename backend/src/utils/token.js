// Everything about creating and reading login tokens (JWT).
// The secret and the lifetime come from the central config (.env), never from code.
//
// What is inside our token:
//   sub  = the user's ID (without the "user:" prefix)
//   role = "student" or "admin"
//   iat / exp = when it was issued / when it expires (added automatically)

const jwt = require('jsonwebtoken');

const config = require('../config/env');
const ApiError = require('./ApiError');

const ALGORITHM = 'HS256';
const MIN_SECRET_LENGTH = 32; // a short secret is easy to guess, so we refuse it
const VALID_ROLES = ['student', 'admin'];

// A plain number means "seconds". Without this, jsonwebtoken would read the
// text "3600" as 3600 MILLIseconds, a classic gotcha.
function getExpiresIn() {
  const raw = config.jwt.expiresIn;
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }
  return raw; // e.g. "7d", "12h"
}

// Describes whether JWT settings are usable. Never includes the secret itself.
function checkJwtConfig() {
  if (!config.jwt.secret) {
    return { ok: false, message: 'JWT_SECRET is not set. Add it to your .env file to enable login.' };
  }
  if (config.jwt.secret.length < MIN_SECRET_LENGTH) {
    return {
      ok: false,
      message: `JWT_SECRET is too short. Use at least ${MIN_SECRET_LENGTH} characters (see .env.example for a one-line generator).`,
    };
  }
  const expiresIn = getExpiresIn();
  const expiresInOk = typeof expiresIn === 'number' ? expiresIn > 0 : /^\d+\s*[a-zA-Z]+$/.test(expiresIn);
  if (!expiresInOk) {
    return { ok: false, message: 'JWT_EXPIRES_IN is not valid. Use a value such as 7d, 12h or 3600.' };
  }
  return { ok: true, message: 'JWT settings look good.' };
}

// Throws a safe 503 if the settings are unusable. The server itself keeps running.
function assertJwtConfigured() {
  const status = checkJwtConfig();
  if (!status.ok) {
    throw new ApiError(
      503,
      'AUTH_NOT_CONFIGURED',
      'Authentication is not configured on the server yet. Please try again later.'
    );
  }
}

// Creates a signed token for a user. `userId` is the public ID (no prefix).
function signToken({ userId, role }) {
  assertJwtConfigured();
  return jwt.sign({ role }, config.jwt.secret, {
    algorithm: ALGORITHM,
    subject: userId,
    expiresIn: getExpiresIn(),
  });
}

// Checks a token and returns { userId, role }, or throws a 401 ApiError.
function verifyToken(token) {
  assertJwtConfigured();

  let payload;
  try {
    // Only accept the algorithm we use. This blocks "alg: none" style tricks.
    payload = jwt.verify(token, config.jwt.secret, { algorithms: [ALGORITHM] });
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'TOKEN_EXPIRED', 'Your session has expired. Please log in again.');
    }
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid authentication token.');
  }

  // Defensive: a correctly signed token should always have these, but check anyway.
  if (!payload || typeof payload.sub !== 'string' || !VALID_ROLES.includes(payload.role)) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid authentication token.');
  }

  return { userId: payload.sub, role: payload.role };
}

module.exports = { signToken, verifyToken, checkJwtConfig, assertJwtConfigured };
