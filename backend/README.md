# ReWear Backend

REST API for **ReWear**, a student marketplace to sell, exchange or donate pre-owned clothes.

- **Stack:** Node.js (22 or newer) · Express · IBM Cloudant (database) · JWT + bcryptjs (login) · Multer (uploads)
- **Images:** saved on the backend's own disk in `backend/uploads/` and served at `/uploads/...`.
  The project does **not** use IBM Cloud Object Storage (it must stay free). Cloudant stores only the image *keys*, never image bytes.
- **Frontend:** a separate React app (not in this folder). It talks to this API only.

> Status: tasks 1-8 (setup, auth, profile, listing create/edit/delete, image upload, browse/search/filters) are done.
> Task 9 (requests, exchange and contact privacy) is implemented and described in "Requests, exchange and contact privacy" below;
> see `TASK9_PROGRESS.md` for what has and has not been verified.

## Quick start

```powershell
cd backend
npm install
copy .env.example .env     # then open .env and fill in your own values (never commit .env)
npm run db:setup           # creates the database if missing + the query indexes (safe to repeat)
npm run dev                # starts the API with auto-reload (npm start for plain start)
```

Open <http://localhost:5000/api/v1/health> to check that it runs, and
<http://localhost:5000/api/v1/health/database> to check the Cloudant connection.

Environment variables (see `.env.example` for explanations): `PORT`, `NODE_ENV`, `FRONTEND_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`,
`CLOUDANT_URL`, `CLOUDANT_APIKEY`, `CLOUDANT_DATABASE`, `BACKEND_URL`, `UPLOADS_DIR`.

| Command | What it does |
|---|---|
| `npm run dev` / `npm start` | Start the API |
| `npm test` | Run all automated tests (no internet, no credentials needed) |
| `npm run db:setup` | Create the database (if missing) and the indexes. **Run again after updating to Task 8** (the two `listing-feed-*` indexes) **and to Task 9** (the three `request-by-*` indexes) |
| `npm run db:verify-browse` | Read-only check of the browse queries against your **real** Cloudant (see "What is verified") |
| `npm run db:verify-requests` | Read-only check of the request **indexes and queries** against your **real** Cloudant (see "What is verified"). It never writes, and it does **not** test the request workflow (send, accept, decline, cancel, complete) |

## API overview

Base URL: `/api/v1`. Every answer is `{ "success": true, "data": ..., "meta": ... }` or
`{ "success": false, "error": { "code", "message", "details?" } }`.

| Method and path | Login needed | Purpose |
|---|---|---|
| `GET /health`, `GET /health/database` | no | Status checks |
| `POST /auth/register`, `POST /auth/login` | no | Create account / log in (returns a JWT) |
| `GET /auth/me` | yes | Current user |
| `PATCH /users/me` | yes | Edit own name and shared contact |
| **`GET /listings`** | **no** | **Public browse, search, filter, sort, paginate (Task 8)** |
| `POST /listings` | yes | Create a listing |
| `GET /listings/mine` | yes | The logged-in user's own listings |
| `GET /listings/:id` | yes | One listing |
| `PATCH /listings/:id`, `DELETE /listings/:id` | yes (owner) | Edit / soft-delete, only while `available` |
| `POST /listings/:id/images` | yes (owner) | Upload up to 5 images (JPEG, PNG or WebP, 5 MB each), field name `images` |
| `POST /requests` | yes | Ask for a listing (Task 9) |
| `GET /requests/received`, `GET /requests/sent` | yes | Requests for my listings / requests I sent (optional `?status=`) |
| `GET /requests/:id` | yes (owner or requester) | One request; the only place a contact detail can appear |
| `POST /requests/:id/accept`, `/decline`, `/complete` | yes (owner) | Answer a request / mark the hand-over done |
| `POST /requests/:id/cancel` | yes (requester, or either after accept) | Withdraw a pending request / call off an accepted one |

Send the token as `Authorization: Bearer <token>`.

## Browsing listings: `GET /api/v1/listings`

Public (no login). Returns only listings that are **available and not deleted**. Reserved, completed and deleted listings are never returned,
and a client cannot ask for them (`status`, `isDeleted`, ... are rejected as unknown parameters).

