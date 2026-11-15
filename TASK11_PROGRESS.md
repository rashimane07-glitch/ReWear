# TASK 11 PROGRESS — Frontend ⇄ backend integration

Handover file between Claude sessions. **The code is the truth; this file is only a guide.** Update it after every phase and never delete
other sessions' notes. Claude sessions on this project have **no terminal and no Git**: builds, `npm run dev`, Git and real-server checks are done by the user.

## Phases
| Phase | Content | State |
|---|---|---|
| 1 | API foundation + authentication (central HTTP helper, register, login, JWT session, `/auth/me`, logout, `PATCH /users/me`) | **CODE WRITTEN and saved (re-inspected statically by a second session: all files present, imports/exports match). Service layer verified in a sandbox harness. NOT yet built or run in a browser by anyone.** |
| 2 | Listings + images (browse/explore, product details, create listing with image upload, my listings, delete) | not started |
| 3 | Search / filters / sorting / pagination (Explore) | not started (may be merged with 2) |
| 4 | Requests + exchange + contact privacy, dashboard | not started |
| 5 | Reports (+ admin if wanted), polish, final test | not started |

## Phase 1 — what was found before editing
- `FRONTEND/src/services/auth.js` had MOCK auth plus a half-written real branch that was wrong: it read `data.message` (the backend nests errors under `error.message`), returned the whole
  `{ success, data }` envelope instead of `data`, did not store the token for `register`, and used `PUT /users/me` (the backend only has **PATCH**).
- `api.js` (listings/requests) is still mock-first with mock-shaped real branches (raw `fetch(...).then(r => r.json())`). **Not touched in phase 1** (listing/request integration is later phases).
- `AuthContext.jsx` trusted whatever was in storage, never asked the server, had no expiry handling. `Dashboard.jsx` profile form sent `{ name, college, location }` with no error handling.
- No `TASK11_PROGRESS.md`, no earlier Phase 1 changes on disk.

## Phase 1 — files
**New** (`FRONTEND/src/services/`):
- `config.js` — `API_URL` (trailing slash removed) and `API_MODE` (= `VITE_API_URL` is set). Empty = MOCK mode (the default).
- `session.js` — saved session `{ token, user }` (`getSession`, `getToken`, `storeSession`, `updateStoredUser`, `clearSession`), `MOCK_TOKEN`, `SESSION_EXPIRED_EVENT`,
  and the device-only profile extras (`getLocalProfile`, `saveLocalProfile`). No network code, so `http.js` and `auth.js` never import each other.
