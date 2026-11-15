// Checks and cleans the input of the report endpoints (Task 10).
//
//   validateCreateReport(body)         POST /api/v1/reports
//   validateMineQuery(query)           GET  /api/v1/reports/mine
//   validateAdminReportsQuery(query)   GET  /api/v1/admin/reports
//   validateResolveBody(body)          POST /api/v1/admin/reports/:id/resolve
//
// Only the fields below are accepted. Anything else (reporterId, status, resolution, ...) is
// REJECTED, so a client can never choose who the reporter is or what the status is: both come
// from the login token and the server. (Dismissing a report only carries an optional note, so
// it uses validateNoteBody from admin.validator.js.)

const ApiError = require('../utils/ApiError');
const {
  ADMIN,
  REPORT_TARGET_TYPES,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_RESOLUTION_ACTIONS,
  REPORT_LIMITS,
} = require('../config/constants');
const { cleanMultiLine } = require('./admin.validator');

const CREATE_FIELDS = ['targetType', 'targetId', 'reason', 'details'];
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;

const toQueryError = (errors) =>
  new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted query parameters.', errors);

// Returns { targetType, targetId, reason, details } (details is null when not given).
function validateCreateReport(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  const errors = [];
  const addError = (field, message) => errors.push({ field, message });

  Object.keys(body)
    .filter((key) => !CREATE_FIELDS.includes(key))
    .forEach((key) => addError(key.slice(0, 40), 'This field is not allowed.'));

  let targetType = null;
  if (typeof body.targetType !== 'string' || !REPORT_TARGET_TYPES.includes(body.targetType.trim().toLowerCase())) {
    addError('targetType', `Target type must be one of: ${REPORT_TARGET_TYPES.join(', ')}.`);
  } else {
    targetType = body.targetType.trim().toLowerCase();
  }

  let targetId = null;
  if (typeof body.targetId !== 'string' || body.targetId.trim() === '') {
    addError('targetId', 'Target ID is required.');
  } else if (!SAFE_ID.test(body.targetId.trim())) {
    addError('targetId', 'Target ID is not valid.');
  } else {
    targetId = body.targetId.trim();
  }

  let reason = null;
  if (typeof body.reason !== 'string' || !REPORT_REASONS.includes(body.reason.trim().toLowerCase())) {
    addError('reason', `Reason must be one of: ${REPORT_REASONS.join(', ')}.`);
  } else {
    reason = body.reason.trim().toLowerCase();
  }

  let details = null;
  if (body.details !== undefined && body.details !== null) {
    if (typeof body.details !== 'string') {
      addError('details', 'Details must be text.');
    } else {
      const text = cleanMultiLine(body.details);
      if (text.length > REPORT_LIMITS.MAX_DETAILS_LENGTH) {
        addError('details', `Details can be at most ${REPORT_LIMITS.MAX_DETAILS_LENGTH} characters.`);
      } else if (text !== '') {
        details = text;
      }
    }
  }

  if (errors.length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
  }
  return { targetType, targetId, reason, details };
}

// A query value that is missing or empty counts as "not given"; a repeated one is an error.
function singleValue(input, name, errors) {
  const raw = input[name];
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string') {
    errors.push({ field: name, message: `${name} must be a single value.` });
    return undefined;
  }
  const value = raw.trim().toLowerCase();
  return value === '' ? undefined : value;
}

// ?status=open  or  ?status=open,resolved  (or repeated). Returns { statuses }: an array, or null for "all".
function validateMineQuery(query) {
  const input = query && typeof query === 'object' ? query : {};
  const errors = [];

  Object.keys(input)
    .filter((key) => key !== 'status')
    .forEach((key) => errors.push({ field: key.slice(0, 40), message: 'Unknown query parameter.' }));

  let statuses = null;
  if (input.status !== undefined) {
    const parts = Array.isArray(input.status) ? input.status : [input.status];
    if (!parts.every((part) => typeof part === 'string')) {
      errors.push({ field: 'status', message: 'Status must be plain text values.' });
    } else {
      const values = [
        ...new Set(
          parts
            .join(',')
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .filter((value) => value !== '')
        ),
      ];
      if (values.some((value) => !REPORT_STATUSES.includes(value))) {
        errors.push({ field: 'status', message: `Status must be one of: ${REPORT_STATUSES.join(', ')}.` });
      } else if (values.length > 0) {
        statuses = values;
      }
    }
  }

  if (errors.length > 0) throw toQueryError(errors);
  return { statuses };
}

// ?status=open|resolved|dismissed|all (default open)  &targetType=listing|user (optional)
// Returns { statuses (array), targetType (string or null) }.
function validateAdminReportsQuery(query) {
  const input = query && typeof query === 'object' ? query : {};
  const errors = [];

  Object.keys(input)
    .filter((key) => !['status', 'targetType'].includes(key))
    .forEach((key) => errors.push({ field: key.slice(0, 40), message: 'Unknown query parameter.' }));

  let statuses = ['open'];
  const status = singleValue(input, 'status', errors);
  if (status === 'all') {
    statuses = [...REPORT_STATUSES];
  } else if (status !== undefined) {
    if (REPORT_STATUSES.includes(status)) statuses = [status];
    else errors.push({ field: 'status', message: `Status must be one of: ${REPORT_STATUSES.join(', ')}, all.` });
  }

  let targetType = null;
  const type = singleValue(input, 'targetType', errors);
  if (type !== undefined) {
    if (REPORT_TARGET_TYPES.includes(type)) targetType = type;
    else errors.push({ field: 'targetType', message: `Target type must be one of: ${REPORT_TARGET_TYPES.join(', ')}.` });
  }

  if (errors.length > 0) throw toQueryError(errors);
  return { statuses, targetType };
}

// Body: { action?, note? }. action defaults to 'none'. Returns { action, note } (note null when not given).
function validateResolveBody(body) {
  if (body === undefined || body === null) return { action: 'none', note: null };
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  const errors = [];
  Object.keys(body)
    .filter((key) => !['action', 'note'].includes(key))
    .forEach((key) => errors.push({ field: key.slice(0, 40), message: 'This field is not allowed.' }));

  let action = 'none';
  if (body.action !== undefined && body.action !== null) {
    const value = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
    if (REPORT_RESOLUTION_ACTIONS.includes(value)) action = value;
    else errors.push({ field: 'action', message: `Action must be one of: ${REPORT_RESOLUTION_ACTIONS.join(', ')}.` });
  }

  let note = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') {
      errors.push({ field: 'note', message: 'Note must be text.' });
    } else {
      const text = cleanMultiLine(body.note);
      if (text.length > ADMIN.MAX_NOTE_LENGTH) {
        errors.push({ field: 'note', message: `Note can be at most ${ADMIN.MAX_NOTE_LENGTH} characters.` });
      } else if (text !== '') {
        note = text;
      }
    }
  }

  if (errors.length > 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors);
  }
  return { action, note };
}

module.exports = { validateCreateReport, validateMineQuery, validateAdminReportsQuery, validateResolveBody };
