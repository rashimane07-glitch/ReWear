// Decides exactly which report fields leave the server (Task 10).
// Internal fields (_id, _rev, reporterId, targetOwnerId, targetLabel, ...) are never copied over.
//
// REPORT PRIVACY:
//  - A STUDENT sees only their OWN reports, and only: what they reported, why, the details they
//    wrote, the status, and when it was decided. Never the admin's note, the administrator or
//    the action taken.
//  - The REPORTED person gets no endpoint at all: nothing here is ever sent to them.
//  - An ADMINISTRATOR sees the reporter and the target as { id, name } only (no email, no contact).

const REPORT_ID_PREFIX = 'report:';

function toReportId(reportDoc) {
  return reportDoc._id.startsWith(REPORT_ID_PREFIX) ? reportDoc._id.slice(REPORT_ID_PREFIX.length) : reportDoc._id;
}

// What a student sees of their own report.
function toStudentReport(reportDoc) {
  return {
    id: toReportId(reportDoc),
    targetType: reportDoc.targetType,
    target: { type: reportDoc.targetType, id: reportDoc.targetId, label: reportDoc.targetLabel || null },
    reason: reportDoc.reason,
    details: reportDoc.details || null,
    status: reportDoc.status,
    createdAt: reportDoc.createdAt,
    resolvedAt: reportDoc.resolution ? reportDoc.resolution.at : null,
  };
}

// What an administrator sees.
// reporter: { id, name }
// target:   { type: 'listing', id, title, status, owner: { id, name } }   (status 'removed' when gone)
//        or { type: 'user', id, name, exists }                            (built by the service)
function toAdminReport(reportDoc, { reporter, target }) {
  const resolution = reportDoc.resolution
    ? {
        action: reportDoc.resolution.action,
        note: reportDoc.resolution.note || null,
        adminId: reportDoc.resolution.adminId,
        at: reportDoc.resolution.at,
      }
    : null;
  return {
    id: toReportId(reportDoc),
    status: reportDoc.status,
    reason: reportDoc.reason,
    details: reportDoc.details || null,
    reporter,
    target,
    createdAt: reportDoc.createdAt,
    updatedAt: reportDoc.updatedAt,
    resolution,
  };
}

module.exports = { toStudentReport, toAdminReport, toReportId };
