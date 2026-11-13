// Profile rules: a user may change only their OWN name and contact.
// The user ID always comes from the verified token, never from the request body.

const ApiError = require('../utils/ApiError');
const userRepository = require('../repositories/user.repository');
const { toPublicUser } = require('../serializers/user.serializer');

// If someone else changes the same document at the same moment, Cloudant rejects
// our save (revision conflict). We then re-read the fresh document and apply the
// change again, a few times, before giving up.
const MAX_ATTEMPTS = 3;

// `updates` is already validated: { name?, contact? } (contact may be null = remove)
async function updateProfile(userId, updates) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const userDoc = await userRepository.findUserById(userId);
    if (!userDoc) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Your account could not be found. Please log in again.');
    }

    // Start from the full stored document so every existing field
    // (passwordHash, role, email, createdAt, ...) is preserved exactly.
    const updatedDoc = { ...userDoc };
    if (updates.name !== undefined) {
      updatedDoc.name = updates.name;
    }
    if (updates.contact !== undefined) {
      updatedDoc.contact = updates.contact;
    }

    // Nothing actually changed: skip the write and leave updatedAt alone.
    const unchanged =
      updatedDoc.name === userDoc.name &&
      JSON.stringify(updatedDoc.contact || null) === JSON.stringify(userDoc.contact || null);
    if (unchanged) {
      return toPublicUser(userDoc);
    }

    updatedDoc.updatedAt = new Date().toISOString();

    const saved = await userRepository.updateUser(updatedDoc);
    if (saved) {
      return toPublicUser(updatedDoc);
    }
    // Revision conflict: loop again with a fresh copy.
  }

  throw new ApiError(409, 'CONFLICT', 'Your profile was changed elsewhere at the same time. Please try again.');
}

module.exports = { updateProfile };
