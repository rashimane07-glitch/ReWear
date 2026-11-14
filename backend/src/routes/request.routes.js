// URL → controller mapping only. Mounted at /api/v1/requests in app.js.
// EVERY route needs a login: requests are private between the owner and the requester.
const express = require('express');

const authenticate = require('../middleware/authenticate');
const requestController = require('../controllers/request.controller');

const router = express.Router();

router.use(authenticate);

router.post('/', requestController.create); //                 POST /api/v1/requests
router.get('/received', requestController.received); //        GET  /api/v1/requests/received  (must stay above /:id)
router.get('/sent', requestController.sent); //                GET  /api/v1/requests/sent      (must stay above /:id)
router.get('/:id', requestController.getOne); //               GET  /api/v1/requests/:id
router.post('/:id/accept', requestController.accept); //       POST /api/v1/requests/:id/accept    (owner)
router.post('/:id/decline', requestController.decline); //     POST /api/v1/requests/:id/decline   (owner)
router.post('/:id/cancel', requestController.cancel); //       POST /api/v1/requests/:id/cancel    (requester, or either after accept)
router.post('/:id/complete', requestController.complete); //   POST /api/v1/requests/:id/complete  (owner)

module.exports = router;
