// Builds and configures the Express app. It does NOT start the server;
// server.js does that. Keeping them separate makes testing easier later.
const express = require('express');
const cors = require('cors');

const config = require('./config/env');
const { checkConnection } = require('./config/database');
const ApiError = require('./utils/ApiError');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const listingRoutes = require('./routes/listing.routes');
const requestRoutes = require('./routes/request.routes');
const adminRoutes = require('./routes/admin.routes');
const reportRoutes = require('./routes/report.routes');

const app = express();

// --- Basic middleware ---
// Only the React (Vite) frontend is allowed to call this API from a browser.
// The address comes from FRONTEND_URL (see src/config/env.js). Outside production, any
// http://localhost:<port> or http://127.0.0.1:<port> is accepted too, because Vite moves to the
// next free port (5174, 5175, ...) when 5173 is busy, and the browser would otherwise block every call.
const LOCAL_DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d{1,5}$/;
const isAllowedOrigin = (origin) =>
  origin === config.frontendUrl || (config.env !== 'production' && LOCAL_DEV_ORIGIN.test(origin));
app.use(
  cors({
    // No Origin header (curl, server-to-server, same-origin) is not a browser cross-site call: allow it.
    origin: (origin, callback) => callback(null, !origin || isAllowedOrigin(origin) ? origin || true : false),
  })
);
app.use(express.json({ limit: '1mb' })); // Parses JSON request bodies.

// --- Routes ---
// Every API route will live under /api/v1

// GET /api/v1/health
app.get('/api/v1/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      message: 'ReWear backend is running',
      timestamp: new Date().toISOString(),
    },
  });
});

// GET /api/v1/health/database
// Checks that Cloudant is reachable and the configured database is accessible.
// Works (with a clear message) even when no credentials have been entered yet.
app.get('/api/v1/health/database', async (req, res) => {
  const result = await checkConnection(); // never throws

  if (result.ok) {
    return res.status(200).json({
      success: true,
      data: {
        status: 'connected',
        database: result.database,
        message: result.message,
        timestamp: new Date().toISOString(),
      },
    });
  }

  // 503 = a service we depend on is not available (details in error.code)
  res.status(503).json({
    success: false,
    error: {
      code: result.status,
      message: result.message,
    },
  });
});

// --- Uploaded listing images (public, read-only) ---
// Only files inside backend/uploads are served. Express blocks ".." tricks, hidden
// files are denied, and there are no directory listings.
app.use(
  '/uploads',
  express.static(config.storage.uploadsDir, {
    index: false, // no directory index pages
    dotfiles: 'deny', // never serve hidden files
    redirect: false,
    maxAge: '7d', // image file names are unique and never change
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff'); // browsers must not guess the type
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // lets the frontend show the images
    },
  })
);

// --- Authentication: register, login, me ---
app.use('/api/v1/auth', authRoutes);

// --- Users: profile ---
app.use('/api/v1/users', userRoutes);

// --- Listings: create, image upload, read, edit, delete ---
app.use('/api/v1/listings', listingRoutes);

// --- Requests: ask for a listing, accept / decline / cancel / complete (all need a login) ---
app.use('/api/v1/requests', requestRoutes);

// --- Administration: see and remove listings, review reports (administrators only) ---
app.use('/api/v1/admin', adminRoutes);

// --- Reports: a student reports a listing or a user and reads their own reports (login needed) ---
app.use('/api/v1/reports', reportRoutes);

// --- 404 handler: no route matched ---
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
  });
});

// --- Error handler: catches errors thrown anywhere in the app ---
// Express recognises an error handler by its 4 parameters, so keep all 4.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Errors we threw on purpose (validation, wrong password, ...): safe to show.
  if (err instanceof ApiError) {
    const error = { code: err.code, message: err.message };
    if (err.details !== undefined) {
      error.details = err.details;
    }
    return res.status(err.statusCode).json({ success: false, error });
  }

  // Malformed JSON sent by the client
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body contains invalid JSON.',
      },
    });
  }

  // Anything unexpected: log it for us, but don't leak details to the client.
  console.error(err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on the server.',
    },
  });
});

module.exports = app;
