// Protects an administrator-only route. Always use it AFTER authenticate:
//
//   router.use(authenticate, requireAdmin);
//
// The role is read from the DATABASE on every call, not from the login token. A token is
// valid for days, so trusting its "role" claim would let a demoted or deleted admin keep
// working until the token expires. Reading the role here means a change takes effect at once.
//
//   no / bad token  -> 401 (authenticate)
//   deleted account -> 401
//   not an admin    -> 403, with no hint about what the admin area contains
//
// On success it sets req.admin = { id }.

const ApiError = require('../utils/ApiError');
const { ROLES } = require('../config/constants');
const userRepository = require('../repositories/user.repository');

async function requireAdmin(req, res, next) {
  try {
    const user = await userRepository.findUserById(req.user.id);
    if (!user) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Your account could not be found. Please log in again.');
    }
    if (user.role !== ROLES.ADMIN) {
      throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required.');
    }
    req.admin = { id: req.user.id };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAdmin;
