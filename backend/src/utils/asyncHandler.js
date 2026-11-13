// Express 4 does not catch errors thrown inside async route handlers by itself.
// Wrapping a handler with asyncHandler sends any error to the error handler in app.js.

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
