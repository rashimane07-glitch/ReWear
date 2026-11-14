# TASK 9 PROGRESS — Request & Exchange Management + Contact Privacy

Persistent handover record between Claude accounts. **The code and the test results are the truth;
this file is only a guide.** Update it after every checkpoint. Never delete useful history.

Last updated by: documentation audit D1 + D2 (the handover prompt called this "Claude account ID 3"). It added section 9 and annotated statements
that later results superseded (marked "UPDATE" / "SUPERSEDED"); the original text was kept. Terminal/Git access in that session: **NONE** (file tools + a
Linux sandbox without Express/npm packages or network).
Earlier text: section 7 and two checklist lines by account #4, section 8 by account #6, everything else by account #3 (each of those sessions also had NO terminal/Git
access). Statements marked EXECUTED were really run; everything else was NOT run by Claude. The user ran `npm test` and the real-Cloudant verifier in the Windows
terminal (results in section 9); Claude ran neither.

## 1. Requirements (from the Task 9 prompt)

- A. Requests: create for an available listing; owner sees received; requester sees sent; single
  request view with authorization; accept / decline; cancel / withdraw; safe status changes; no duplicates;
  no request for own, deleted or unavailable listings; valid transitions only.
- B. Exchange: exchange requests for `exchange` listings; accept/decline; status progression; no
  conflicting exchanges; only participants see/modify; listing availability consistent on accept.
- C. Contact privacy (CRITICAL): no contact detail in public browsing, for anonymous users, or for unrelated
  users; owner/requester always derived from the token; no leaks via serializers/errors.
- Phases: 1 = requests, 2 = exchange + privacy, 3 = integration (indexes, privacy/authorization tests,
  regression, README, verification).
- Rules: no `.env`, no `git add .`, no commits, no frontend, no new dependencies, no COS, keep Tasks 1-8.

## 2. Audit findings (state found on disk)

Git/terminal were not available, so `git status` was NOT checked. Known from the handover prompt:
Task 7 = `6169f54`, Task 8 = `f3fd0ee` (162 tests passed locally, real Cloudant spot-checked, but NOT pagination
or mixed null/number price ordering with real data).

Task 9 SOURCE ALREADY EXISTED (written by an earlier account, never recorded). Reviewed, found consistent, not rewritten:

| File | Role |
|---|---|
| `src/config/constants.js` | `REQUEST_STATUS`, `REQUEST_STATUSES`, `REQUEST_LIMITS` |
| `src/validators/request.validator.js` | `validateCreateRequest`, `validateListQuery` (unknown fields rejected) |
| `src/repositories/request.repository.js` | request `_id` = `request:<listingId>_<requesterId>` (duplicate prevention); equality queries, limit 200 |
| `src/serializers/request.serializer.js` | whitelist; `ownerContact` only when the service passes it |
| `src/services/request.service.js` | create / list / get / accept / decline / cancel / complete + `canSeeOwnerContact` |
| `src/controllers/request.controller.js`, `src/routes/request.routes.js` | all routes behind `authenticate` |
| `src/app.js` | mounts `/api/v1/requests` |
| `src/repositories/listing.repository.js` | `findListingsByIds` (bulk) used by request lists |
| `src/config/database.js` | `request-by-owner`, `request-by-requester`, `request-by-listing` in `INDEXES` (`npm run db:setup`) |

### Lifecycle (implemented; also in README)
```
pending  --owner accepts-->        accepted  (listing available -> reserved, acceptedRequestId set;
                                              other pending requests of the listing -> declined, declinedReason listing_reserved)
pending  --owner declines-->       declined  (final for that student)
pending  --requester withdraws-->  cancelled (may be re-sent: same document restarts)
accepted --owner completes-->      completed (listing reserved -> completed; final)
accepted --owner OR requester cancels--> cancelled (listing reserved -> available again)
```
No separate "exchange" document: an exchange is a request on an `exchange` listing with a required `offeredItem`.
Accepting needs a contact on the owner's profile (`409 CONTACT_REQUIRED`). Non-participants get 404, never 403.

