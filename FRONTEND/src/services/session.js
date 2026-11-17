// Everything about the saved login ("session"): where it is kept, and the device-only profile extras.
// This file has no network code, so both http.js (adds the token to requests) and auth.js can use it
// without importing each other.
//
// A session is { token, user }:
//   MOCK mode  token is the fake "mock-token", user comes from this browser's demo accounts.
//   REAL mode  token is the JWT issued by the backend, user is the backend's user object.
//
// "Remember me": ON keeps the session in localStorage (survives closing the browser), OFF keeps it in
// sessionStorage (gone when the tab closes). Only one of the two ever holds a session.
import { API_MODE } from './config'

const SESSION = 'rewear_session'
const LOCAL_PROFILE = 'rewear_local_profile'
export const MOCK_TOKEN = 'mock-token'
// Sent on window when the server rejects our token (expired, or the account no longer exists).
export const SESSION_EXPIRED_EVENT = 'rewear:session-expired'

const parse = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION)
  sessionStorage.removeItem(SESSION)
}

// The saved session, or null. The mock token and real mode never mix:
//  - REAL mode never uses a leftover demo session: it is deleted, so "mock-token" is never sent to the server.
//  - MOCK mode ignores a real JWT (it is left alone, so it still works when the server is switched back on).
export function getSession() {
  const session = parse(localStorage.getItem(SESSION)) || parse(sessionStorage.getItem(SESSION))
  if (!session || !session.token || !session.user) return null
  const isMock = session.token === MOCK_TOKEN
  if (API_MODE && isMock) {
    clearSession()
    return null
  }
  if (!API_MODE && !isMock) return null
  return session
}

export const getToken = () => getSession()?.token

export function storeSession(session, remember) {
  clearSession()
  ;(remember ? localStorage : sessionStorage).setItem(SESSION, JSON.stringify(session))
  return session
}

// Replaces the saved user, keeping the token and the place (local / session storage) it was saved in.
export function updateStoredUser(user) {
  const session = getSession()
  if (!session) return
  const store = localStorage.getItem(SESSION) ? localStorage : sessionStorage
  store.setItem(SESSION, JSON.stringify({ ...session, user }))
}

// ---- Profile extras that the backend cannot store (college, location) ----
// The backend only stores a name and a contact number. College and location are kept on THIS DEVICE
// only, per user id, so what the student typed is not thrown away. They are display-only: they are not
// sent to the server and they are not shared with other devices or other people.
export function getLocalProfile(userId) {
  const all = parse(localStorage.getItem(LOCAL_PROFILE))
  const mine = all && typeof all === 'object' ? all[userId] : null
  return mine && typeof mine === 'object' ? mine : {}
}

export function saveLocalProfile(userId, patch) {
  try {
    const all = parse(localStorage.getItem(LOCAL_PROFILE)) || {}
    all[userId] = { ...(all[userId] || {}), ...patch }
    localStorage.setItem(LOCAL_PROFILE, JSON.stringify(all))
  } catch {
    // Storage full or blocked: the extras are only a convenience, so do not fail the whole action.
  }
}
