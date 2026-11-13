// URL → controller mapping only. Mounted at /api/v1/users in app.js.
const express = require('express');

const authenticate = require('../middleware/authenticate');
const userController = require('../controllers/user.controller');

const router = express.Router();

router.patch('/me', authenticate, userController.updateMe); // PATCH /api/v1/users/me

module.exports = router;
