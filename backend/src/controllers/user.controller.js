// Thin controller: validate, call the service, send the response.

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { validateProfileUpdate } = require('../validators/user.validator');
const userService = require('../services/user.service');

// PATCH /api/v1/users/me   (requires a valid token)
// req.user.id comes from the verified JWT, never from the request body.
const updateMe = asyncHandler(async (req, res) => {
  const updates = validateProfileUpdate(req.body);
  const user = await userService.updateProfile(req.user.id, updates);
  sendSuccess(res, { user });
});

module.exports = { updateMe };