### Contact privacy rule (implemented; also in README)
ONLY `GET /api/v1/requests/:id`, by the REQUESTER, while the request is `accepted` AND the listing is `reserved`
for that request, returns `ownerContact` (the OWNER's phone). `null` if the owner removed it. Owner never gets the
requester's contact. No list, accept/decline/cancel/complete response, public browse, listing detail or error carries it.

## 3. Work log

- [x] Audit of the folder.
- [x] Removed a duplicate `$exists` line in `tests/helpers/fakes.js` (left by an interrupted Task 8 edit; harmless but wrong).
- [x] Code review of the request source: no defect found.
- [x] `tests/requests.api.test.js` WRITTEN (67 tests, 10 describe groups): create/validation/duplicates/own/deleted/reserved,
      exchange rules, lists + filters + bulk lookups, get-one + 404 policy, accept/decline/cancel/complete, listing
      interplay (public feed, LISTING_LOCKED), contact privacy (incl. error bodies and requester-contact), conflicts (409),
      Cloudant outage (503), request indexes, Task 1-8 regression spot checks.
- [x] README: new section "Requests, exchange and contact privacy (Task 9)", endpoint table rows, status line, db:setup note.
- [x] `npm test` — RUN BY THE USER in the Windows terminal after the M1/M2 fixes: **243 tests, 243 passed, 0 failed, 0 skipped, 28 suites** (section 9). (Originally written as "never been executed".)
- [x] `scripts/verify-requests.js` (read-only, real Cloudant) exists, was reviewed and is registered as `npm run db:verify-requests` (section 7).
- [x] `npm run db:verify-requests` — RUN BY THE USER against real Cloudant: **12 passed, 0 failed, 2 skipped** (sections 7 and 9). (Originally written as "never been executed".)

## 4. Tests executed and actual results

EXECUTED (in a Linux sandbox, not on the user's machine): a throw-away harness (NOT part of the project) loaded the real
`request.service.js`, repositories, serializer, constants and the project's `tests/helpers/fakes.js` (fake Cloudant) with a
stub `dotenv`, and ran **63 checks, all passed**: create shape and no-contact response, duplicate, own listing, unknown / deleted /
reserved / completed listing, account missing, exchange offered-item rules, received/sent lists and filters, explicit query limit,
stranger 404, accept (listing reserved, others declined), contact visible only to the requester, hidden for owner / stranger /
lists / after cancel / after complete, `null` when owner removed contact, cancel accepted reopens listing, re-send after
cancel / after `listing_reserved` decline, owner-declined cannot re-send, owner cannot cancel pending, complete rules,
`CONTACT_REQUIRED`, accept after listing deleted, revision-conflict `409 CONFLICT` with nothing changed, outage `503`.
EXECUTED: `node --check` on `tests/requests.api.test.js` -> syntax OK.

NOT EXECUTED: `npm test` (any file), the 67 new HTTP tests, Git commands, real Cloudant, the validator/controller/route layer
under Express. Expected total if everything passes: 162 (before) + 67 = 229 — an expectation, not a result.
**SUPERSEDED (section 9):** the user later ran the whole suite in the Windows terminal: 243 passed, 0 failed. The 63 / 67 / 229 figures above describe an earlier stage.

## 5. Known limitations / unresolved

- Request lists: capped at 200, not paged, order only guaranteed among the returned 200.
- Token is stateless: a token of a deleted account can still read requests it took part in (same as listings).
- Editing a listing's type while requests are pending leaves the request's `listingType` snapshot stale.
- Request indexes and queries are verified ONLY against the in-memory fake, never against real Cloudant.
- The fake does not model every Cloudant index rule for UNSORTED queries (request lists are unsorted equality queries).
- **UPDATE (section 9):** the bullet about "verified ONLY against the in-memory fake" is partly outdated. Since the user's real run of `npm run db:verify-requests` (12 passed, 0 failed,
  2 skipped) the request indexes, query acceptance and index use ARE verified against real Cloudant. The request WORKFLOW is still verified only with the fake, and the real-data checks
  were skipped because no request documents existed.
- **Concurrency (see sections 8 and 9):** Cloudant has no transaction over a listing and all its requests, so the accept / decline-competing logic is NOT race-free; it narrows the
  windows (listing reserved first, re-read and retry on revision conflicts, independent handling of each competing request, a re-check after a request is saved) but cannot close them.

## 6. Exact next step for the next Claude account (or the user)

> **OUTDATED — kept as history.** Steps 1-3 below were carried out (the user ran `npm test` and the verifier; `scripts/verify-requests.js` exists). The CURRENT next step is in section 9.8.

1. User runs, in `backend`: `npm test`. Expected: all green (162 + 67 = 229). If a new test fails, FIX THE TEST OR CODE
   by reading the failing assertion; the service logic itself passed the sandbox harness, so the most likely causes are
   a wrong assumption in `requests.api.test.js` (status code, field name) or a validator/controller detail.
2. User runs `git status --short` and `git diff --check`; expected changed/new files: `README.md`, `TASK9_PROGRESS.md`,
   `tests/helpers/fakes.js`, `tests/requests.api.test.js`, plus the already-existing untracked Task 9 sources listed in section 2.
3. Optional: write `scripts/verify-requests.js` (read-only) and add `"db:verify-requests"` to `package.json`, then run
   `npm run db:setup` once to create the request indexes on the real database.
4. Do NOT commit unless the user asks.

## 7. Read-only real-Cloudant check: `scripts/verify-requests.js` (Claude account #4)

Account #4 found the script and the `package.json` entry already saved by the previous account (which stopped right
after saying it would edit `package.json`). Nothing was rewritten: the script was READ completely and reviewed against
the real code; no change was needed. Terminal/Git access in this session: **NONE** (file tools + a separate Linux sandbox).

