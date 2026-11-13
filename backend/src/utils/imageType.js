// Works out what an uploaded file REALLY is by reading its first bytes
// ("magic numbers"). The file name and the Content-Type sent by the browser
// can be faked, the bytes cannot, so only this check is trusted.
//
// Returns { mime, ext } for JPEG, PNG or WebP, otherwise null.

function startsWith(buffer, bytes, offset = 0) {
  if (buffer.length < offset + bytes.length) {
    return false;
  }
  return bytes.every((byte, i) => buffer[offset + i] === byte);
}

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return null;
  }

  // JPEG: FF D8 FF
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: 'image/png', ext: 'png' };
  }

  // WebP: "RIFF" ???? "WEBP"
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  return null;
}

module.exports = { detectImageType };
