// Protects a route. Usage:  router.get('/me', authenticate, controller.me);
//
// It expects the header:   Authorization: Bearer <token>
// On success it sets  req.user = { id, role }  for the next handler.
// On failure it answers 401 in the standard error format.
//
// This check is stateless: it trusts the signed token and does not query the database.

const ApiError = require('../utils/ApiError');
const { verifyToken } = require('../utils/token');

function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return next(new ApiError(401, 'UNAUTHORIZED', 'Authentication required. Please log in.'));
  }

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) {
    return next(new ApiError(401, 'UNAUTHORIZED', 'Invalid authentication header. Use: Authorization: Bearer <token>'));
  }

  try {
    const { userId, role } = verifyToken(match[1]);
    req.user = { id: userId, role };
    return next();
  } catch (err) {
    return next(err); // already an ApiError (401 or 503)
  }
}

module.exports = authenticate;
