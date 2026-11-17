import { createContext, useContext, useEffect, useState } from 'react'
import { API_MODE } from '../services/config'
import { getSession, getToken, login, register, logout, updateProfile, refreshUser } from '../services/auth'
import { SESSION_EXPIRED_EVENT } from '../services/session'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  // The saved session is trusted at first, so a refresh never flashes the logged-out page.
  const [user, setUser] = useState(() => getSession()?.user || null)

  // REAL mode: check the saved token with the server once when the app opens (GET /auth/me) and refresh the
  // user. A rejected token (expired, account gone) is handled below. If the server just cannot be reached,
  // the saved session stays: being offline is not a reason to log somebody out.
  useEffect(() => {
    if (!API_MODE || !getToken()) return undefined
    let active = true
    refreshUser().then((fresh) => { if (active && fresh) setUser(fresh) }).catch(() => {})
    return () => { active = false }
  }, [])

  // The server rejected our token (http.js already deleted the session): log out here too, which sends
  // protected pages back to /login.
  useEffect(() => {
    const expired = () => setUser(null)
    window.addEventListener(SESSION_EXPIRED_EVENT, expired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired)
  }, [])

  const signIn = async (email, password, remember) => { const s = await login(email, password, remember); setUser(s.user); return s.user }
  const signUp = async (data) => {
    const session = await register(data) // REAL mode: registering also signs the person in
    if (session) { setUser(session.user); return session.user }
    return signIn(data.email, data.password, true) // MOCK mode: register only creates the account
  }
  const signOut = () => { logout(); setUser(null) }
  const saveProfile = async (changes) => { const u = await updateProfile(user.id, changes); setUser(u); return u }
  return <AuthContext.Provider value={{ user, signIn, signUp, signOut, saveProfile }}>{children}</AuthContext.Provider>
}
