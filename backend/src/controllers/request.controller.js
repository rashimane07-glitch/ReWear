// Thin controller: validate, call the service, send the response.
// The requester/owner is ALWAYS req.user.id (from the verified login token), never from the
// request body or the URL.

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { validateCreateRequest, validateListQuery } = require('../validators/request.validator');
const requestService = require('../services/request.service');

// POST /api/v1/requests   body: { listingId, message?, offeredItem? }
const create = asyncHandler(async (req, res) => {
  const input = validateCreateRequest(req.body);
  const request = await requestService.createRequest(req.user.id, input);
  sendSuccess(res, { request }, { status: 201 });
});

// GET /api/v1/requests/received?status=   (requests for MY listings)
const received = asyncHandler(async (req, res) => {
  const { statuses } = validateListQuery(req.query);
  const requests = await requestService.listRequests(req.user.id, 'received', statuses);
  sendSuccess(res, { requests }, { meta: { count: requests.length } });
});

// GET /api/v1/requests/sent?status=   (requests I sent)
const sent = asyncHandler(async (req, res) => {
  const { statuses } = validateListQuery(req.query);
  const requests = await requestService.listRequests(req.user.id, 'sent', statuses);
  sendSuccess(res, { requests }, { meta: { count: requests.length } });
});

// GET /api/v1/requests/:id   (owner or requester only)
const getOne = asyncHandler(async (req, res) => {
  const request = await requestService.getRequest(req.user.id, req.params.id);
  sendSuccess(res, { request });
});

// POST /api/v1/requests/:id/accept | decline | cancel | complete
const accept = asyncHandler(async (req, res) => {
  sendSuccess(res, { request: await requestService.acceptRequest(req.user.id, req.params.id) });
});
const decline = asyncHandler(async (req, res) => {
  sendSuccess(res, { request: await requestService.declineRequest(req.user.id, req.params.id) });
});
const cancel = asyncHandler(async (req, res) => {
  sendSuccess(res, { request: await requestService.cancelRequest(req.user.id, req.params.id) });
});
const complete = asyncHandler(async (req, res) => {
  sendSuccess(res, { request: await requestService.completeRequest(req.user.id, req.params.id) });
});

module.exports = { create, received, sent, getOne, accept, decline, cancel, complete };
