import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Heart, Menu, X } from 'lucide-react'
import Button from './Button'
import { useAuth } from '../context/AuthContext'
import { useWishlist } from '../context/WishlistContext'

const links = [['/', 'Home'], ['/explore', 'Explore'], ['/sell', 'Sell'], ['/exchange', 'Exchange'], ['/donate', 'Donate'], ['/about', 'About us']]
const linkClass = ({ isActive }) =>
  `text-sm pb-1 border-b-2 transition-colors ${isActive ? 'border-plum text-plum' : 'border-transparent text-charcoal hover:text-plum'}`

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const { user, signOut } = useAuth()
  const { ids } = useWishlist()
  const navigate = useNavigate()
  const close = () => setOpen(false)
  const logOut = () => { signOut(); close(); navigate('/') }

  return (
    <header className="sticky top-0 z-40 bg-cream/95 backdrop-blur border-b border-plum/10">
      <nav className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link to="/" className="font-display text-3xl text-plum">Re<em>Wear</em><span className="text-rose">.</span></Link>

        <div className="hidden lg:flex items-center gap-8">
          {links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className={linkClass}>{label}</NavLink>)}
          <Link to="/dashboard?tab=wishlist" aria-label={`Wishlist, ${ids.length} saved`} className="relative text-plum">
            <Heart size={20} />
            {ids.length > 0 && <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-plum text-cream text-[10px] flex items-center justify-center">{ids.length}</span>}
          </Link>
          {user ? (
            <>
              {user.role === 'admin' && <NavLink to="/admin" className={linkClass}>Admin</NavLink>}
              <Link to="/dashboard" className="text-sm hover:text-plum">Hi, {user.name.split(' ')[0]}</Link>
              <Button variant="secondary" onClick={logOut}>Log out</Button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm hover:text-plum">Log in</Link>
              <Link to="/signup"><Button>Join ReWear</Button></Link>
            </>
          )}
        </div>

        <button className="lg:hidden text-plum" onClick={() => setOpen(!open)} aria-label="Toggle menu" aria-expanded={open}>{open ? <X /> : <Menu />}</button>
      </nav>

      {open && (
        <div className="lg:hidden border-t border-plum/10 px-6 py-4 flex flex-col gap-4 bg-cream">
          {links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} onClick={close} className="text-charcoal py-1">{label}</NavLink>)}
          <Link to="/dashboard?tab=wishlist" onClick={close} className="py-1">Wishlist ({ids.length})</Link>
          {user ? (
            <div className="flex gap-3 pt-2">
              {user.role === 'admin' && <Link to="/admin" onClick={close} className="flex-1"><Button variant="secondary" className="w-full">Admin</Button></Link>}
              <Link to="/dashboard" onClick={close} className="flex-1"><Button className="w-full">My account</Button></Link>
              <Button variant="secondary" className="flex-1" onClick={logOut}>Log out</Button>
            </div>
          ) : (
            <div className="flex gap-3 pt-2">
              <Link to="/login" onClick={close} className="flex-1"><Button variant="secondary" className="w-full">Log in</Button></Link>
              <Link to="/signup" onClick={close} className="flex-1"><Button className="w-full">Join ReWear</Button></Link>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