**Status: complete and registered. UPDATE: it has since been RUN BY THE USER against real Cloudant: 12 passed, 0 failed, 2 skipped (details under "Actual results" below and in section 9).** (Originally written as "NOT YET RUN".)

| Item | State |
|---|---|
| `scripts/verify-requests.js` (331 lines) | complete; follows `verify-browse.js` conventions (PASS / FAIL / SKIP / INFO, own messages only) |
| `package.json` | `"db:verify-requests": "node scripts/verify-requests.js"` present exactly once; all other scripts and dependencies intact |
| EXECUTED in the sandbox | `node --check` on a COPY of the script -> syntax OK; `package.json` parsed as valid JSON (copy) |
| NOT EXECUTED | the script itself (it needs your `.env` and real Cloudant), `npm test`, Git commands |
| Reported by the user (not run by me) | full suite 229 passed / 0 failed; `npm run db:setup` completed |

**What it checks (READ-ONLY: GET /_index, POST /_explain, POST /_find, GET document, POST /_all_docs):**
1. The indexes `request-by-owner` [type, ownerId], `request-by-requester` [type, requesterId] and `request-by-listing`
   [type, listingId, status] exist as JSON indexes with the fields that `src/config/database.js` defines (it reads that list,
   so it cannot drift).
2. Cloudant accepts the 7 queries `request.repository.js` really sends (received / sent, with no status, one status and
   `$in`; pending requests of a listing), using an id that cannot exist, and `_explain` says which index answers each.
   `findRequestById` for a missing id returns "not found"; both bulk lookups (`findListingsByIds`, `findUsersByIds`) work.
3. Only if real requests exist (sample of at most 25, read from the primary index): valid statuses, id =
   `request:<listingId>_<requesterId>`, no contact/email/password/token field names stored, the repository finds each
   request by id / owner / requester / status filter / listing, "received" is newest first, bulk lookups with real ids,
   and accepted/completed requests match their listing (`reserved` / `completed`, `acceptedRequestId`, at most one accepted
   request per listing).