| Parameter | Values | Notes |
|---|---|---|
| `q` | search words | Every word must appear in the **title or description** (any letter case, part of a word is enough: `jack` finds "Denim jacket"). Max 5 words / 100 characters. Special characters are matched literally. |
| `category` | `tops, bottoms, dresses, ethnic_wear, outerwear, activewear, accessories, other` | One value, or several: `category=tops,dresses` or repeated |
| `size` | `xs, s, m, l, xl, xxl, free_size` | Same as category |
| `condition` | `new_with_tags, like_new, good, fair` | Same as category |
| `listingType` (alias `type`) | `sell, exchange, donate` | Same as category |
| `colour` (alias `color`) | text, up to 30 characters | Exact match, any letter case (`blue` = `Blue`) |
| `sort` | `newest` (default), `oldest`, `price_asc`, `price_desc` | See "Price sorting" |
| `limit` | 1-50, default 12 | Page size |
| `cursor` | value from `meta.nextCursor` | See "Pagination" |

Filters can be combined freely (all of them must match, several values of one filter mean "any of these"), and combined with `q` and `sort`.
Empty values (`?category=`) count as "not given". **Unknown parameters are rejected with 400** so a typo never silently shows unfiltered results
(for example, there is no `page` parameter: use `cursor`).

Example: `GET /api/v1/listings?q=denim&category=outerwear,tops&size=m&listingType=sell&sort=price_asc&limit=12`

```json
{
  "success": true,
  "data": {
    "listings": [
      {
        "id": "3f2b...",
        "title": "Denim jacket",
        "description": "Classic blue denim, worn twice.",
        "category": "outerwear", "size": "m", "colour": "Blue", "condition": "good",
        "listingType": "sell", "price": 400, "status": "available",
        "images": [{ "id": "9c1d...", "url": "http://localhost:5000/uploads/listings/3f2b.../9c1d....jpg" }],
        "owner": { "id": "a7e0...", "name": "Alice Tester" },
        "createdAt": "2026-01-01T10:00:00.000Z", "updatedAt": "2026-01-01T10:05:00.000Z"
      }
    ]
  },
  "meta": { "limit": 12, "count": 1, "nextCursor": null }
}
```

**Privacy:** each listing contains only the fields shown above. The owner is shown as `{ id, name }` only: never an email, phone/contact detail or
password data. Internal fields (storage keys of images, `ownerId`, `isDeleted`, `_id`, `_rev`, ...) never leave the server.
A contact detail is shared only through an accepted request (see "Requests, exchange and contact privacy").

### Pagination

1. Request the first page **without** `cursor`.
2. If `meta.nextCursor` is not `null`, request the next page with the **same** parameters plus `cursor=<nextCursor>`. (`limit` may change.)
3. Stop when `nextCursor` is `null`. If the last page is exactly full, one more request returns an empty list with `nextCursor: null`.

The cursor is Cloudant's bookmark with a short fingerprint of the query in front of it; treat it as opaque. It only works with the **same** filters, search
and sort it came from: otherwise the API answers `400` with `details: [{ "field": "cursor", ... }]`. When the user changes a filter, start again without a cursor.
There are no page numbers and no "jump to page 5" (Cloudant bookmarks do not support it).

### Price sorting

`price` is a whole number of rupees for `sell` listings and `null` for `exchange` and `donate`.
With `sort=price_asc` the free listings (`null`) come **first**, then the prices from low to high; with `price_desc` the prices come first and the free
listings last. (To show only paid items, add `listingType=sell`.) A listing document that has no `price` field at all (only possible for data created
outside this backend) is left out of the two price sorts but still appears in `newest` and `oldest`.

### Errors

| Status and `error.code` | When |
|---|---|
| `400 VALIDATION_ERROR` | Bad or unknown query parameter, or a cursor that does not belong to the query. `details` lists every problem as `{ field, message }`. |
| `503 DATABASE_INDEX_MISSING` | The Cloudant indexes are missing: run `npm run db:setup` |
| `503 DATABASE_UNAVAILABLE`, `DATABASE_NOT_CONFIGURED`, `DATABASE_NOT_FOUND` | Cloudant cannot be reached / is not configured / the database does not exist |

