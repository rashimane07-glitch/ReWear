// Report rules (Task 10): who may report what, and how an administrator decides.
// It talks to Cloudant through the repositories, never to HTTP. Who may call the ADMIN functions
// is decided by the requireAdmin middleware (the role is read from the database); this file
// only holds the rules.
//
// LIFECYCLE of a report:
//
//   open --admin dismisses--> dismissed   (final)
//   open --admin resolves-->  resolved    (final; action 'none', or 'remove_listing' which also
//                                          removes the reported listing, like admin.service does)
//
// A decided report is final: deciding it again is 409 REPORT_ALREADY_DECIDED. Every decision
// records { action, note, adminId, at }.
//
// RULES FOR STUDENTS: report a listing or a user (never your own listing or yourself); one report
// per reporter per target for ever (even after it was decided); at most REPORT_LIMITS.
// MAX_OPEN_PER_REPORTER open reports at a time, so one account cannot flood the admin queue.
//
// PRIVACY: see report.serializer.js. The reported person never receives anything about a report,
// and a student never sees the admin's note.

const ApiError = require('../utils/ApiError');
const { REPORT_STATUS, REPORT_LIMITS } = require('../config/constants');
const userRepository = require('../repositories/user.repository');
const listingRepository = require('../repositories/listing.repository');
const reportRepository = require('../repositories/report.repository');
const adminService = require('./admin.service');
const { toStudentReport, toAdminReport } = require('../serializers/report.serializer');

// A change made at the same moment by someone else makes Cloudant reject our save (revision
// conflict). We re-read the fresh document and try again a few times.
const MAX_ATTEMPTS = 3;

const conflictError = () => new ApiError(409, 'CONFLICT', 'The report was changed at the same time. Please try again.');
const notFoundError = () => new ApiError(404, 'NOT_FOUND', 'Report not found.');
const accountMissingError = () =>
  new ApiError(401, 'UNAUTHORIZED', 'Your account could not be found. Please log in again.');

// ---------- students ----------

// `userId` comes from the verified login token. `input` is already validated.
async function createReport(userId, { targetType, targetId, reason, details }) {
  const reporter = await userRepository.findUserById(userId);
  if (!reporter) {
    throw accountMissingError();
  }

  const cannotReportYourself = () =>
    new ApiError(403, 'CANNOT_REPORT_YOURSELF', 'You cannot report yourself or your own listing.');

  let targetLabel;
  let targetOwnerId = null;
  if (targetType === 'listing') {
    const listing = await listingRepository.findListingById(targetId);
    if (!listing || listing.isDeleted) {
      throw new ApiError(404, 'NOT_FOUND', 'Listing not found.');
    }
    if (listing.ownerId === userId) {
      throw cannotReportYourself();
    }
    targetLabel = listing.title;
    targetOwnerId = listing.ownerId;
  } else {
    if (targetId === userId) {
      throw cannotReportYourself();
    }
    const target = await userRepository.findUserById(targetId);
    if (!target) {
      throw new ApiError(404, 'NOT_FOUND', 'User not found.');
    }
    targetLabel = target.name;
  }

  if ((await reportRepository.countOpenReportsByReporter(userId)) >= REPORT_LIMITS.MAX_OPEN_PER_REPORTER) {
    throw new ApiError(
      429,
      'TOO_MANY_OPEN_REPORTS',
      'You have too many reports waiting for review. Please wait until some are reviewed.'
    );
  }

  const now = new Date().toISOString();
  const body = {
    type: 'report',
    targetType,
    targetId,
    targetOwnerId,
    targetLabel,
    reporterId: userId, // always the logged-in user, never taken from the request
    reason,
    details,
    status: REPORT_STATUS.OPEN,
    createdAt: now,
    updatedAt: now,
    resolution: null,
  };
  const reportId = reportRepository.makeReportId(targetType, targetId, userId);
  if (!(await reportRepository.insertReport(reportId, body))) {
    throw reportRepository.duplicateReportError();
  }
  return toStudentReport({ _id: `report:${reportId}`, ...body });
}

// The student's own reports, newest first. Nobody else's, and never anything an admin wrote.
async function listMyReports(userId, statuses) {
  const user = await userRepository.findUserById(userId);
  if (!user) {
    throw accountMissingError();
  }
  const docs = await reportRepository.findReportsByReporter(userId, statuses);
  return docs.map(toStudentReport);
}