**SKIP (not failure) when there is not enough data:** no requests at all; fewer than 2 requests for an owner (order);
no accepted or completed request in the sample.

**Limitations (by design, because proving them needs writes and this script never writes):** creating, accepting,
declining, cancelling and completing requests, duplicate prevention (two documents with one `_id`), revision conflicts
and the API-level contact privacy rule are covered ONLY by the fake-Cloudant tests (`tests/requests.api.test.js`). A PASS
here means "indexes, query acceptance, index use and stored-data consistency", not "the request workflow works on real
Cloudant". The data checks use a sample of at most 25 requests, not the whole database. Results are printed as counts and
PASS/FAIL/SKIP only; no ids, names, messages or contacts.

**Actual results of the script (reported by the user, who ran it; Claude did not run it):** 12 passed, 0 failed, 2 skipped. With an empty set of request documents the script produces
exactly this: 3 index checks + 7 query checks (each also confirmed by `_explain` to use the expected index) + the lookup by id + the bulk lookups = 12 PASS, and the 2 SKIP lines that
say the checks on real request data were skipped because no request documents exist. So the **real-data checks of item 3 above did NOT run** (statuses, ids, stored-field privacy, finding real
requests, newest-first order, bulk lookups with real ids, accepted/completed vs listing). This is inferred from reading the script, not observed.

**Exact command for the user** (PowerShell):
```
cd "C:\Users\Hp\Desktop\Rashi SEM III\Rewear\ReWear\backend"
npm run db:verify-requests
```
Run `npm run db:setup` first if the three request indexes were never created (the user reports it already completed).
Paste the PASS / FAIL / SKIP lines back; do not paste `.env`.

## 8. M2 — declining the competing requests on accept (Claude account #6)

**Found on disk (written by an earlier account, never recorded):** the M2 service code (`declineBecauseReserved`, rewritten
`declineOtherPending`, `declineIfListingTaken` called from `createRequest`) and six M2 regression tests (describe block
"declining the competing requests when one request is accepted"). The M1 recovery in `declineRequest` / `cancelRequest` is intact.

**Change made now (small):** `declineIfListingTaken` returned a false `409 LISTING_UNAVAILABLE` (and, in a pending state, would
have declined the request) when the listing was reserved for the very request just saved. It now leaves that case alone
(`latest.acceptedRequestId === toRequestId(savedRequest)`). One regression test added at the end of the M2 describe block.
Files touched: `src/services/request.service.js` (one guard + comment), `tests/requests.api.test.js` (one test), this file.

**Behaviour:** each competing pending request is handled on its own; a revision conflict is re-read and retried (3 attempts),
never counted as declined; a request that is no longer pending is not overwritten; one failure does not stop the others; a request
that could not be declined stays pending and an error line with only a COUNT is logged; the acceptance is never undone; the
owner can still decline a leftover pending request (M1 path). A request saved while the listing is being reserved declines itself
and the sender gets 409.

**EXECUTED (Linux sandbox, copies of the current service/repository/fakes, stub `dotenv`; not `npm test`):** a throw-away harness
ran the six M2 scenarios plus the new edge case: 24 checks passed; the earlier 63-check request harness still passes. `node --check`
on the edited service and test file: OK. **NOT EXECUTED:** `npm test` / the HTTP tests (7 new since the last reported run: 6 M2 + 1 edge case;
expected total 236 + 7 = 243 — an expectation, not a result), Git commands, real Cloudant. **UPDATE (section 9): the user later ran the suite in the Windows terminal: 243 passed, 0 failed.**

**Remaining limitation (cannot be removed without a larger redesign; Cloudant has no transaction over the listing and its requests):**
the competing requests are found with ONE query. A request saved just before the reservation, that this query does not return
(index lag) AND whose own re-check ran before the listing was reserved, stays pending for a reserved listing. It is not hidden
from the owner (who can decline it, which is safe) and cannot be accepted (`LISTING_UNAVAILABLE`). A failed decline is only
reported as a count in the server log, not to the API client, because the acceptance itself succeeded.

