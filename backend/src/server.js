// Entry point: starts the server.
// All settings come from the central config (src/config/env.js),
// which also loads the .env file.
const config = require('./config/env');
const app = require('./app');
const { logConnectionStatus } = require('./config/database');
const { checkJwtConfig } = require('./utils/token');
const { logStorageStatus } = require('./services/storage.service');

app.listen(config.port, () => {
  console.log(`ReWear backend running on port ${config.port} (${config.env})`);
  console.log(`Allowing requests from frontend: ${config.frontendUrl}`);

  // Report whether Cloudant is reachable. This only READS (never creates anything)
  // and never stops the server, even if Cloudant is not configured yet.
  logConnectionStatus();

  // Warn (never crash) if login tokens cannot be created yet.
  const jwtStatus = checkJwtConfig();
  if (jwtStatus.ok) {
    console.log('[auth] JWT settings look good.');
  } else {
    console.warn(`[auth] ${jwtStatus.message}`);
    console.warn('[auth] The server is still running; register and login stay unavailable until this is fixed.');
  }

  // Make sure the local uploads folder exists and is writable (never crashes).
  logStorageStatus();
});
