// Thin controller for the admin endpoints. The administrator is ALWAYS req.admin.id, set by
// requireAdmin from the verified token + the database role, never from the request body.

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { validateAdminListingsQuery, validateNoteBody } = require('../validators/admin.validator');
const adminService = require('../services/admin.service');

// GET /api/v1/admin/listings?state=&limit=&cursor=
const listListings = asyncHandler(async (req, res) => {
  const { listings, meta } = await adminService.listListings(validateAdminListingsQuery(req.query));
  sendSuccess(res, { listings }, { meta });
});

// POST /api/v1/admin/listings/:id/remove   body (optional): { note }
const removeListing = asyncHandler(async (req, res) => {
  const { note } = validateNoteBody(req.body);
  const listing = await adminService.removeListing(req.admin.id, req.params.id, note);
  sendSuccess(res, { listing });
});

module.exports = { listListings, removeListing };
