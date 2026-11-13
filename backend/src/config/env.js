// Central place for ALL configuration.
// Rule for the rest of the project: never read process.env directly in other files.
// Instead, do: const config = require('./config/env');  and use config.port, etc.

const path = require('path');
const dotenv = require('dotenv');

// Load backend/.env. The path is explicit so it works no matter which folder
// you start Node from. If the file does not exist, dotenv simply does nothing
// and the defaults below are used.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Reads a variable as text. Returns the fallback if it is missing or blank.
function readString(name, fallback = '') {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  return value.trim();
}

// Reads a variable as a valid port number (1-65535).
// Falls back (with a warning) if the value is set but not a valid port.
function readPort(name, fallback) {
  const raw = readString(name);
  if (raw === '') {
    return fallback;
  }
  const port = Number(raw);
  if (Number.isInteger(port) && port >= 1 && port <= 65535) {
    return port;
  }
  console.warn(`Warning: ${name}="${raw}" is not a valid port. Using ${fallback}.`);
  return fallback;
}

const port = readPort('PORT', 5000);

const config = {
  // --- Server (have defaults, so the app always starts) ---
  env: readString('NODE_ENV', 'development'),
  port,

  // The React frontend's address. Used for CORS.
  // Trailing slashes are removed because CORS needs an exact match.
  frontendUrl: readString('FRONTEND_URL', 'http://localhost:5173').replace(/\/+$/, ''),

  // --- Future modules ---
  // These are intentionally EMPTY by default and nothing checks them yet,
  // so the server starts fine without them. Each module will check for its
  // own values later and show a clear error only when that feature is used.

  // Authentication: the secret has NO default on purpose (see src/utils/token.js,
  // which refuses to create tokens until a strong secret is set).
  jwt: {
    secret: readString('JWT_SECRET'),
    expiresIn: readString('JWT_EXPIRES_IN', '7d'),
  },

  // IBM Cloudant database (see src/config/cloudant.js and database.js).
  // url + apiKey are empty until you add them to .env; the server still starts.
  cloudant: {
    url: readString('CLOUDANT_URL'),
    apiKey: readString('CLOUDANT_APIKEY'),
    database: readString('CLOUDANT_DATABASE', 'rewear'),
  },

  // Local image storage (see src/services/storage.service.js).
  // Both have working defaults, so nothing needs to be set to get started.
  storage: {
    // Folder where uploaded images are saved (default: backend/uploads, ignored by Git).
    uploadsDir: path.resolve(__dirname, '../..', readString('UPLOADS_DIR', 'uploads')),
    // Public address of THIS backend. Image links look like
    // <backendUrl>/uploads/listings/<listingId>/<file>.jpg
    backendUrl: readString('BACKEND_URL', `http://localhost:${port}`).replace(/\/+$/, ''),
  },
};

module.exports = config;