## 9. Final documentation audit (D1 + D2): status of Task 9 (handover prompt: "Claude account ID 3")

Documentation-only session. Files changed: `README.md` and this file. No application code, test file, script, configuration or dependency was touched; nothing was staged or
committed; `.env` was not opened. Terminal/Git access: **NONE**: Claude cannot run `npm test`, the verifier or Git here.

### 9.1 Status at a glance

| Item | State | Established by |
|---|---|---|
| Task 9 implementation: requests, exchange, accept / decline / cancel / complete, listing reservation, competing requests, duplicate prevention, contact privacy, indexes, verifier script | complete | code read and reviewed by the accounts above |
| M1 fix + regression tests | in place (9.2) | read in the code and tests; passing is part of the user's 243 |
| M2 fix + regression tests | in place (9.3) | same |
| Full test suite (`npm test`, Windows terminal, after the M1 and M2 fixes) | **243 tests, 243 passed, 0 failed, 0 skipped, 28 suites** | **run by the user.** Claude did NOT run these tests |
| Real-Cloudant verifier (`npm run db:verify-requests`) | **12 passed, 0 failed, 2 skipped** (9.5) | **run by the user**, reported to Claude; Claude did not run it |
| Git | Task 9 is **NOT committed** (Task 8 = `f3fd0ee`) | reported by the user; not checked by Claude |

### 9.2 M1 fix: a listing left reserved for a request that is still pending

- **Problem:** `acceptRequest` reserves the listing FIRST and marks the request accepted second. A failed accept (reservation written, request not marked accepted, undo not completed)
  could leave the listing `reserved` for a request that is still `pending`, and nothing put it back on the market.
