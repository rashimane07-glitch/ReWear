// MOCK AUTH (demo only). With VITE_API_URL set, the same functions call your Express API instead
// (bcrypt hashing + JWT issuing belong on the server). Mock users live in this browser's localStorage.
const API_URL = import.meta.env.VITE_API_URL
const USERS = 'rewear_users'
const SESSION = 'rewear_session'

const sha = async (s) =>
  globalThis.crypto?.subtle
    ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('')
    : btoa(s)
const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms))
const loadUsers = () => { try { return JSON.parse(localStorage.getItem(USERS)) || [] } catch { return [] } }
const saveUsers = (u) => localStorage.setItem(USERS, JSON.stringify(u))
const publicUser = ({ passwordHash, ...u }) => u
const post = async (path, body) => {
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Something went wrong.')
  return data
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

export const getSession = () => { try { return JSON.parse(localStorage.getItem(SESSION) || sessionStorage.getItem(SESSION)) } catch { return null } }
export const getToken = () => getSession()?.token
const storeSession = (session, remember) => {
  localStorage.removeItem(SESSION); sessionStorage.removeItem(SESSION)
  ;(remember ? localStorage : sessionStorage).setItem(SESSION, JSON.stringify(session))
  return session
}

export async function login(email, password, remember) {
  if (API_URL) return storeSession(await post('/auth/login', { email, password }), remember)
  await wait()
  const u = (await users()).find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
  if (!u || u.passwordHash !== (await sha(password))) throw new Error('Incorrect email or password.')
  return storeSession({ token: 'mock-token', user: publicUser(u) }, remember)
}

export async function register({ name, email, password, college }) {
  if (API_URL) return post('/auth/register', { name, email, password, college })
  await wait()
  const list = await users()
  if (list.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) throw new Error('An account with this email already exists.')
  list.push({ id: `u${Date.now()}`, name: name.trim(), email: email.trim(), college: college.trim(), location: '', passwordHash: await sha(password) })
  saveUsers(list)
}

export const logout = () => { localStorage.removeItem(SESSION); sessionStorage.removeItem(SESSION) }

export async function updateProfile(id, changes) {
  if (API_URL) return (await fetch(`${API_URL}/users/me`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, body: JSON.stringify(changes) })).json()
  await wait(200)
  const list = await users()
  const u = list.find((x) => x.id === id)
  Object.assign(u, changes); saveUsers(list)
  const store = localStorage.getItem(SESSION) ? localStorage : sessionStorage
  store.setItem(SESSION, JSON.stringify({ ...getSession(), user: publicUser(u) }))
  return publicUser(u)
}
