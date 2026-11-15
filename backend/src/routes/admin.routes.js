// URL → controller mapping only. Mounted at /api/v1/admin in app.js.
// EVERY route here needs a valid login AND the administrator role (checked in the database).
const express = require('express');

const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const adminController = require('../controllers/admin.controller');
const reportController = require('../controllers/report.controller');

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get('/listings', adminController.listListings); //               GET  /api/v1/admin/listings
router.post('/listings/:id/remove', adminController.removeListing); //  POST /api/v1/admin/listings/:id/remove

router.get('/reports', reportController.adminList); //                  GET  /api/v1/admin/reports?status=&targetType=
router.get('/reports/:id', reportController.adminGet); //               GET  /api/v1/admin/reports/:id
router.post('/reports/:id/dismiss', reportController.adminDismiss); //  POST /api/v1/admin/reports/:id/dismiss
router.post('/reports/:id/resolve', reportController.adminResolve); //  POST /api/v1/admin/reports/:id/resolve

module.exports = router;
