// Creates the IBM Cloudant client (ONE shared instance for the whole app).
//
// Other files should use it like this:
//   const { getClient } = require('./config/cloudant');
//   const client = getClient();
//
// This file does NOT connect to anything by itself. The client is only built
// the first time getClient() is called, so the server can start without
// credentials (and even before the SDK is installed).

const config = require('./env');

let client = null; // cached so we never create more than one client

// True only when both the Cloudant URL and API key have been entered in .env
function isConfigured() {
  return Boolean(config.cloudant.url && config.cloudant.apiKey);
}

function getClient() {
  // Reuse the existing client if we already made one.
  if (client) {
    return client;
  }

  if (!isConfigured()) {
    const error = new Error('Cloudant credentials are not configured.');
    error.code = 'CLOUDANT_NOT_CONFIGURED';
    throw error;
  }

  // Loaded here (not at the top of the file) on purpose: if the package is
  // missing, only database features fail, not the whole server.
  const sdk = require('@ibm-cloud/cloudant');
  const { CloudantV1 } = sdk;

  // The SDK re-exports IamAuthenticator. If a future version stops doing so,
  // fall back to the package it is built on (ibm-cloud-sdk-core).
  const IamAuthenticator =
    sdk.IamAuthenticator || require('ibm-cloud-sdk-core').IamAuthenticator;

  // IAM API-key authentication: the SDK exchanges the key for short-lived
  // access tokens and refreshes them for us.
  const newClient = new CloudantV1({
    authenticator: new IamAuthenticator({ apikey: config.cloudant.apiKey }),
  });
  newClient.setServiceUrl(config.cloudant.url);

  client = newClient;
  return client;
}

module.exports = { isConfigured, getClient };