Error messages never contain credentials, queries or stack traces.

## Requests, exchange and contact privacy (Task 9)

A **request** is one student asking for one listing. There is no separate "exchange" document: an exchange is a request on an `exchange` listing,
which must also describe the item the student offers (`offeredItem`). Every request endpoint needs a login (`Authorization: Bearer <token>`).

### Lifecycle

```
pending  --owner accepts-->        accepted   listing: available -> reserved (the listing disappears from the public feed)
                                              the other pending requests of that listing are then declined (best effort: see "Limits of this part")
pending  --owner declines-->       declined   final: the student cannot send it again
pending  --student withdraws-->    cancelled  the student may send a new request later
accepted --owner marks done-->     completed  listing: reserved -> completed; final
accepted --owner OR student cancels--> cancelled  listing: reserved -> available again
```

A request that was closed only because the listing got reserved for someone else may be sent again if the arrangement falls through.
Any other change is refused with `409 INVALID_STATUS_TRANSITION`. While a listing is reserved or completed it cannot be edited or deleted (`409 LISTING_LOCKED`).

### Endpoints

| Endpoint | Who | Body / query |
|---|---|---|
| `POST /api/v1/requests` | any logged-in student except the listing's owner | `{ "listingId", "message"?, "offeredItem"?: { "title", "description" } }` (message up to 300 characters; offered item **required** for `exchange` listings, **not allowed** for the others) |
| `GET /api/v1/requests/received` | owner | `?status=pending` (or `pending,accepted`, or repeated) |
| `GET /api/v1/requests/sent` | requester | same |
| `GET /api/v1/requests/:id` | owner or requester | - |
| `POST /api/v1/requests/:id/accept` | owner | no body; the owner must have a contact on their profile (`409 CONTACT_REQUIRED`) |
| `POST /api/v1/requests/:id/decline` | owner | no body |
| `POST /api/v1/requests/:id/cancel` | requester (pending or accepted), owner (accepted only) | no body |
| `POST /api/v1/requests/:id/complete` | owner | no body |

The request ID is `<listingId>_<requesterId>`. Because Cloudant refuses two documents with the same ID, a student can never have two requests for one listing, even if two
calls arrive at the same moment. The requester, owner and status are **never** taken from the request body (sending `requesterId`, `ownerId` or `status` is rejected with 400):
they come from the login token and from the server. A response looks like:

```json
{ "success": true, "data": { "request": {
  "id": "<listingId>_<requesterId>", "status": "pending", "role": "requester",
  "message": "Is it still available?", "offeredItem": null,
  "listing": { "id": "...", "title": "Denim jacket", "listingType": "sell", "price": 400, "status": "available" },
  "owner": { "id": "...", "name": "Alice Tester" }, "requester": { "id": "...", "name": "Bob Tester" },
  "createdAt": "...", "updatedAt": "...", "respondedAt": null } } }
```

`role` tells the caller whether they are the `owner` or the `requester`. If the listing was deleted later, `listing.status` is `"removed"` and the saved title is shown.

### Contact privacy

