// URL → controller mapping only. Mounted at /api/v1/reports in app.js.
// EVERY route needs a login. These are the STUDENT endpoints: a student can only send reports and
// read their own. The administrator endpoints are in admin.routes.js (/api/v1/admin/reports).
const express = require('express');

const authenticate = require('../middleware/authenticate');
const reportController = require('../controllers/report.controller');

const router = express.Router();

router.use(authenticate);

router.post('/', reportController.create); //     POST /api/v1/reports
router.get('/mine', reportController.mine); //    GET  /api/v1/reports/mine

module.exports = router;
