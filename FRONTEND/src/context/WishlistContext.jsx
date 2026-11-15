import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

const WishlistContext = createContext({ ids: [], has: () => false, toggle: () => {} })
export const useWishlist = () => useContext(WishlistContext)

// Saved item ids are kept per user in this browser's localStorage (mock). The real version belongs in the database.
export function WishlistProvider({ children }) {
  const { user } = useAuth()
  const key = `rewear_wishlist_${user?.id || 'guest'}`
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) || [] } catch { return [] } }
  const [ids, setIds] = useState(read)
  useEffect(() => setIds(read()), [key])
  const toggle = (id) =>
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
      return next
    })
  return <WishlistContext.Provider value={{ ids, has: (id) => ids.includes(id), toggle }}>{children}</WishlistContext.Provider>
}
