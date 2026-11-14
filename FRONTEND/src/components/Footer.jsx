import { Link } from 'react-router-dom'
import { Instagram, Twitter, ArrowRight } from 'lucide-react'
import { useToast } from './Toast'

const col = 'text-sm text-cream/70 hover:text-cream'
export default function Footer() {
  const toast = useToast()
  return (
    <footer className="bg-charcoal text-cream mt-24">
      <div className="max-w-7xl mx-auto px-6 py-16 grid gap-10 md:grid-cols-[2fr_1fr_1fr_2fr]">
        <div>
          <p className="font-display text-2xl">Re<em>Wear</em>.</p>
          <p className="text-sm text-cream/70 mt-3 max-w-xs">Your closet has more stories to tell. Pass them on.</p>
          <div className="flex gap-3 mt-6">
            {/* Replace with ReWear's real profile links before launch */}
            <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-10 h-10 rounded-full border border-cream/30 flex items-center justify-center hover:bg-cream hover:text-plum"><Instagram size={16} /></a>
            <a href="https://x.com/" target="_blank" rel="noopener noreferrer" aria-label="Twitter / X" className="w-10 h-10 rounded-full border border-cream/30 flex items-center justify-center hover:bg-cream hover:text-plum"><Twitter size={16} /></a>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-xs tracking-widest mb-1">MARKETPLACE</p>
          <Link className={col} to="/explore">Explore</Link><Link className={col} to="/sell">Sell an item</Link>
          <Link className={col} to="/exchange">Exchange</Link><Link className={col} to="/donate">Donate</Link>
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-xs tracking-widest mb-1">COMPANY</p>
          <Link className={col} to="/about">About us</Link>
          <a className={col} href="mailto:hello@rewear.example">Contact</a>
        </div>
        <div>
          <p className="text-xs tracking-widest mb-4">STAY IN THE LOOP</p>
          <p className="text-sm text-cream/70 mb-4">Fresh drops, closet edits and good news.</p>
          {/* Newsletter is not wired to a backend yet */}
          <form onSubmit={(e) => { e.preventDefault(); toast('Newsletter sign-up is not available yet.', 'error') }} className="flex border-b border-cream/40">
            <input type="email" placeholder="Email address" aria-label="Email address" className="bg-transparent flex-1 py-2 text-sm placeholder:text-cream/50 focus:outline-none" />
            <button aria-label="Subscribe (coming soon)" title="Coming soon"><ArrowRight size={18} /></button>
          </form>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6 border-t border-cream/15 text-xs text-cream/60">
        © {new Date().getFullYear()} ReWear. Made for campus communities.
      </div>
    </footer>
  )
}
