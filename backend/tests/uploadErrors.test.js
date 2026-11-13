const test = require('node:test');
const assert = require('node:assert/strict');

require('./helpers/fakes'); // sets fake settings before src/ is loaded
const { translateUploadError } = require('../src/middleware/uploadImages');
const ApiError = require('../src/utils/ApiError');

// multer's errors look like this: { name: 'MulterError', code: 'LIMIT_...', field }
const multerError = (code, field) => Object.assign(new Error(code), { name: 'MulterError', code, field });

test('file over the size limit -> 413 FILE_TOO_LARGE', () => {
  const err = translateUploadError(multerError('LIMIT_FILE_SIZE', 'images'));
  assert.ok(err instanceof ApiError);
  assert.equal(err.statusCode, 413);
  assert.equal(err.code, 'FILE_TOO_LARGE');
});

test('too many files -> 409 IMAGE_LIMIT_EXCEEDED', () => {
  for (const error of [multerError('LIMIT_FILE_COUNT'), multerError('LIMIT_UNEXPECTED_FILE', 'images')]) {
    const err = translateUploadError(error);
    assert.equal(err.statusCode, 409);
    assert.equal(err.code, 'IMAGE_LIMIT_EXCEEDED');
  }
});

test('file sent under the wrong field name -> 400 VALIDATION_ERROR', () => {
  const err = translateUploadError(multerError('LIMIT_UNEXPECTED_FILE', 'photo'));
  assert.equal(err.statusCode, 400);
  assert.equal(err.code, 'VALIDATION_ERROR');
});

test('other upload limits and broken multipart data -> 400', () => {
  assert.equal(translateUploadError(multerError('LIMIT_FIELD_COUNT')).statusCode, 400);
  assert.equal(translateUploadError(new Error('Unexpected end of form')).statusCode, 400);
  assert.equal(translateUploadError(new Error('Multipart: Boundary not found')).statusCode, 400);
});

test('our own ApiErrors pass through untouched; unknown errors are not disguised', () => {
  const own = new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'nope');
  assert.equal(translateUploadError(own), own);

  const unknown = new Error('something else broke');
  assert.equal(translateUploadError(unknown), unknown);
});
