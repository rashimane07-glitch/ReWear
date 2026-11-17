# ReWear – Frontend

React 18 + Vite + Tailwind CSS. See the [root README](../README.md) for the whole project.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build
npm run test:smoke   # mock-mode checks (always mock, never touches a real backend)
```

## Modes

- **Real mode:** put `VITE_API_URL=http://localhost:5000/api/v1` in `FRONTEND/.env` (copy `.env.example`) and restart `npm run dev`.
  Every call goes to the Express API through `src/services/http.js`.
- **Mock mode:** leave `VITE_API_URL` empty. Demo data lives in the browser (`src/data/`), demo login `demo@rewear.test` / `demo1234`,
  and everything resets on refresh. Reports and the admin page need real mode.

## Where things are

| Path | Purpose |
|---|---|
| `src/services/api.js` | All data calls (listings, requests, reports, admin); mock and real branches |
| `src/services/listingMapper.js` | Backend ⇄ screen translation (category labels, gender, sizes, conditions) |
| `src/services/http.js`, `auth.js`, `session.js` | HTTP helper, login / register / profile, saved session |
| `src/pages/` | Home, Explore, ProductDetails, Sell, Donate, Exchange, Dashboard, Admin, Login, Signup, About |
| `src/components/` | Shared UI (forms, modals such as EditListingModal and ReportModal, cards, filters) |

## Notes

- Product pages are public; requesting, reporting, selling and the dashboard need a login.
- The wishlist is saved in this browser only (`localStorage`). College and location on the profile are kept on this device only.
- The admin page (`/admin`) is shown to accounts with the admin role (`cd backend && npm run admin:create -- <email>`).
- Images in `public/images/` are the site's own photos; listing photos are served by the backend under `/uploads/...`.
