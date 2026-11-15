// All Cloudant access for reports (Task 10). Nothing here knows about HTTP.
//
// A report document has _id "report:<targetType>_<targetId>_<reporterId>". Building the id from
// the target and the reporter is what allows only ONE report per reporter per target: Cloudant
// refuses to create two documents with the same _id, even if two reports arrive at the same
// moment (the same trick as request.repository.js and the email key in user.repository.js).
//
// Document (see report.service.js for who may change what):
//   type 'report', targetType ('listing' | 'user'), targetId, targetOwnerId (listing reports: the
//   listing's owner), targetLabel (snapshot of the listing title / user name, for when the target
//   is gone), reporterId, reason, details, status ('open' | 'resolved' | 'dismissed'),
//   createdAt, updatedAt, resolution (null while open, then { action, note, adminId, at }).

const ApiError = require('../utils/ApiError');
const { REPORT_LIMITS } = require('../config/constants');
const { run, getDoc, putDoc, toApiError } = require('./base.repository');

const REPORT_PREFIX = 'report:';
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
const SAFE_REPORT_ID = /^(listing|user)_[A-Za-z0-9-]{1,64}_[A-Za-z0-9-]{1,64}$/;

const toDocId = (reportId) => `${REPORT_PREFIX}${reportId}`;
const makeReportId = (targetType, targetId, reporterId) => `${targetType}_${targetId}_${reporterId}`;

// Returns the raw report document (with _id and _rev) or null.
async function findReportById(reportId) {
  if (typeof reportId !== 'string' || !SAFE_REPORT_ID.test(reportId)) {
    return null;
  }
  const doc = await getDoc(toDocId(reportId));
  return doc && doc.type === 'report' ? doc : null;
}

// Creates a report. Returns false if this reporter already reported this target.
async function insertReport(reportId, body) {
  const result = await putDoc(toDocId(reportId), body);
  return result.ok;
}

// Saves a changed report. `reportDoc` must be the document as read (with _id and _rev).
// Returns true if saved, false on a revision conflict (caller should re-read and retry).
async function updateReport(reportDoc) {
  const { _id, _rev, ...body } = reportDoc;
  const result = await putDoc(_id, body, _rev);
  return result.ok;
}

// Reports are found with plain equality selectors, answered from the "report-by-*" indexes
// created by "npm run db:setup" (see config/database.js). Without them Cloudant still answers,
// only slower. The limit is explicit because Cloudant answers 25 documents otherwise, so one
// call returns at most REPORT_LIMITS.MAX_LIST_RESULTS reports (documented in the README).
async function findReports(selector) {
  const response = await run((client, db) =>
    client.postFind({ db, selector: { type: 'report', ...selector }, limit: REPORT_LIMITS.MAX_LIST_RESULTS })
  ).catch((err) => {
    throw toApiError(err);
  });
  return (response.result && response.result.docs) || [];
}

const byNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

// The reports one student sent, newest first. `statuses` (optional array) filters by status.
async function findReportsByReporter(reporterId, statuses) {
  if (typeof reporterId !== 'string' || !SAFE_ID.test(reporterId)) return [];
  if (!statuses || statuses.length === 0) {
    return (await findReports({ reporterId })).sort(byNewest);
  }
  const groups = await Promise.all(statuses.map((status) => findReports({ reporterId, status })));
  return groups.flat().sort(byNewest);
}

// How many reports of this student are still open (used to stop flooding the admin queue).
async function countOpenReportsByReporter(reporterId) {
  if (typeof reporterId !== 'string' || !SAFE_ID.test(reporterId)) return 0;
  return (await findReports({ reporterId, status: 'open' })).length;
}

// Reports for the admin queue, newest first, at most MAX_LIST_RESULTS. One equality query per
// status (so every query can use the "report-by-status" index), then merged.
async function findReportsByStatus(statuses, targetType) {
  const extra = targetType ? { targetType } : {};
  const groups = await Promise.all(statuses.map((status) => findReports({ status, ...extra })));
  return groups.flat().sort(byNewest).slice(0, REPORT_LIMITS.MAX_LIST_RESULTS);
}

function duplicateReportError() {
  return new ApiError(409, 'DUPLICATE_REPORT', 'You have already reported this.');
}

module.exports = {
  makeReportId,
  findReportById,
  insertReport,
  updateReport,
  findReportsByReporter,
  countOpenReportsByReporter,
  findReportsByStatus,
  duplicateReportError,
};
