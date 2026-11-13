// URL → controller mapping only. Mounted at /api/v1/listings in app.js.
const express = require('express');

const authenticate = require('../middleware/authenticate');
const { uploadImages } = require('../middleware/uploadImages');
const listingController = require('../controllers/listing.controller');

const router = express.Router();

router.post('/', authenticate, listingController.create); //                          POST /api/v1/listings
router.get('/mine', authenticate, listingController.listMine); //                     GET    /api/v1/listings/mine  (must stay above /:id)
router.get('/:id', authenticate, listingController.getOne); //                         GET    /api/v1/listings/:id
router.patch('/:id', authenticate, listingController.update); //                       PATCH  /api/v1/listings/:id
router.delete('/:id', authenticate, listingController.remove); //                     DELETE /api/v1/listings/:id
router.post('/:id/images', authenticate, uploadImages, listingController.uploadImages); // POST /api/v1/listings/:id/images

module.exports = router;