- `http.js` — **the central helper**: `get`, `post`, `patch`, `del` (return the backend's `data`), `getPage` (returns `{ data, meta }`), `ApiError` (`status`, `code`, `details`), `fieldErrors(err)`.
**Rewritten** (inspected first; mock code kept as it was): `services/auth.js`, `context/AuthContext.jsx`.
**Edited**: `pages/Dashboard.jsx` (4 small edits: import `API_MODE`, `saveProf` with try/catch + honest message, `required` on college only in mock mode, one note line under the form in real mode), `FRONTEND/.env.example` (documentation only; value still empty).
**Not touched**: `api.js`, `Login.jsx`, `Signup.jsx` (they work unchanged: they show `err.message`, which is now the real backend message), backend, `.env`.

## How it works
- **Modes**: `VITE_API_URL` empty → mock (as before, nothing changes). `VITE_API_URL=http://localhost:5000/api/v1` in `FRONTEND/.env` (copy of `.env.example`) → real mode; **restart `npm run dev`** after changing it.
- **http.js** (every call): `Authorization: Bearer <JWT>` when a real token is saved (`{ auth: false }` for login/register); JSON body for objects; a `FormData` is sent as is with **no** Content-Type (the browser adds the multipart boundary);
  unwraps `{ success: true, data, meta? }`; failures become `ApiError` with a readable message (backend `error.message`, or the joined `details` messages for `VALIDATION_ERROR`, or "Could not reach the server…",
  or "The server sent a reply this app does not understand."). Never returns a fake success. A **401 on a request that carried a token** deletes the saved session and fires `rewear:session-expired`; `AuthContext` listens and logs out
  (protected pages then redirect to `/login`). A 401 from login (wrong password) is sent without a token, so it is never treated as an expired session.
- **Login** (`POST /auth/login`): reads `{ token, user }` from `data`, saves `{ token, user }` in localStorage (Remember me ON) or sessionStorage (OFF). **Register** (`POST /auth/register`): sends **only** `name, email, password`;
  the backend returns `{ token, user }`, so registering also signs the person in (Remember me ON) with no second login call. `AuthContext.signUp` handles both modes (mock register returns nothing → it logs in as before).
- **Session persistence / current user**: on app start in real mode, `AuthContext` calls `GET /auth/me` once and refreshes the user; offline = the saved session stays; 401 = logged out. **Logout** just forgets the token (the JWT is stateless; there is no logout endpoint).
- **Mock token never used in real mode**: `getSession()` deletes a leftover `mock-token` session in real mode. In mock mode a real JWT session is ignored (not deleted).
- **Profile update**: `PATCH /users/me` with only the fields the backend accepts (`name`, `contact`) and only when they changed; the returned `data.user` is merged, saved in the stored session and put in `AuthContext`.
- **Unsupported profile fields**: the backend rejects anything but `name` and `contact`, and **registration ignores `college`**. So `college` and `location` are kept **on this device only** (`localStorage` key `rewear_local_profile`, per user id),
  merged into `user.college` / `user.location` so the existing UI keeps working. They are **not** saved to the account, not shared across devices or with other people. The profile form says so in real mode, and the success message says so when they were changed.
  If the PATCH is rejected, nothing is saved locally. Backend validation was not changed.

## Verification actually done (by Claude, in its Linux sandbox — NOT in the user's browser, NOT a Vite build, NOT against the real backend)
- `node --check` on the four service files (temporary copies with `.js` import extensions and an env shim, because plain Node needs them; the project files are untouched).
- A throw-away harness (not in the project) ran the real `config/session/http/auth` code with a **stubbed `fetch`**: **real mode: all checks passed** (login URL/method/headers/body, unwrapping, remember ON/OFF storage, wrong-password message, validation-detail message,
  network failure, non-JSON replies, register sends only 3 fields + college stored locally + signed in, `GET /auth/me` with Bearer token, `PATCH /users/me` with only `{"name"}` and never PUT, no request when only device extras change, contact PATCH,
  rejection saves nothing locally, 401 clears session + event, FormData without Content-Type, DELETE/PATCH/getPage, logout, leftover mock session deleted). **Mock mode: 11/11** (demo login, register, remember OFF, duplicate email, profile update, no network).
  The harness found and fixed one real bug (stale college overwrote a fresh device value).
- The JSX files (`AuthContext.jsx`, `Dashboard.jsx`) were reviewed by reading only: no JSX compiler was available.

## NOT verified (needs the user's terminal / browser)
1. `cd FRONTEND && npm run build` (compiles the JSX; expect success) and `npm run test:smoke` (mock data layer; expect "All checks passed" — it imports `auth.js`/`api.js`, whose mock behaviour is unchanged).
2. Real end-to-end in a browser: start the backend (`cd backend && npm start`), create `FRONTEND/.env` with `VITE_API_URL=http://localhost:5000/api/v1`, `npm run dev`, then register → lands on dashboard; log out; log in with and without "Remember me"
   (close and reopen the browser); edit the profile name; try a wrong password; stop the backend and try to log in (expect the "Could not reach the server" message).
3. Whether `backend/.env` has `FRONTEND_URL=http://localhost:5173` (its default) — otherwise the browser blocks calls (CORS). The backend must have `JWT_SECRET` and Cloudant set, or register/login answer 503 "not configured".

## Known limitations
- College and location are device-only (see above). To store them for real the **backend** would need new profile fields (not allowed in this task; propose it to the owner if wanted).
- **No phone/contact field exists in the UI.** The backend REQUIRES the listing owner to have a phone contact before accepting a request (`409 CONTACT_REQUIRED`). `updateProfile` already supports `{ contact: { type: 'phone', value } }`,
  but a phone input must be added to the profile form before request integration (phase 4). The backend normalises numbers (`9876543210` → `+919876543210`).
- `api.js` still has its own `API_URL` constant and a private `call()` that always sets a JSON Content-Type and reads the raw envelope. **Replace them with `http.js`** when migrating each function.
- `rewear_users` (mock accounts) and `rewear_local_profile` stay in localStorage after logout (intended for the device-only extras).

## Phase 1 — second-session inspection (static code reading only; no build, no Git, no browser, no backend run)
Checked against the real files on disk. **Present and complete:** `services/config.js`, `session.js`, `http.js`, `auth.js`, `context/AuthContext.jsx`, the 4 `Dashboard.jsx` edits (`API_MODE` import, `saveProf` with try/catch,
`required` on college only in mock mode, the real-mode note under the form), `.env.example`, and this file (not cut off). `api.js`, `Login.jsx`, `Signup.jsx` are untouched, as stated.
- **Imports/exports match:** `auth.js` re-exports `getSession`/`getToken` (so `api.js` and `AuthContext.jsx` keep working); `http.js` and `auth.js` import only from `config.js`/`session.js`, so there is no import cycle.
- **Contract matches the backend:** login/register read `{ token, user }` from `data` (backend `sendSuccess(res, { token, user })`, 201 for register); `/auth/me` returns `{ user }`; register sends only `name, email, password`;
  profile uses `PATCH /users/me` with only `name` / `contact` (the backend rejects any other field with 400); errors are read from `error.message` / `error.details`; FormData gets no manual Content-Type; DELETE/GET send no body.
- **Mock mode:** mock login/register/profile code is unchanged in behaviour; the mock token is only produced in mock mode; the smoke test (`npm run test:smoke`) imports the same functions — expected to still pass, **not run**.
- `FRONTEND/.gitignore` ignores `.env` files.

**IMPORTANT caveat found (not a Phase 1 bug, but it affects how Phase 1 can be tested in a browser):** in REAL mode everything outside the auth pages still uses the old, wrong `api.js` branches (raw `fetch(...).then(r => r.json())`,
no envelope unwrapping, wrong endpoints such as `GET /requests` and `/listings?sort=trending`). So right after a successful real login/registration the app navigates to `/dashboard`, whose calls (`getMyListings`, `getRequests`, `getListings`) return
objects instead of arrays and are expected to **crash the page (TypeError / blank screen)**. The same applies to Home (`getTrendingProducts`) and Explore. This is why those pages must be migrated in Phases 2 and 4. **How to test Phase 1 in real mode meanwhile:**
use the Login / Signup pages (error messages, wrong password, server stopped), and after a successful login look in the browser DevTools → Application → Local Storage (or Session Storage if "Remember me" is off) for `rewear_session`
(it must hold `{ token: "<long JWT>", user: { id, name, email, role, contact, createdAt, college, location } }`); a blank page after login is then expected, not an auth failure.
The mock mode is unaffected.

## Handover for the next session — PHASE 2 (listings + images)
Read this file, then inspect the real files; do not trust the summary. Do not redo phase 1. Do not touch the backend.
1. **Use `services/http.js`** for every real-mode call (`get/post/patch/del/getPage`, `ApiError`, `fieldErrors`); keep the mock branches. Delete `api.js`'s private `call()` and per-function `fetch(...).then(r => r.json())` as you migrate.
2. **Backend listing contract** (verify in `backend/src/validators/listing.validator.js`, `serializers/listing.serializer.js`, `README.md`): `POST /listings` (JSON, fields `title, description, category, size, colour, condition, listingType, price`),
   then `POST /listings/:id/images` (multipart field `images`, up to 5, 5 MB each, jpeg/png/webp checked by content) — **two calls**, not one multipart POST; `GET /listings` (public browse: `q, category, size, condition, colour, listingType, sort, limit, cursor`;
   response `data.listings`, `meta { limit, count, nextCursor }`), `GET /listings/:id` (needs login), `GET /listings/mine`, `PATCH`, `DELETE`. Image URLs are absolute (`<BACKEND_URL>/uploads/...`).
3. **The frontend and backend vocabularies differ** (mock names like "Casual Wear", `name`, `images[]` of URLs, `listingType`, `seller{}`, numeric ids vs backend enums `tops/bottoms/dresses/ethnic_wear/outerwear/activewear/accessories/other`, sizes `xs…xxl/free_size`,
   conditions `new_with_tags/like_new/good/fair`, uuid ids, `owner { id, name }`). Inspect `data/mockData.js`, `data/listings.js`, `ListingForm.jsx`, `FilterSidebar.jsx`, `ProductCard.jsx`, `ProductDetails.jsx`, `Sell.jsx`, `Donate.jsx`, `Explore.jsx` and write ONE mapping module
   (backend ⇄ UI shape) instead of changing the UI; show backend validation messages next to the form fields with `fieldErrors`.
4. Wishlist ids are stored client-side (`WishlistContext`); real listing ids are strings (uuid), so check the wishlist logic.
5. Real-mode user ids are uuids (mock: `'demo'`); `getMyListings(userId)` in real mode must use `GET /listings/mine`, not the id.
6. Remember: the user cannot run Git or terminal commands through Claude; list every check that needs `npm run build` / the browser, and update this file at the end of the phase.

---

## PHASE 2 — listings (browse / search / filters / pagination, create + separate image upload, product detail, my listings) — STATUS: CODE WRITTEN, NOT BUILT, NOT RUN
**Two Claude sessions edited the same folder at the same time** (the files below were written by both; each saw the other's edits appear). The result was checked for consistent imports, but NOTHING was built or run.
If anything fails to compile, the first suspect is a mismatch between a page and `services/listingMapper.js` (see the export list below). Do not rewrite files wholesale; compare the imports first.

**Backend contract used (read from the real code, not guessed):** listing = `{ id, title, description, category, size, colour, condition, listingType, price|null, status, images:[{id,url}], owner:{id,name}, createdAt, updatedAt }`;
`GET /listings` is PUBLIC (query `q, category, size, condition, listingType|type, colour, sort=newest|oldest|price_asc|price_desc, limit<=50, cursor`; unknown params are rejected with 400; response `data.listings` + `meta { limit, count, nextCursor }`);
`GET /listings/:id` and `GET /listings/mine` need a login; `POST /listings` takes ONLY `title, description, category, size, colour, condition, listingType, price` (price only for `sell`); photos go in a SECOND call `POST /listings/:id/images`
(multipart field `images`, ≤5, 5 MB each); `DELETE /listings/:id` works only while the listing is `available` (else 409 LISTING_LOCKED). There is NO price filter, NO trending sort, NO location / looking-for / college / original-price field.

**Files (all under `FRONTEND/src/`)**
- `services/listingMapper.js` (NEW) — the one backend ⇄ screen translation: `fromBackend`, `toCreatePayload`, `toBrowseQuery`, `encodeDescription`, `uiFieldErrors` (= `formErrorsFrom`), `OPTIONS` (= `FILTER_OPTIONS`; real lists in REAL mode, the demo lists in MOCK mode, plus `formSizes`, `colourRequired`, `maxImageMb`), `BACKEND_DESCRIPTION_MAX`, `CATEGORY_TILES` (unused now).
  Labels ⇄ codes ("Ethnic wear" ⇄ `ethnic_wear`, "Like new" ⇄ `like_new`, "Free size" ⇄ `free_size`). Location and "looking for" are NOT sent as fields: `encodeDescription` appends them to the end of the description ("Location: …", "Looking for in exchange: …").
- `services/api.js` — real branches now use `http.js`: `browseListings` (new, public, returns `{ listings, nextCursor }`), `getListings`, `getTrendingProducts` (= newest 4; the backend has no trending), `getListingById` (404 → null; 401 is thrown), `getSimilarListings`, `getListingsByIds`,
  `createListing` (REAL: POST /listings, then POST /listings/:id/images as FormData; if the photos fail the new listing is KEPT, never deleted automatically, and the person gets a clear error with the listing id — see "Correction: photo upload failure" at the end of this file), `getMyListings` (`GET /listings/mine`), `deleteListing`, `getCategories` (real tiles named like the backend categories). Request functions are still stand-ins (Phase 3). Mock branches unchanged.
- `pages/Explore.jsx` — REAL mode: server-side search (350 ms after typing stops), filters, sort, "Load more" with `nextCursor`, error + "Try again"; the price slider is applied in the browser (the backend has no price filter; slider at maximum = no limit). MOCK mode: the original in-browser filtering.
- `components/FilterSidebar.jsx`, `ListingForm.jsx` (colour field, folded location/looking-for, backend field messages under the fields), `ImageUploader.jsx` (5 MB in REAL mode), `ProductCard.jsx` (no empty college), `pages/ProductDetails.jsx` (uuid wishlist ids, guest → login redirect, similar listings), `pages/Dashboard.jsx` (my listings, saved items, delete with error toast) — edited by the other session; reviewed here only for imports.

**NOT verified (needs the user):** `npm run build`; `npm run test:smoke` (mock layer, expected to pass); in a browser with the real backend: browse + search + filters + sort + Load more, create a listing with 1–5 photos (check the files appear under `backend/uploads/listings/`), open a listing while logged in and as a guest (guest is sent to /login), My Listings, delete a listing,
wrong/too-long input (messages should appear under the form fields). Real mode needs backend `FRONTEND_URL` = the Vite origin (CORS) and `BACKEND_URL` reachable by the browser (image links are absolute).
**Known limitations:** no `seller.college` / `location` / `originalPrice` / "looking for" in REAL mode (shown only inside the description); "Trending on campus" shows the newest listings; the max-price slider is client-side only; editing a listing from the dashboard is still "not available yet" (the backend PATCH exists, not wired);
the wishlist is still browser-only; Home category tiles reuse the placeholder photos. Phase 3 (requests/exchange) is untouched: in REAL mode `submitRequest` / `updateRequestStatus` refuse with a clear message and `getRequests` returns empty lists.

---

## Correction: photo upload failure must KEEP the listing (small fix after Phase 2)
**Requested behaviour:** if `POST /listings` fails → normal creation error. If it succeeds but `POST /listings/:id/images` fails → KEEP the created listing, never call `DELETE /listings/:id` automatically, tell the person clearly, and expose the listing id in the error.
**What was found:** `createRealListing()` in `api.js` had ALREADY been changed by the other session (no DELETE call any more; it throws `ApiError` code `PHOTOS_NOT_UPLOADED` with `error.listingId`), but the Phase 2 note above still said "DELETED again" (fixed), `ListingForm.jsx` only showed the long message in a 4-second toast, and the form stayed submittable (a second click would create a duplicate listing).
**Changed (2 files, nothing else):**
- `services/api.js` — `createRealListing`: the error now also carries the id in `error.details.listingId` (still `error.listingId` and in the message); the message mentions "My Donations" for donated items. `listingMapper.formErrorsFrom` and `http.fieldErrors` only read `details` when it is an array, so an object there is ignored safely (checked).
- `components/ListingForm.jsx` — for code `PHOTOS_NOT_UPLOADED` only: a persistent alert (role="alert") above the form shows the message, with a "Go to My Listings" / "Go to My Donations" link and a "Start a new listing" button; a short toast is shown too; the submit button is disabled while the alert is shown (no accidental duplicate). All other errors behave as before (field messages + toast). The successful flow, mock mode, Phase 1 services, requests and the backend were not touched.
**There is no "add photos to an existing listing" screen yet** (the backend endpoint `POST /listings/:id/images` exists; listing editing is not wired), so the message tells the person to delete the saved listing under My Listings / My Donations and list it again, or to leave it as it is.
**Checked (Claude's Linux sandbox only, stubbed `fetch`, temporary copies of the real files; not a Vite build, not a browser, not the real backend):** creation failure → the normal error, one call, no upload, no delete; success → exactly `POST /listings` then `POST /listings/:id/images`, same result as before; upload failure with 413 / 400 / 503 and a network failure → exactly POST, POST (**no DELETE**), code `PHOTOS_NOT_UPLOADED`, `error.listingId` and `error.details.listingId` set, message says saved + not uploaded + the reason + the id; `formErrorsFrom` ignores the details object. 17 checks, all passed.
**NOT re-run after this fix (needs the user):** `cd FRONTEND && npm run build` (compiles `ListingForm.jsx`, whose JSX was only read, not compiled) and `npm run test:smoke` (mock layer; the fix is in the real-mode branch only, so it should be unaffected). Browser check with the real backend: stop or break the upload (e.g. a photo over 5 MB can be blocked by the form itself, so stop the backend between the two calls, or temporarily rename the `uploads` folder) and confirm the alert appears, the listing is in My Listings, and the Publish button is disabled.

---

## PHASE 3 — requests, exchange offers, accept / decline / cancel / complete, phone contact — STATUS: CODE COMPLETE (source-reviewed); NOT BUILT, NOT BROWSER-TESTED
(This **supersedes** the line above that says Phase 3 is untouched / stand-ins. The code below was written by the earlier Phase 3 session; this session re-read every file against the backend and changed no source file.)

**Backend contract used (read from `backend/src/validators/request.validator.js`, `constants.js`, `README.md`):** `POST /requests` takes ONLY `listingId`, optional `message` (≤300) and optional `offeredItem { title 3-100, description 10-500 }` (required for `exchange` listings, forbidden otherwise; `offeredListingId` does not exist and is never sent);
`GET /requests/received`, `GET /requests/sent` (no contact ever), `GET /requests/:id` (the ONLY place `ownerContact` can appear: the REQUESTER, while the request is `accepted` and the listing reserved for it), `POST /requests/:id/accept|decline|cancel|complete`.
Statuses: `pending, accepted, declined, cancelled, completed`. Accepting needs a phone contact on the owner's profile (`409 CONTACT_REQUIRED`).

**Files**
- `services/requestMapper.js` (kept as is): `fromBackendRequest`, `contactText`, `toOfferedItem` (turns the picked listing into `{title, description}` within 3-100 / 10-500), `REQUEST_ACTIONS` ('rejected' → decline).
- `services/api.js`: `submitRequest` (REAL: `POST /requests`; 5th argument = the picked piece, used only to build `offeredItem`), `getRequests` (REAL: received + sent; for each ACCEPTED SENT request one extra `GET /requests/:id` to read `ownerContact`), `updateRequestStatus` (REAL: `POST /requests/:id/<action>`). Real failures are thrown (never answered with demo data). Mock branches kept (cancelling an accepted mock request now reopens the item).
- `components/ExchangeOfferModal.jsx` (offer = one of my active listings; one click = one request; `DUPLICATE_REQUEST` marks it as sent), `RequestRow.jsx` (buttons per role/status: owner Accept/Reject on pending, Mark completed/Call off on accepted; requester Withdraw on pending, Cancel on accepted; `busy` disables buttons),
  `StatusBadge.jsx` (knows `declined`, `cancelled`), `pages/Dashboard.jsx` (loading / error + Try again / empty states, `busyId` guard, `refresh()` of requests AND listings after every action, a `CONTACT_REQUIRED` error opens the profile form, phone field), `pages/Exchange.jsx`, `pages/ProductDetails.jsx` (string id comparison for "Request pending", `DUPLICATE_REQUEST` handled, "No longer available" for reserved/completed).
- Phone/contact: the profile form (REAL mode only) sends `contact: { type: 'phone', value }` (or `null` to remove) through `auth.updateProfile` → `PATCH /users/me`; only `name` and `contact` ever reach the backend (college / location stay on the device); the returned (normalised) number is shown again.

**Contact privacy (checked in code and in the harness):** lists never carry a contact; a pending request never shows one; nothing is derived from names or emails (`from.email` exists only in MOCK mode); an accepted SENT request shows exactly the contact the backend returns, or "not available right now"; the owner is told only that the requester "can now see your contact details".

**Executed in Claude's Linux sandbox (NOT on your PC, NOT through Vite, NOT a browser):** plain-Node copies of `config/session/http/auth/api/listingMapper/requestMapper` + the mock data. (1) The project's own `scripts/smoke-test.mjs` against the mock layer: **15 of 15 PASS**. (2) A real-mode harness against a small FAKE backend written by Claude to follow the contract above (it rejects unknown fields like the real validators):
**28 of 28 PASS** — real JWT stored and sent as Bearer; sell request body is only `{listingId, message}`; exchange sends `offeredItem` and never `offeredListingId`; duplicate → `DUPLICATE_REQUEST`; lists mapped (`declined` kept); contact only for accepted sent requests and only the backend's value; `/requests/:id` fetched only for accepted sent requests; the four actions hit accept/decline/cancel/complete; `CONTACT_REQUIRED` surfaces; profile PATCH sends only `contact` / only `name`, no request for device-only changes, `null` removes the phone;
photo failure keeps the listing (no DELETE, id in the error); create payload only has backend fields; multipart upload has a browser-made boundary; browse query uses backend codes; a 503 and an unreachable server both REJECT (no silent mock data). The fake server is NOT the real backend, so this proves the frontend's behaviour against the documented contract only.

**NOT verified — needs the user's terminal/browser:** `cd FRONTEND && npm run build` (the JSX files `Dashboard.jsx`, `RequestRow.jsx`, `ExchangeOfferModal.jsx`, `Exchange.jsx`, `ProductDetails.jsx`, `ListingForm.jsx` were only read, never compiled) and `npm run test:smoke` (the plain-Node copy passed, the real script under Vite was not run).
Real two-account walk-through (backend running, `FRONTEND/.env` with `VITE_API_URL=http://localhost:5000/api/v1`): account A lists a sell item and an exchange item; B sends a purchase request (no contact visible anywhere), B offers a swap (A sees the offered title/description), B tries a duplicate (message, no second request);
A tries to accept WITHOUT a phone (expect the toast and the profile form opening), adds a phone, accepts (the listing becomes reserved and leaves Explore; other pending requests on it become declined); B opens My Requests → the owner's phone appears ONLY now; A cancels or B cancels (listing returns to Explore, phone disappears); A marks another as completed (phone disappears); a third account never sees any of it.
**Known limitations:** an exchange offer is a text snapshot (title, size/condition, description) — the offered piece stays listed and is not reserved; "Looking for" is only inside the listing description (not parsed on the cards); request rows show no photo (the backend's request summary has none); no confirmation dialog before Cancel / Call off; request lists are limited to the newest 200 by the backend; Dashboard "Edit" listing is still not wired.
**Phase 4 has NOT been started.**
