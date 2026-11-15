# TASK 10 PROGRESS — Reporting + Admin Management

Handover file between Claude accounts. **The code and the test results are the truth; this file is only a guide.**
Update it after every phase. Never delete useful history.

## Scope (approved by the user)
- Students report a **listing or a user** (FR13). Admin views reports + all listings and removes a listing (FR14).
- Admin actions: **dismiss**, **resolve** (with a note, optionally `remove_listing`), **remove a listing**. **NO blocking users** (FR17, optional, left out on purpose).
- Rules: free only, Cloudant, no new dependencies, no frontend, no `.env`, no `git add .`, no commit unless the user asks. Leave the unrelated untracked
  root files (two `.backup` files, one oddly named file) alone.
- Committed before Task 10: Tasks 1-7 `6169f54`, Task 8 `f3fd0ee`, Task 9 `18ee1b5`. **Nothing from Task 10 is committed yet** (the Git log has only those three commits).

## STATUS: all four phases are implemented. Automated tests pass (run by the user). Real-Cloudant check of Task 10 NOT yet run.

| Phase | Content | State |
|---|---|---|
| 1 | Admin base: `requireAdmin`, `admin:create` / `admin:demote`, `GET /admin/listings`, `POST /admin/listings/:id/remove` | **DONE.** User ran `npm test`: 266 passed, 0 failed, 0 skipped; `npm run db:setup` OK |
| 2 | Student reporting: `POST /reports`, `GET /reports/mine` (validator, repository, serializer, service, controller, routes, tests) | **DONE.** Written by a previous Claude account, found complete on disk |
| 3 | Admin report management: `GET /admin/reports`, `GET /admin/reports/:id`, `POST .../dismiss`, `POST .../resolve` (+ `remove_listing`), indexes, tests | **DONE.** Written together with phase 2 (the previous account did phases 2 and 3 in one go) |
| 4 | `scripts/verify-reports.js` + `db:verify-reports`, README, this file | **DONE (written this session).** The script is NOT yet run on the real Cloudant |

**Actual test result after phases 1-3 (run by the user on the real project): 302 passed, 0 failed, 0 skipped** (243 older + 23 admin + 36 reports). `npm run db:setup` succeeded again afterwards (creates the report indexes).
Phase 4 changed only a new script, `package.json` (one script line), `README.md` and this file: **`npm test` was not re-run after phase 4**; the new script is not a test file (the name does not match `*.test.js`), so the count should stay 302.

## Design decisions (as built)
- Admin = `role: "admin"` on the user document. NOT creatable through the API (a `role` sent at registration is ignored). The user runs `npm run admin:create -- <email>` / `npm run admin:demote -- <email>`.
- `requireAdmin` reads the role from the **database on every call**, not from the token. No/bad token 401, deleted account 401, not admin 403.
- Admin listing removal = the owner's soft delete + `deletionReason: 'admin_removed'`, `deletedBy: <adminId>`, `removalNote`; any status; image files deleted. Task 9 code needed no change (a removed listing shows as `removed` in requests and its owner contact is hidden).
- Report document: `_id` `report:<targetType>_<targetId>_<reporterId>` (one report per reporter per target for ever), fields `targetType` listing|user, `targetId`, `targetOwnerId`, `targetLabel` (snapshot), `reporterId`, `reason`
  (spam, inappropriate, misleading, prohibited_item, harassment, other), `details` (<= 500), `status` open|resolved|dismissed, `resolution` null | { action 'none'|'remove_listing', note, adminId, at }.
- Rules: no self-reports (`403 CANNOT_REPORT_YOURSELF`), target must exist and a deleted listing counts as missing (404), duplicate `409 DUPLICATE_REPORT`, at most 10 open reports per student (`429 TOO_MANY_OPEN_REPORTS`),
  a decided report is final (`409 REPORT_ALREADY_DECIDED`), `remove_listing` only for listing reports (400 otherwise).
- Privacy: a student sees only their own reports (no admin, action or note); the reported person has no endpoint at all; admins see reporter/target as `{ id, name }`, never an email or contact detail.