- The **only** way to read a contact detail through the API is `GET /api/v1/requests/:id` **by the requester, while the request is `accepted` and the listing is still reserved for it**.
  The response then has an extra `ownerContact: { "type": "phone", "value": "+91..." }` (the **owner's** contact; the owner must have one to accept).
  If the owner removes their contact later, the field is `null`.
- The owner never receives the requester's contact. Nobody else ever does: not the owner view, not the lists, not accept/decline/cancel/complete answers, not public browsing,
  not listing details, not error messages. When a request is declined, cancelled or completed the contact disappears again.
- Someone who is not the owner or the requester gets `404 NOT_FOUND` (never 403), so nobody can find out which requests exist.
- A user still sees their **own** contact on `GET /auth/me`; that is their own data.

### Request errors

| Status and `error.code` | When |
|---|---|
| `400 VALIDATION_ERROR` | Bad `listingId`, unknown field, bad message / offered item / `?status=` (see `details`) |
| `401 UNAUTHORIZED` | No or invalid token, or the account no longer exists |
| `403 CANNOT_REQUEST_OWN_LISTING` / `403 FORBIDDEN` | Requesting your own listing / a participant doing something only the other side may do (e.g. the requester accepting) |
| `404 NOT_FOUND` | Unknown or deleted listing, or a request you are not part of |
| `409 DUPLICATE_REQUEST`, `REQUEST_DECLINED`, `REQUEST_CLOSED` | You already asked / the owner declined your earlier request / it is already completed |
| `409 LISTING_UNAVAILABLE` | The listing is reserved, completed or deleted |
| `409 INVALID_STATUS_TRANSITION` | The request is in a state where that action is not allowed |
| `409 CONTACT_REQUIRED` | The owner tries to accept without a contact on their profile |
| `409 CONFLICT` | Someone changed the same document at the same moment; try again |

### Limits of this part

- The request lists are not paged: at most 200 requests are returned (`REQUEST_LIMITS.MAX_LIST_RESULTS`), sorted newest first. A user with more than 200 requests would not see the rest
  (and the 200 returned are not guaranteed to be the newest ones). Paging can be added later if it is ever needed.
- The login token is checked without the database (as everywhere in this API), so a token of a deleted account can still read requests it took part in until it expires.
- Editing a listing's type while requests are pending does not update the type saved inside those requests.
- The three request indexes (`request-by-owner`, `request-by-requester`, `request-by-listing`) are created by `npm run db:setup`. `npm run db:verify-requests` checks them against real Cloudant
  (that they exist, that the request queries are accepted and answered from them: see "What is verified"); without them Cloudant would still answer, only more slowly.
  That script does not run the request workflow, which has so far been verified only with the in-memory fake of Cloudant.
- **Concurrency:** Cloudant has no transaction that covers a listing and all of its requests, so this part is **not guaranteed race-free**. Accepting reserves the listing first (that write is the lock),
  then marks the request accepted, then declines the competing pending requests **one by one**: each is re-read and retried after a revision conflict, a request that is no longer pending is never overwritten,
  and one failure does not stop the others. A failure is logged without ids or details (an error code and a count) and never undoes the acceptance. In a rare race a request can therefore stay `pending` on a reserved listing; the owner can still
  decline it, and it can never be accepted (`409 LISTING_UNAVAILABLE`). A request saved at the moment the listing is being reserved declines itself and its sender gets `409 LISTING_UNAVAILABLE`.
- **Recovery:** if an accept fails half-way and leaves a listing reserved for a request that is still `pending`, declining or withdrawing that request puts the listing back on the market
  (a failed recovery is answered with `409 CONFLICT`, the request stays pending, and the action can be repeated). A listing reserved for another request, or already completed, is never reopened this way.

## How the Cloudant queries work (and their limits)

- A listing is a document with `_id` `listing:<uuid>` and `type: "listing"`. Two JSON indexes serve the public feed (created by `npm run db:setup`, defined in `src/config/database.js`):
  `listing-feed-created` = `type, isDeleted, status, createdAt` and `listing-feed-price` = `type, isDeleted, status, price`. Cloudant only sorts with an index, needs every index field in the sort and the same
  direction for all of them, so the query also adds `$exists: true` on the sort field (the approach IBM documents for this).
- The equality conditions (`type`, `isDeleted = false`, `status = available`) are answered from the index, so Cloudant only walks **available** listings.
- Word search (`$regex` inside `$or`), the colour match (`$regex`) and multi-value filters (`$in`) **cannot use an index**. Cloudant applies them to every available listing it walks.
  That is fine for a college-project-sized marketplace (up to a few thousand available listings) but the work grows with the number of listings.
- A Cloudant text index (`$text`) was considered and not used: it matches whole words only (no `jack` -> `jacket`), treats several words as "any", searches every string field and is meant for small result sets.
  Switching later only means changing `buildPublicSelector()` in `src/repositories/listing.repository.js`.
- Search text is escaped before it goes into a regular expression, so it cannot be used to run expensive patterns.
- Cloudant says a bookmark does not promise another page; the API decides from the page size (see "Pagination").

## What is verified

- **Automated (`npm test`):** unit tests for validators and the selector builder, and HTTP integration tests that run the real Express app
  (`tests/listings.api.test.js` for create/edit/delete/images, `tests/browse.api.test.js` for browsing, `tests/requests.api.test.js` for requests, the exchange lifecycle and contact privacy). **They use an in-memory fake of Cloudant**
  (`tests/helpers/fakes.js`). They prove that this backend sends the intended queries and handles the answers; they do **not** prove that real Cloudant accepts those queries
  or orders results (e.g. `null` before numbers) the same way. Races (two changes at the same moment) are simulated by making the fake reject a save as a revision conflict: that tests this backend's retry logic, not real Cloudant concurrency.
- **Against real Cloudant (browse):** run `npm run db:verify-browse`. It only reads, runs the real browse queries (every sort, filters, search, pagination, a damaged bookmark) and prints PASS/FAIL.
  Run `npm run db:setup` first and have a few listings in the database.
- **Against real Cloudant (requests):** run `npm run db:verify-requests` (`scripts/verify-requests.js`). It is **read-only** (`GET /_index`, `POST /_explain`, `POST /_find`, document reads, `POST /_all_docs`): it never creates users,
  requests or any other record, and prints only PASS / FAIL / SKIP lines and counts (no credentials, ids, names or contact details). Run `npm run db:setup` first. It checks:
  1. **Indexes:** `request-by-owner` (`type, ownerId`), `request-by-requester` (`type, requesterId`) and `request-by-listing` (`type, listingId, status`) exist as JSON indexes with the fields defined in `src/config/database.js` (it reads that list).
  2. **Query acceptance and index use:** the queries `request.repository.js` really sends are accepted by Cloudant and, according to `POST /_explain`, answered from the matching index: requests received (no status filter, one status, several statuses with `$in`),
     requests sent (the same three), and the pending requests of one listing. All are run with an id that cannot exist, so they are expected to return nothing.
  3. **Lookups:** finding one request by id (a missing id gives "not found", not an error) and the two bulk lookups behind the request lists (listings and users, `_all_docs` with keys).
  4. **Only if request documents exist** (a sample of at most 25): valid statuses, ids of the form `request:<listingId>_<requesterId>`, no contact/email/password/token field stored in a request, the repository finds real requests by id / owner / requester / status filter / listing,
     "received" is newest first, bulk lookups with real ids, and accepted/completed requests match their listing (`reserved` / `completed`, `acceptedRequestId`, at most one accepted request per listing). These checks are **skipped**, not failed, when there are no requests.

  **First reported run against the project's real Cloudant: 12 passed, 0 failed, 2 skipped.** The 12 passes are the 3 indexes, the 7 queries, the lookup by id and the bulk lookups (items 1-3). The 2 skips are item 4: no request documents existed yet,
  so nothing was checked on real stored requests. Run it again after sending, accepting, declining and cancelling a few requests through the API to exercise item 4.
- **What the real-Cloudant checks do NOT prove:** the request script verifies **indexes, query acceptance and index use** (and, once data exists, the consistency of stored documents). It does **not** send, accept, decline, cancel or complete a request, and does not test duplicate
  prevention (two documents with one `_id`), revision conflicts, the competing-request handling or the contact privacy rule against real Cloudant, because proving those needs writes and the scripts never write. Those behaviours are verified only by the automated tests with the fake.

## Project layout

```
backend/
  src/
    app.js, server.js          Express app / entry point
    config/                    env, constants (allowed categories, sizes, ...), Cloudant client, indexes
    routes/ controllers/       URL -> handler (thin)
    validators/                request checks (browse.validator.js checks the browse query)
    services/                  rules (listing.service.js, storage.service.js, ...)
    repositories/              all Cloudant access (listing.repository.js builds the browse query)
    serializers/               decides which fields leave the server
    middleware/ utils/         auth, upload handling, errors, helpers
  scripts/                     setup-database.js, verify-browse.js, verify-requests.js
  tests/                       node:test files + helpers/fakes.js (fake Cloudant, temp uploads folder)
  uploads/                     uploaded images (ignored by Git)
```
