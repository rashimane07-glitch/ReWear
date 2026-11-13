// A custom error that carries an HTTP status and a machine-readable code.
// Throw it anywhere; the error handler in app.js turns it into the standard
// error response:  { success: false, error: { code, message, details } }
//
// Example:  throw new ApiError(409, 'EMAIL_TAKEN', 'This email is already registered.');

class ApiError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details; // optional, e.g. a list of field errors
  }
}

module.exports = ApiError;