## Files (Task 10 in total)
New: `src/middleware/requireAdmin.js`; `src/validators/admin.validator.js`, `report.validator.js`; `src/serializers/admin.serializer.js`, `report.serializer.js`; `src/services/admin.service.js`, `report.service.js`;
`src/repositories/report.repository.js`; `src/controllers/admin.controller.js`, `report.controller.js`; `src/routes/admin.routes.js`, `report.routes.js`; `scripts/make-admin.js`, `scripts/verify-reports.js`;
`tests/admin.api.test.js`, `tests/reports.api.test.js`; `TASK10_PROGRESS.md`.
Edited: `src/app.js` (mounts `/api/v1/admin` and `/api/v1/reports`), `src/config/constants.js` (`ROLES`, `ADMIN`, `ADMIN_LISTING_STATES`, `REPORT_*`), `src/config/database.js` (indexes `listing-admin-created`, `report-by-reporter`, `report-by-status`),
`src/repositories/listing.repository.js` (`findListingsForAdmin`), `package.json` (`admin:create`, `admin:demote`, `db:verify-reports`), `README.md` (Task 10 sections, command table, API table, "What is verified", layout).
Other files may have been touched by the previous account: check `git diff --stat` and `git status` yourself (Claude sessions have no Git access).

## Phase 4 checks that were actually executed (by Claude, in its Linux sandbox, NOT on the user's machine, NOT real Cloudant)
- `node --check scripts/verify-reports.js` OK.
- The script was run against the project's fake Cloudant, extended in a throw-away harness (not in the project) with stand-ins for `GET /_index`, `POST /_explain` and a range read of `_all_docs`:
  empty database: 15 passed, 0 failed, 4 skipped, exit 0. Normal data (listings, a removed and an admin-removed listing, 3 reports): 33 passed, 0 failed, 0 skipped, exit 0.
  Deliberately broken data (bad status, self-report, wrong resolution, a `contactEmail` field): 24 passed, 4 failed, exit 1, i.e. the script really detects those problems.
  This proves the script's own logic, **not** that real Cloudant accepts the queries.
- README edits were applied and the diff was reviewed; nothing in the README was run.

## NOT verified
- **Real Cloudant** for everything in Task 10: run `npm run db:verify-reports` (read-only). It is where the sorted admin overview (`listing-admin-created` + `$exists: true` on the sort field) and the index choice for the report queries are tested for the first time.
  The `report-by-reporter` / `report-by-status` choice is ambiguous for a query with both `reporterId` and `status`; the script accepts either and Cloudant's choice is unknown until it is run.
- Writes on real Cloudant (duplicate prevention by `_id`, revision conflicts, removing a listing, resolving a report): only covered by the fake-Cloudant tests.
- `scripts/make-admin.js` has not been run against the real database by Claude (it needs the user's `.env`); the user should try it once (below).
- `npm test` after phase 4 (see above).

## Commands for the user (PowerShell, in `backend`)
```
npm test                       # expect 302 passed
npm run db:verify-reports      # read-only, real Cloudant; paste the PASS / FAIL / SKIP lines
```
Try the admin area once by hand: register an account in the app, run `npm run admin:create -- that@email.com`, log in, call `GET /api/v1/admin/listings` and `GET /api/v1/admin/reports`.
Many `SKIP` lines are normal while the database has no reports / removed listings; send a few reports and decide some as admin, then run the script again.

## Known limitations
- The admin report queue returns at most 200 reports (`meta.truncated` says when) and is sorted in the code; no paging cursor there.
- One report per reporter per target for ever (even after it was decided); no way to withdraw a report.
- No blocking/suspending of users (FR17, optional). User reports are only recorded and decided.
- No rate limit beyond "10 open reports per student".
- Admin overview of listings has no free-text search.

## Suggested next steps
1. User runs `npm test` and `npm run db:verify-reports`, and pastes the output; fix anything that FAILs.
2. User reviews with `git status` / `git diff --stat`, stages the Task 10 files **by name** (never `git add .`) and commits when satisfied (Claude commits nothing unless asked).
3. Task 10 is then complete. Do not start Task 11 until the user says so.
