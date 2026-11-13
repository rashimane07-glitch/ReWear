// Decides exactly which user fields are allowed to leave the server.
// Always build user responses with this function. It lists the safe fields
// one by one, so passwordHash (or anything added to the document later) can
// never leak by accident.

const USER_ID_PREFIX = 'user:';

function toPublicUser(userDoc) {
  return {
    id: userDoc._id.startsWith(USER_ID_PREFIX) ? userDoc._id.slice(USER_ID_PREFIX.length) : userDoc._id,
    name: userDoc.name,
    email: userDoc.email,
    role: userDoc.role,
    contact: userDoc.contact || null,
    createdAt: userDoc.createdAt,
  };
}

module.exports = { toPublicUser };
