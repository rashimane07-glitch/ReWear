import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Search } from 'lucide-react'
import ProductCard from '../components/ProductCard'
import ExchangeOfferModal from '../components/ExchangeOfferModal'
import RequestRow from '../components/RequestRow'
import EmptyState from '../components/EmptyState'
import ImageWithFallback from '../components/ImageWithFallback'
import Button from '../components/Button'
import { useAuth } from '../context/AuthContext'
import { getListings, getRequests } from '../services/api'
import { FILTER_OPTIONS } from '../data/listings'

const steps = ['Pick a piece you love', 'Offer one of yours', 'The owner accepts or rejects', 'Share contacts and arrange the swap']

export default function Exchange() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [all, setAll] = useState(null)
  const [sent, setSent] = useState([])
  const [waiting, setWaiting] = useState(0)
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('All')
  const [size, setSize] = useState('')
  const [offerFor, setOfferFor] = useState(null)

  const load = () => {
    getListings().then(setAll)
    if (user) getRequests(user.id).then(({ sent, incoming }) => {
      setSent(sent.filter((r) => r.type === 'exchange'))
      setWaiting(incoming.filter((r) => r.type === 'exchange' && r.status === 'pending').length)
    })
  }
  useEffect(() => { load() }, [user])

  const items = useMemo(() => (all || []).filter((l) => l.listingType === 'exchange' && l.status === 'active'), [all])
  const cats = ['All', ...new Set(items.map((l) => l.category))]
  const shown = items.filter((l) => {
    const q = query.trim().toLowerCase()
    return (cat === 'All' || l.category === cat) && (!size || l.size === size) &&
      (!q || `${l.name} ${l.category} ${l.lookingFor || ''}`.toLowerCase().includes(q))
  })
  const requested = (id) => sent.some((r) => r.listingId === id && ['pending', 'accepted'].includes(r.status))

  const offer = (l) => (user ? setOfferFor(l) : navigate('/login', { state: { from: '/exchange' } }))

  return (
    <>
      <section className="max-w-7xl mx-auto px-6 py-16 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <p className="text-xs tracking-[0.2em] text-rose mb-3">TRADE STYLE, NOT VALUE</p>
          <h1 className="text-5xl md:text-7xl leading-[1.05]">Swap your way to something <em className="text-rose">new.</em></h1>
          <p className="mt-6 max-w-md text-charcoal/75">See something you love? Offer a piece from your closet. No money, just a good exchange.</p>
          <Link to="/sell?type=exchange" className="inline-block mt-8"><Button>Add an item to swap</Button></Link>
        </div>
        <div className="relative max-w-md w-full lg:ml-auto">
          <div className="absolute top-8 -right-6 w-full h-full bg-blush" aria-hidden />
          <ImageWithFallback src="/images/p7.jpg" alt="Clothes on a rail" className="relative w-full aspect-[4/5]" />
        </div>
      </section>

      <div className="bg-plum text-cream">
        <ol className="max-w-7xl mx-auto px-6 py-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((s, i) => <li key={s} className="font-display text-lg"><em className="text-blush mr-2">0{i + 1}</em>{s}</li>)}
        </ol>
      </div>

      <section className="max-w-7xl mx-auto px-6 pt-16">
        <div className="bg-blush/40 p-6 mb-14">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-2xl flex items-center gap-2"><ArrowLeftRight size={20} />Your exchange requests</h2>
            {user && waiting > 0 && <Link to="/dashboard?tab=requests" className="text-sm text-plum underline">{waiting} offer{waiting > 1 ? 's' : ''} waiting on your items — review</Link>}
          </div>
          {!user ? <p className="text-sm">Log in to offer a swap and track your requests. <Link to="/login" state={{ from: '/exchange' }} className="text-plum underline">Log in</Link></p>
            : sent.length === 0 ? <p className="text-sm text-charcoal/70">No exchange requests yet. Pick something below and offer a piece from your closet.</p>
            : <ul className="flex flex-col gap-3">{sent.map((r) => <RequestRow key={r.id} r={r} incoming={false} />)}</ul>}
        </div>

        <p className="text-xs tracking-[0.2em] text-rose mb-3">OPEN TO OFFERS</p>
        <h2 className="text-4xl md:text-5xl mb-8">Available for exchange</h2>
        <div className="flex flex-col md:flex-row gap-4 md:items-end border-b border-plum/40 pb-3 mb-6">
          <label className="flex items-center gap-3 flex-1"><Search size={18} className="text-plum" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by item or what they’re looking for…" aria-label="Search exchange listings" className="bg-transparent flex-1 focus:outline-none placeholder:text-charcoal/50" />
          </label>
          <select value={size} onChange={(e) => setSize(e.target.value)} aria-label="Filter by size" className="bg-transparent text-sm focus:outline-none">
            <option value="">All sizes</option>{FILTER_OPTIONS.sizes.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 mb-10">
          {cats.map((c) => <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className={`px-4 py-1.5 text-sm border border-plum ${cat === c ? 'bg-plum text-cream' : 'text-plum'}`}>{c}</button>)}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
          {!all && Array.from({ length: 3 }).map((_, i) => <div key={i} className="aspect-[4/5] bg-blush/60 animate-pulse" />)}
          {all && shown.map((l) => {
            const mine = user && l.ownerId === user.id
            const done = requested(l.id)
            return (
              <div key={l.id}>
                <ProductCard item={{ ...l, image: l.images[0] }} />
                <div className="border-t border-plum/15 mt-4 pt-3">
                  <p className="text-[11px] tracking-wider text-charcoal/60">LOOKING FOR</p>
                  <p className="text-sm font-medium mb-3">{l.lookingFor || 'Open to offers'}</p>
                  <Button variant="secondary" className="w-full" disabled={mine || done} onClick={() => offer(l)}>
                    {mine ? 'Your listing' : done ? 'Offer sent' : <>Offer exchange <ArrowLeftRight size={16} /></>}
                  </Button>
                </div>
              </div>
            )
          })}
          {all && !shown.length && <EmptyState title={items.length ? 'No swaps match' : 'Nothing to swap yet'} text={items.length ? 'Try a different search or category.' : 'Be the first to list a piece for exchange.'}
            action={<Link to="/sell?type=exchange"><Button variant="secondary">Add an item to swap</Button></Link>} />}
        </div>
      </section>

      {offerFor && <ExchangeOfferModal listing={offerFor} onClose={() => setOfferFor(null)} onSent={load} />}
    </>
  )
}
