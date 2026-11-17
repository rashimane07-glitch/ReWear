# ReWear
AI-assisted sustainable fashion marketplace for buying, selling and exchanging pre-owned clothing.

A community platform where students sell, swap or donate pre-owned clothes.

- **Frontend:** React 18 + Vite + Tailwind CSS (`FRONTEND/`)
- **Backend:** Node.js 22 + Express, IBM Cloudant, JWT login, photos stored on the backend's disk (`backend/`)

## Features

- Browse, search, filter (category, gender, size, condition, type) and sort listings; public product pages
- Sign up, log in, profile with phone number (shared only after a request is accepted)
- Sell, swap or donate a piece with up to 5 photos; edit and delete your own listings
- Purchase / exchange / donation requests: send, withdraw, accept, decline, cancel, complete
- Report a listing; admin page to review reports and remove listings
- 30 demo listings with photos (`npm run seed:demo`)

## Run it locally

Requirements: Node.js 22+, the Cloudant credentials (ask the team, never commit them).

```bash
cd backend
npm install
copy .env.example .env        # then fill in CLOUDANT_URL, CLOUDANT_APIKEY and JWT_SECRET
npm run dev                   # http://localhost:5000/api/v1/health
```

In a second terminal:

```bash
cd FRONTEND
npm install
copy .env.example .env        # then set VITE_API_URL=http://localhost:5000/api/v1
npm run dev                   # http://localhost:5173
```

Without `VITE_API_URL` the frontend runs in **mock mode** (demo data in the browser, no backend).

### Demo data on a new computer

The 30 demo listings are already in the shared Cloudant database. Their photos live on the disk of the
computer that runs the backend, so on any other computer run once:

```bash
cd backend
npm run demo:restore-images
```

It only reads Cloudant and copies `backend/demo-images/` into `backend/uploads/` under the names the listings expect.

### Useful commands (backend)

| Command | What it does |
|---|---|
| `npm test` | Automated tests (no internet or credentials needed) |
| `npm run db:setup` | Create the database (if missing) and its indexes; safe to repeat |
| `npm run seed:demo:dry` / `npm run seed:demo` | Preview / add the demo seller and 30 demo listings (never duplicates) |
| `npm run demo:restore-images` | Put the demo photos on this computer (see above) |
| `npm run demo:seller-login` | Let the demo seller log in (uses `DEMO_SELLER_PASSWORD` and `DEMO_SELLER_PHONE` from `.env`) |
| `npm run admin:create -- <email>` | Make an existing account an administrator |

Frontend: `npm run build` (production build) and `npm run test:smoke` (mock-mode checks).

More detail: [`backend/README.md`](backend/README.md) (API, data model, verification) and [`FRONTEND/README.md`](FRONTEND/README.md).

## Team and reports

| Who | Work |
|---|---|
| Rashi Mane | Backend (tasks 1-10), frontend-backend integration (`TASK11_PROGRESS.md`) |
| Bhumika Maheshwari | Frontend pages and components, frontend testing (`TESTING_REPORT.md`) |
| Ananya | Cloudant verification (`Person3_Cloudant_Verification_Report.docx`) |
| Dhrati Nigam | Gender and category support, listing editing, demo data, reports/admin screens, final integration |

Demo photos: Unsplash License, see [`backend/demo-images/CREDITS.md`](backend/demo-images/CREDITS.md).
