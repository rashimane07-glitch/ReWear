// AUTH SERVICE. Two modes, chosen by VITE_API_URL (see config.js):
//   MOCK mode (empty): demo accounts live in this browser's localStorage and the token is the fake
//     "mock-token". Demo only.
//   REAL mode (set): the Express API hashes passwords and issues the JWT; this file only stores it.
//
// REAL mode details
//  - login / register answer { token, user } (inside the backend's "data"); the session is { token, user }.
//  - The backend knows only name, email, password and a phone "contact". College and location are kept
//    on THIS DEVICE only (session.js getLocalProfile / saveLocalProfile) and merged into the user, so the
//    profile page keeps working, but they are NOT saved to the account (see the profile page note).
//  - There is no "logout" endpoint (the JWT is stateless); logging out just forgets the token.
import { API_MODE } from './config'
import { get, post, patch } from './http'
import {
  getSession, getToken, storeSession, clearSession, updateStoredUser, getLocalProfile, saveLocalProfile, MOCK_TOKEN,
} from './session'

export { getSession, getToken } // other files import these from here

const USERS = 'rewear_users'

const sha = async (s) =>
  globalThis.crypto?.subtle
    ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')
    : btoa(s)
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms))
const loadUsers = () => { try { return JSON.parse(localStorage.getItem(USERS)) || [] } catch { return [] } }
const saveUsers = (u) => localStorage.setItem(USERS, JSON.stringify(u))
const publicUser = ({ passwordHash, ...u }) => u

// REAL mode: the backend's user plus this device's college / location (always present, '' when unknown).
// This device's saved values win over any older college / location already inside `user`.
const withLocalProfile = (user) => {
  const local = getLocalProfile(user.id)
  return { ...user, college: local.college ?? user.college ?? '', location: local.location ?? user.location ?? '' }
}

// Demo account so the dashboard has data to show: demo@rewear.test / demo1234
async function users() {
  const list = loadUsers()
  if (!list.some((u) => u.id === 'demo')) {
    list.push({ id: 'demo', name: 'Ananya Sharma', email: 'demo@rewear.test', college: 'Delhi University', location: 'North Campus, Delhi', passwordHash: await sha('demo1234') })
    saveUsers(list)
  }
  return list
}

// Logs in and saves the session. `remember` ON = stays after the browser closes, OFF = until the tab closes.
export async function login(email, password, remember) {
  if (API_MODE) {
    const { token, user } = await post('/auth/login', { email, password }, { auth: false })
    return storeSession({ token, user: withLocalProfile(user) }, remember)
  }
  await wait()
  const u = (await users()).find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
  if (!u || u.passwordHash !== (await sha(password))) throw new Error('Incorrect email or password.')
  return storeSession({ token: MOCK_TOKEN, user: publicUser(u) }, remember)
}

// REAL mode: creates the account AND signs the person in (the backend returns a token), and returns the
// new session. MOCK mode: only creates the account and returns nothing (the caller logs in afterwards).
export async function register({ name, email, password, college }) {
  if (API_MODE) {
    // Only what the backend accepts. The college is kept on this device only.
    const { token, user } = await post('/auth/register', { name, email, password }, { auth: false })
    if (college && college.trim()) saveLocalProfile(user.id, { college: college.trim() })
    return storeSession({ token, user: withLocalProfile(user) }, true)
  }
  await wait()
  const list = await users()
  if (list.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) throw new Error('An account with this email already exists.')
  list.push({ id: `u${Date.now()}`, name: name.trim(), email: email.trim(), college: college.trim(), location: '', passwordHash: await sha(password) })
  saveUsers(list)
  return undefined
}

export const logout = () => clearSession()

// REAL mode: asks the server who the saved token belongs to (GET /auth/me) and refreshes the saved user.
// Returns the user, or null when there is nothing to check (MOCK mode / no token). If the server says the
// token is no longer valid (401), http.js has already deleted the session and the error is thrown here.
export async function refreshUser() {
  if (!API_MODE || !getToken()) return null
  const { user } = await get('/auth/me')
  const merged = withLocalProfile(user)
  updateStoredUser(merged)
  return merged
}

// Saves profile changes and returns the updated user.
// REAL mode: PATCH /users/me with ONLY what the backend accepts (name, contact). The backend rejects any
// other field with 400, so college and location are never sent: they are saved on this device only.
export async function updateProfile(id, changes) {
  if (API_MODE) {
    const current = getSession()?.user || { id }
    const serverChanges = {}
    if (changes.name !== undefined && changes.name !== current.name) serverChanges.name = changes.name
    if (changes.contact !== undefined) serverChanges.contact = changes.contact // { type: 'phone', value } or null

    let user = current
    if (Object.keys(serverChanges).length > 0) user = (await patch('/users/me', serverChanges)).user

    const deviceOnly = {}
    ;['college', 'location'].forEach((key) => {
      if (changes[key] !== undefined) deviceOnly[key] = String(changes[key]).trim()
    })
    if (Object.keys(deviceOnly).length > 0) saveLocalProfile(id, deviceOnly)

    const merged = withLocalProfile(user)
    updateStoredUser(merged)
    return merged
  }
  await wait(200)
  const list = await users()
  const u = list.find((x) => x.id === id)
  Object.assign(u, changes); saveUsers(list)
  updateStoredUser(publicUser(u))
  return publicUser(u)
}
