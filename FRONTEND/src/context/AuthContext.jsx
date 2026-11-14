import { createContext, useContext, useState } from 'react'
import { getSession, login, register, logout, updateProfile } from '../services/auth'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getSession()?.user || null)
  const signIn = async (email, password, remember) => { const s = await login(email, password, remember); setUser(s.user); return s.user }
  const signUp = async (data) => { await register(data); return signIn(data.email, data.password, true) }
  const signOut = () => { logout(); setUser(null) }
  const saveProfile = async (changes) => { const u = await updateProfile(user.id, changes); setUser(u); return u }
  return <AuthContext.Provider value={{ user, signIn, signUp, signOut, saveProfile }}>{children}</AuthContext.Provider>
}
