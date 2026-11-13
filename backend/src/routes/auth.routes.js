// URL → controller mapping only. Mounted at /api/v1/auth in app.js.
const express = require('express');

const authenticate = require('../middleware/authenticate');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', authController.register); // POST /api/v1/auth/register
router.post('/login', authController.login); //       POST /api/v1/auth/login
router.get('/me', authenticate, authController.me); // GET  /api/v1/auth/me

module.exports = router;