- **Fix** (`src/services/request.service.js`): `declineRequest` and `cancelRequest` call `reopenListing` BEFORE changing the request. `reopenListing` only touches a listing that is reserved
  for exactly this request (never another request's reservation, never a completed listing), so it does nothing in every normal case. Its failure is reported (`409 CONFLICT`), the request
  stays pending, and the action can be repeated.
- **Regression tests** (`tests/requests.api.test.js`, describe "recovering a listing reserved for a request that is still pending", 7 tests): declining and withdrawing the pending request
  put its stranded listing back on the market; declining or withdrawing ANOTHER pending request never reopens a listing reserved for an accepted request; only the request the listing is
  reserved for can recover it; a completed listing is never reopened; a failed recovery gives `409 CONFLICT`, keeps the request pending and works when tried again.

### 9.3 M2 fix: declining the competing requests when one request is accepted

- **Implementation** (`src/services/request.service.js`): `declineOtherPending` handles each competing pending request on its own, through `declineBecauseReserved`. A revision conflict is
  re-read and retried (3 attempts) and is never counted as declined; a request that is no longer pending (withdrawn or answered meanwhile) is never overwritten; one failure does not stop the
  others; a request that could not be declined stays pending and is logged without ids (error code and a count); the acceptance and its listing reservation are never undone.
  `declineIfListingTaken` (called from `createRequest` after a request is saved) re-checks the listing: a request saved while the listing was being reserved for someone else declines itself and
  the sender gets `409 LISTING_UNAVAILABLE`. A later correction (section 8) leaves alone a listing reserved for the very request that was just saved.
- **Regression tests** (`tests/requests.api.test.js`, describe "declining the competing requests when one request is accepted", 7 tests = the six M2 scenarios + the edge case added in
  section 8): declines every competing pending request and leaves withdrawn or already answered ones untouched; retries after a revision conflict instead of treating it as declined; does not
  overwrite a request withdrawn at the same moment; keeps going after a request that keeps conflicting and does not claim it was declined; keeps going after a request whose save fails with a
  database error; declines a request saved while the listing was being reserved and tells the sender (409); does not decline a request whose own reservation happened while it was being saved.

### 9.4 Test result

The user ran the full suite in the Windows backend terminal after the M1 and M2 fixes: **243 tests, 243 passed, 0 failed, 0 skipped, 28 suites.** This is the user's result, not a Claude
sandbox result. `tests/requests.api.test.js` contains 81 test cases (67 originally + 7 M1 + 7 M2, counted in the source by this session), which fits 162 earlier tests + 81 = 243; this is a
consistency check by arithmetic, not an observation. The throw-away sandbox harnesses of earlier sessions (63 and 24 checks) are historical only and are not part of the project.

### 9.5 Real-Cloudant verification (`npm run db:verify-requests`)

- **Result (reported by the user):** 12 passed, 0 failed, 2 skipped.
- **The 12 passes:** the 3 request indexes exist with the fields defined in `src/config/database.js`; the 7 queries `request.repository.js` sends (received and sent, each with no status filter, one
  status and `$in`; pending requests of a listing) are accepted by Cloudant and `_explain` says the expected index answers each; a lookup of a missing request id gives "not found"; the bulk
  lookups of listings and users work.
- **The 2 skips:** no request documents existed in the database, so every check on real stored requests was skipped (see section 7). That is the only reason, and a skip is not a failure.
- **What this proves:** indexes, query acceptance and index use. **What it does not prove:** that a request can be sent, accepted, declined, cancelled or completed against real Cloudant, duplicate
  prevention, revision-conflict handling, competing-request handling or the contact privacy rule. The script never writes, so those are covered only by the fake-Cloudant tests.

### 9.6 Remaining limitations

- **Concurrency (NOT race-free):** Cloudant has no transaction over the listing and all its requests. The competing requests are found with ONE query. A request saved just before the reservation that
  this query does not return (index lag) AND whose own re-check ran before the listing was reserved stays `pending` on a reserved listing. The owner can still decline it (safe) and it cannot be
  accepted (`LISTING_UNAVAILABLE`). A failed decline is logged (error code and count) but not reported to the API client, because the acceptance itself succeeded. The retry logic is tested only with
  simulated revision conflicts in the fake, not with real concurrent Cloudant writes.
- Request lists: capped at 200, not paged. A deleted account's token still reads its requests until it expires. Editing a listing's type leaves the request's `listingType` snapshot stale.
- The request workflow has never been run against real Cloudant (only the read-only verifier has).

### 9.7 Git

- Task 9 is NOT committed. This session staged and committed nothing, and did not run Git.
- The user reported unrelated untracked files in `git status --short`. They must not be staged or committed. NEVER use `git add .`; add the intended Task 9 files by explicit path.
  Expected Task 9 files (confirm with `git status --short`): the Task 9 sources in the table of section 2, `src/services/request.service.js` (M1/M2), `package.json` (the `db:verify-requests` script),
  `scripts/verify-requests.js`, `tests/requests.api.test.js`, `tests/helpers/fakes.js`, `README.md` and this file.

### 9.8 Exact next step

1. The user reviews `README.md` and this file (nothing else was changed).
2. Optional, to exercise the 2 skipped real-data checks: send, accept, decline and cancel a few requests through the running API, then run again in `backend`:
   `npm run db:verify-requests`. (Claude must not create these records.)
3. Commit ONLY when the user asks, with explicit paths (9.7). Do NOT start Task 10 before the user says so.

### 9.9 Claims that remain unverified by Claude

- The 243 / 28-suite result and the 12 / 0 / 2 verifier result are as reported by the user; Claude executed neither.
- That the verifier on disk (331 lines) produced those numbers is inferred from reading it (12 passes and 2 skips are exactly what it prints for a database with no requests), not observed.
- The Git state (Task 9 uncommitted, which unrelated files are untracked) is as reported by the user.
- Everything about the request workflow, duplicate prevention, revision conflicts and contact privacy on REAL Cloudant (see 9.5 and 9.6).
