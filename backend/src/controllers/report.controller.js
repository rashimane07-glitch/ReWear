// Thin controller for reports: validate, call the service, send the response.
// The reporter is ALWAYS req.user.id (from the verified login token) and the administrator is
// ALWAYS req.admin.id (set by requireAdmin), never taken from the request body or the URL.

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { validateNoteBody } = require('../validators/admin.validator');
const {
  validateCreateReport,
  validateMineQuery,
  validateAdminReportsQuery,
  validateResolveBody,
} = require('../validators/report.validator');
const reportService = require('../services/report.service');

// ---------- students ----------

// POST /api/v1/reports   body: { targetType, targetId, reason, details? }
const create = asyncHandler(async (req, res) => {
  const input = validateCreateReport(req.body);
  const report = await reportService.createReport(req.user.id, input);
  sendSuccess(res, { report }, { status: 201 });
});

// GET /api/v1/reports/mine?status=   (the reports I sent)
const mine = asyncHandler(async (req, res) => {
  const { statuses } = validateMineQuery(req.query);
  const reports = await reportService.listMyReports(req.user.id, statuses);
  sendSuccess(res, { reports }, { meta: { count: reports.length } });
});

// ---------- administrators (the routes sit behind requireAdmin) ----------

// GET /api/v1/admin/reports?status=open|resolved|dismissed|all&targetType=listing|user
const adminList = asyncHandler(async (req, res) => {
  const { reports, meta } = await reportService.listReports(validateAdminReportsQuery(req.query));
  sendSuccess(res, { reports }, { meta });
});

// GET /api/v1/admin/reports/:id
const adminGet = asyncHandler(async (req, res) => {
  sendSuccess(res, { report: await reportService.getReport(req.params.id) });
});

// POST /api/v1/admin/reports/:id/dismiss   body (optional): { note }
const adminDismiss = asyncHandler(async (req, res) => {
  const { note } = validateNoteBody(req.body);
  sendSuccess(res, { report: await reportService.dismissReport(req.admin.id, req.params.id, { note }) });
});

// POST /api/v1/admin/reports/:id/resolve   body (optional): { action: 'none' | 'remove_listing', note }
const adminResolve = asyncHandler(async (req, res) => {
  const input = validateResolveBody(req.body);
  sendSuccess(res, { report: await reportService.resolveReport(req.admin.id, req.params.id, input) });
});

module.exports = { create, mine, adminList, adminGet, adminDismiss, adminResolve };
