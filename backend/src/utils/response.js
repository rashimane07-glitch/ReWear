// Builds the standard success response so every endpoint looks the same:
//   { success: true, data: ..., meta: ... }   (meta only when provided)

function sendSuccess(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta !== undefined) {
    body.meta = meta;
  }
  return res.status(status).json(body);
}

module.exports = { sendSuccess };
