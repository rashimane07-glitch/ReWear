// Reads the uploaded image files from a multipart/form-data request ("multer").
// Files are kept in memory only briefly (max 5 files x 5 MB); the service then saves them
// to the local uploads folder (backend/uploads, see services/storage.service.js).
//
// Usage:  router.post('/:id/images', authenticate, uploadImages, controller.uploadImages);
// (authenticate goes FIRST so anonymous visitors cannot make the server read uploads.)
//
// The REAL file type is checked later, from the file's bytes (see utils/imageType.js).

const multer = require('multer');

const ApiError = require('../utils/ApiError');
const { IMAGE_LIMITS } = require('../config/constants');

const FIELD_NAME = 'images';
const MAX_MB = IMAGE_LIMITS.MAX_FILE_BYTES / (1024 * 1024);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: IMAGE_LIMITS.MAX_FILE_BYTES, // per file
    files: IMAGE_LIMITS.MAX_PER_LISTING, // per request
    fields: 5, // text fields we do not use; just a safety cap
  },
}).array(FIELD_NAME, IMAGE_LIMITS.MAX_PER_LISTING);

// Turns upload errors (from multer) into our standard API errors.
// Errors that are not upload problems are returned unchanged.
function translateUploadError(err) {
  if (err instanceof ApiError) {
    return err;
  }

  const code = err && typeof err.code === 'string' ? err.code : '';

  if (code === 'LIMIT_FILE_SIZE') {
    return new ApiError(413, 'FILE_TOO_LARGE', `Each image must be ${MAX_MB} MB or smaller.`);
  }

  // More files than allowed in one request.
  if (code === 'LIMIT_FILE_COUNT' || (code === 'LIMIT_UNEXPECTED_FILE' && err.field === FIELD_NAME)) {
    return new ApiError(
      409,
      'IMAGE_LIMIT_EXCEEDED',
      `You can upload at most ${IMAGE_LIMITS.MAX_PER_LISTING} images per listing.`
    );
  }

  // A file sent under a different form field name.
  if (code === 'LIMIT_UNEXPECTED_FILE') {
    return new ApiError(400, 'VALIDATION_ERROR', `Send the image files in the "${FIELD_NAME}" field.`);
  }

  if (code.startsWith('LIMIT_') || code === 'MISSING_FIELD_NAME') {
    return new ApiError(400, 'VALIDATION_ERROR', 'The upload request is not valid.');
  }

  // Broken multipart data (cut-off upload, bad boundary, ...).
  if (err && /multipart|boundary|unexpected end|malformed/i.test(String(err.message))) {
    return new ApiError(400, 'VALIDATION_ERROR', 'The upload could not be read. Please try again.');
  }

  return err; // unknown error: the global error handler answers with a safe 500
}

function uploadImages(req, res, next) {
  upload(req, res, (err) => {
    if (err) {
      return next(translateUploadError(err));
    }
    return next();
  });
}

module.exports = { uploadImages, translateUploadError };
