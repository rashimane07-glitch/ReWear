# ReWear Backend

REST API for **ReWear**, a student marketplace to sell, exchange or donate pre-owned clothes.

- **Stack:** Node.js (22 or newer) · Express · IBM Cloudant (database) · JWT + bcryptjs (login) · Multer (uploads)
- **Images:** saved on the backend's own disk in `backend/uploads/` and served at `/uploads/...`.
  The project does **not** use IBM Cloud Object Storage (it must stay free). Cloudant stores only the image *keys*, never image bytes.
- **Frontend:** a separate React app (not in this folder). It talks to this API only.

> Status: tasks 1-7 (setup, auth, profile, listing create/edit/delete, image upload) are done.
> Task 8 (browse, search, filters, sorting, pagination) is described below.

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
| `npm run db:setup` | Create the database (if missing) and the indexes. **Run again after updating to Task 8** to get the two `listing-feed-*` indexes |
| `npm run db:verify-browse` | Read-only check of the browse queries against your **real** Cloudant (see "What is verified") |

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
Contact details are only meant to be shared after a request is accepted (a later task).

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
  (`tests/listings.api.test.js` for create/edit/delete/images, `tests/browse.api.test.js` for browsing). **They use an in-memory fake of Cloudant**
  (`tests/helpers/fakes.js`). They prove that this backend sends the intended queries and handles the answers; they do **not** prove that real Cloudant accepts those queries
  or orders results (e.g. `null` before numbers) the same way.
- **Against real Cloudant:** run `npm run db:verify-browse`. It only reads, runs the real browse queries (every sort, filters, search, pagination, a damaged bookmark) and prints PASS/FAIL.
  Run `npm run db:setup` first and have a few listings in the database.

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
  scripts/                     setup-database.js, verify-browse.js
  tests/                       node:test files + helpers/fakes.js (fake Cloudant, temp uploads folder)
  uploads/                     uploaded images (ignored by Git)
```
