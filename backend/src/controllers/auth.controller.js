// Controllers are thin: read the request, call the validator and the service,
// then send the response. The real rules live in the service.

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { validateRegisterInput, validateLoginInput } = require('../validators/auth.validator');
const authService = require('../services/auth.service');

// POST /api/v1/auth/register
const register = asyncHandler(async (req, res) => {
  const input = validateRegisterInput(req.body);
  const { token, user } = await authService.register(input);
  sendSuccess(res, { token, user }, { status: 201 });
});

// POST /api/v1/auth/login
const login = asyncHandler(async (req, res) => {
  const input = validateLoginInput(req.body);
  const { token, user } = await authService.login(input);
  sendSuccess(res, { token, user });
});

// GET /api/v1/auth/me   (requires a valid token; see middleware/authenticate.js)
const me = asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user.id);
  sendSuccess(res, { user });
});

module.exports = { register, login, me };
