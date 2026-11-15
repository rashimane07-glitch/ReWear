// Where the backend lives, and which mode the app runs in.
//
//   VITE_API_URL empty (the default)  -> MOCK mode: no network, demo data, demo login (token "mock-token").
//   VITE_API_URL set                  -> REAL mode: every call goes to the Express API.
//
// For the real backend running on your own computer, put this in FRONTEND/.env (see .env.example)
// and restart "npm run dev" (Vite reads .env only when it starts):
//
//   VITE_API_URL=http://localhost:5000/api/v1
//
// A trailing slash is removed, so ".../api/v1/" and ".../api/v1" both work.
export const API_URL = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '')
export const API_MODE = API_URL !== ''