// ---------- administrators: building responses ----------

function person(users, id) {
  const user = users.get(id);
  return { id, name: user ? user.name : null };
}

// What an admin sees about the reported thing: the CURRENT state when it still exists, otherwise
// the snapshot taken when the report was sent. Only ids, names, title and status: no contacts.
function describeTarget(doc, listings, users) {
  if (doc.targetType === 'listing') {
    const listing = listings.get(doc.targetId);
    const gone = !listing || listing.isDeleted;
    return {
      type: 'listing',
      id: doc.targetId,
      title: gone ? doc.targetLabel : listing.title,
      status: gone ? 'removed' : listing.status,
      owner: person(users, listing ? listing.ownerId : doc.targetOwnerId),
    };
  }
  const user = users.get(doc.targetId);
  return { type: 'user', id: doc.targetId, name: user ? user.name : doc.targetLabel, exists: Boolean(user) };
}

// Presents several reports with ONE bulk lookup of listings and ONE of users (not one per report).
async function presentForAdmin(docs) {
  const listings = await listingRepository.findListingsByIds(
    docs.filter((doc) => doc.targetType === 'listing').map((doc) => doc.targetId)
  );
  const userIds = docs
    .flatMap((doc) => {
      if (doc.targetType === 'user') return [doc.reporterId, doc.targetId];
      const listing = listings.get(doc.targetId);
      return [doc.reporterId, listing ? listing.ownerId : doc.targetOwnerId];
    })
    .filter(Boolean);
  const users = await userRepository.findUsersByIds(userIds);
  return docs.map((doc) =>
    toAdminReport(doc, { reporter: person(users, doc.reporterId), target: describeTarget(doc, listings, users) })
  );
}

// ---------- administrators: read ----------

async function listReports({ statuses, targetType }) {
  const docs = await reportRepository.findReportsByStatus(statuses, targetType);
  return {
    reports: await presentForAdmin(docs),
    meta: { count: docs.length, truncated: docs.length >= REPORT_LIMITS.MAX_LIST_RESULTS },
  };
}

async function getReport(reportId) {
  const doc = await reportRepository.findReportById(reportId);
  if (!doc) {
    throw notFoundError();
  }
  return (await presentForAdmin([doc]))[0];
}

// ---------- administrators: decide ----------

// Marks one OPEN report as resolved or dismissed and records { action, note, adminId, at }.
// With action 'remove_listing' the listing is removed FIRST (same rules and 404 / 409 answers as
// POST /admin/listings/:id/remove), then the report is saved. If saving the report hits a
// revision conflict, the loop reads it again; on that retry "already removed" is expected (our own
// first attempt) and is not an error. If somebody else decided the report meanwhile, the answer is
// 409 REPORT_ALREADY_DECIDED (a listing removed by this attempt stays removed).
async function decide(adminId, reportId, { status, action, note }) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const doc = await reportRepository.findReportById(reportId);
    if (!doc) throw notFoundError();
    if (doc.status !== REPORT_STATUS.OPEN) {
      throw new ApiError(409, 'REPORT_ALREADY_DECIDED', `This report is already ${doc.status}.`);
    }

    if (action === 'remove_listing') {
      if (doc.targetType !== 'listing') {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', [
          { field: 'action', message: 'Only a listing report can remove a listing.' },
        ]);
      }
      try {
        await adminService.removeListingDoc(adminId, doc.targetId, note);
      } catch (err) {
        if (!(attempt > 0 && err && err.code === 'LISTING_ALREADY_REMOVED')) throw err;
      }
    }

    const now = new Date().toISOString();
    const updated = { ...doc, status, resolution: { action, note: note || null, adminId, at: now }, updatedAt: now };
    if (await reportRepository.updateReport(updated)) {
      return (await presentForAdmin([updated]))[0];
    }
  }
  throw conflictError();
}

const dismissReport = (adminId, reportId, { note }) =>
  decide(adminId, reportId, { status: REPORT_STATUS.DISMISSED, action: 'none', note });

const resolveReport = (adminId, reportId, { action, note }) =>
  decide(adminId, reportId, { status: REPORT_STATUS.RESOLVED, action, note });

module.exports = { createReport, listMyReports, listReports, getReport, dismissReport, resolveReport };
