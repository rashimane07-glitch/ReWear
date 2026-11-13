// Thin controller: validate, call the service, send the response.
// The owner is ALWAYS req.user.id (from the verified login token), never from the request body.

const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/response');
const { validateCreateListing, validateUpdateListing } = require('../validators/listing.validator');
const listingService = require('../services/listing.service');

// POST /api/v1/listings   (JSON body; requires a valid token)
const create = asyncHandler(async (req, res) => {
  const input = validateCreateListing(req.body);
  const listing = await listingService.createListing(req.user.id, input);
  sendSuccess(res, { listing }, { status: 201 });
});

// POST /api/v1/listings/:id/images   (multipart/form-data, field "images"; requires a valid token)
// The files are read by middleware/uploadImages.js and arrive here as req.files.
const uploadImages = asyncHandler(async (req, res) => {
  if (!Array.isArray(req.files) || req.files.length === 0) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'No images received. Send one or more image files in the "images" field (multipart/form-data).'
    );
  }
  const listing = await listingService.addImages(req.user.id, req.params.id, req.files);
  sendSuccess(res, { listing });
});

// GET /api/v1/listings/mine   (requires a valid token)
const listMine = asyncHandler(async (req, res) => {
  const listings = await listingService.getMyListings(req.user.id);
  sendSuccess(res, { listings }, { meta: { count: listings.length } });
});

// GET /api/v1/listings/:id   (requires a valid token)
const getOne = asyncHandler(async (req, res) => {
  const listing = await listingService.getListing(req.params.id);
  sendSuccess(res, { listing });
});

// PATCH /api/v1/listings/:id   (JSON body, owner only)
const update = asyncHandler(async (req, res) => {
  const updates = validateUpdateListing(req.body);
  const listing = await listingService.updateListing(req.user.id, req.params.id, updates);
  sendSuccess(res, { listing });
});

// DELETE /api/v1/listings/:id   (owner only)
const remove = asyncHandler(async (req, res) => {
  const { id } = await listingService.deleteListing(req.user.id, req.params.id);
  sendSuccess(res, { id, deleted: true });
});

module.exports = { create, uploadImages, listMine, getOne, update, remove };
