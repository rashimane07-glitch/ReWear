// The business rules of authentication: who may register, who may log in.
// It talks to the database only through the repository, and never to HTTP.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ApiError = require('../utils/ApiError');
const userRepository = require('../repositories/user.repository');
const { toPublicUser } = require('../serializers/user.serializer');
const { signToken, assertJwtConfigured } = require('../utils/token');

// How much work bcrypt does per password. Higher = safer but slower.
// 10 is a common, sensible default for the pure-JavaScript bcryptjs.
const BCRYPT_ROUNDS = 10;

// Every public registration gets this role. The request body can never change it.
// (Admin accounts are created separately, in a later step.)
const DEFAULT_ROLE = 'student';

// A reserved email whose account never appeared is treated as a leftover from a
// crashed registration, but only after this long, so we never steal an email from
// a registration that is still in progress.
const LEFTOVER_AFTER_MS = 60 * 1000;

// A real bcrypt hash of a random value. When a login email does not exist we still
// run a comparison against this, so "unknown email" and "wrong password" take about
// the same time and an attacker can't tell them apart.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_ROUNDS);

function emailTakenError() {
  return new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
}

// Called when the email key already exists. Throws EMAIL_TAKEN unless the key is a leftover.
async function claimLeftoverEmail(email, userId, existing) {
  if (!existing) {
    throw emailTakenError();
  }

  const owner = await userRepository.findUserById(existing.userId);
  const ageMs = Date.now() - Date.parse(existing.createdAt);
  const isLeftover = !owner && Number.isFinite(ageMs) && ageMs > LEFTOVER_AFTER_MS;

  if (!isLeftover) {
    throw emailTakenError();
  }

  const tookOver = await userRepository.repointEmail(email, userId, existing.rev);
  if (!tookOver) {
    throw emailTakenError(); // someone else got there first
  }
}

// `input` is already validated and cleaned: { name, email, password }
async function register({ name, email, password }) {
  const userId = crypto.randomUUID();

  // Fail fast (before creating anything) if token settings are broken.
  assertJwtConfigured();

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // Reserve the email. This is what makes duplicates impossible.
  const claim = await userRepository.claimEmail(email, userId);
  if (!claim.claimed) {
    await claimLeftoverEmail(email, userId, claim.existing);
  }

  const now = new Date().toISOString();
  const userBody = {
    type: 'user',
    name,
    email,
    passwordHash,
    role: DEFAULT_ROLE,
    contact: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await userRepository.insertUser(userId, userBody);
  } catch (err) {
    await userRepository.releaseEmail(email, userId); // don't leave the email locked
    throw err;
  }

  const user = toPublicUser({ _id: `user:${userId}`, ...userBody });
  const token = signToken({ userId, role: DEFAULT_ROLE });
  return { token, user };
}

// `input` is already validated and cleaned: { email, password }
async function login({ email, password }) {
  assertJwtConfigured();

  const userDoc = await userRepository.findUserByEmail(email);

  const hashToCheck = userDoc && typeof userDoc.passwordHash === 'string' ? userDoc.passwordHash : DUMMY_HASH;
  const passwordMatches = await bcrypt.compare(password, hashToCheck);

  // One generic answer for "no such email" and "wrong password".
  if (!userDoc || !passwordMatches) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }

  const userId = userDoc._id.slice('user:'.length);
  const token = signToken({ userId, role: userDoc.role });
  return { token, user: toPublicUser(userDoc) };
}

// Returns the safe profile of the logged-in user.
async function getCurrentUser(userId) {
  const userDoc = await userRepository.findUserById(userId);
  if (!userDoc) {
    // The token is valid but the account no longer exists.
    throw new ApiError(401, 'UNAUTHORIZED', 'Your account could not be found. Please log in again.');
  }
  return toPublicUser(userDoc);
}

module.exports = { register, login, getCurrentUser };
