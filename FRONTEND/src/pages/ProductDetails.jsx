import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useWishlist } from '../context/WishlistContext'
import { Heart, Lock } from 'lucide-react'
import Button from '../components/Button'
import Modal from '../components/Modal'
import ExchangeOfferModal from '../components/ExchangeOfferModal'
import ProductCard from '../components/ProductCard'
import ImageWithFallback from '../components/ImageWithFallback'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { getSimilarListings, getListingById, getRequests, submitRequest } from '../services/api'
import { API_MODE } from '../services/config'

// Wording for each listing type
const ACTIONS = {
  sell: { button: 'Send Purchase Request', title: 'Send a purchase request', sent: 'Purchase request sent' },
  exchange: { button: 'Offer Exchange', title: 'Offer an exchange', sent: 'Exchange request sent' },
  donate: { button: 'Request Donation', title: 'Request this donation', sent: 'Donation request sent' },
}

export default function ProductDetails() {
  const { id } = useParams()
  const toast = useToast()
  const { user } = useAuth()
  const { has, toggle } = useWishlist()
  const navigate = useNavigate()
  const location = useLocation()
  const [item, setItem] = useState(undefined) // undefined = loading, null = not found
  const [similar, setSimilar] = useState([])
  const [active, setActive] = useState(0)
  const wid = API_MODE ? id : Number(id) // wishlist key: real listing ids are text (uuid), mock ids are numbers
  const saved = has(wid)
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setItem(undefined); setActive(0); setSent(false); window.scrollTo(0, 0)
    getListingById(id).then((i) => {
      setItem(i)
      if (i) getSimilarListings(i).then(setSimilar).catch(() => setSimilar([]))
    }).catch((err) => {
      // REAL mode: the backend shows a single listing to logged-in people only, so a guest is sent to log in first.
      if (err.status === 401) return navigate('/login', { replace: true, state: { from: location.pathname } })
      setItem(null); toast(err.message, 'error')
    })
  }, [id])

  useEffect(() => {
    if (user) getRequests(user.id).then(({ sent }) => setSent(sent.some((r) => String(r.listingId) === String(id) && ['pending', 'accepted'].includes(r.status)))).catch(() => {})
  }, [id, user])

  if (item === undefined) return <div className="max-w-7xl mx-auto px-6 py-24"><div className="h-96 bg-blush/60 animate-pulse" /></div>
  if (item === null) return <EmptyState title="Listing not found" text="It may have been removed." action={<Link to="/explore"><Button>Back to Explore</Button></Link>} />

  const a = ACTIONS[item.listingType]
  const mine = user && item.ownerId === user.id
  const unavailable = API_MODE && item.status !== 'active' // reserved or completed: the backend refuses new requests
  const send = async (e) => {
    e.preventDefault()
    if (sending) return // one click = one request
    setSending(true)
    try { await submitRequest(item.id, message, user) } catch (err) {
      setSending(false)
      if (err.code === 'DUPLICATE_REQUEST') { setSent(true); setOpen(false) } // already sent earlier
      return toast(err.message, 'error')
    }
    setSending(false); setOpen(false); setSent(true); setMessage('')
    toast(`${a.sent}. You'll see the owner's reply under My Requests.`)
  }
  const details = [['Size', item.size], ['Category', item.category], ...(item.gender ? [['For', item.gender]] : []), ['Condition', item.condition], ...(item.colour ? [['Colour', item.colour]] : [])]

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <nav className="text-sm text-charcoal/60 mb-8"><Link to="/explore" className="hover:text-plum">Explore</Link> / {item.category} / {item.name}</nav>
      <div className="grid md:grid-cols-2 gap-12">
        <div>
          <ImageWithFallback src={item.images[active]} alt={item.name} className="w-full aspect-[4/5]" />
          {item.images.length > 1 && (
            <div className="flex gap-3 mt-3">
              {item.images.map((src, i) => (
                <button key={src} onClick={() => setActive(i)} aria-label={`View photo ${i + 1}`} className={`w-20 aspect-square border-2 ${i === active ? 'border-plum' : 'border-transparent'}`}>
                  <ImageWithFallback src={src} alt="" className="w-full h-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <span className="inline-block bg-blush text-plum text-xs tracking-wider px-3 py-1 mb-4">{{ sell: 'FOR SALE', exchange: 'FOR EXCHANGE', donate: 'FREE DONATION' }[item.listingType]}</span>
          <h1 className="text-4xl md:text-5xl">{item.name}</h1>
          <p className="text-2xl mt-3 font-medium">
            {item.listingType === 'sell' && <>₹{item.price.toLocaleString('en-IN')} {item.originalPrice && <s className="text-base text-charcoal/40 font-normal ml-2">₹{item.originalPrice.toLocaleString('en-IN')}</s>}</>}
            {item.listingType === 'exchange' && <span className="text-rose text-xl">Looking for: {item.lookingFor || 'Open to offers'}</span>}
            {item.listingType === 'donate' && <span className="text-rose text-xl">Free</span>}
          </p>
          <dl className="grid grid-cols-3 gap-4 mt-8 border-y border-plum/15 py-5">
            {details.map(([k, v]) => <div key={k}><dt className="text-xs tracking-wider text-charcoal/60 uppercase">{k}</dt><dd className="mt-1">{v}</dd></div>)}
          </dl>
          <p className="mt-6 text-charcoal/80 leading-relaxed whitespace-pre-line">{item.description}</p>
          {item.location && <p className="mt-3 text-sm text-charcoal/70">Pickup location: {item.location}</p>}

          <div className="mt-8 flex gap-3">
            <Button className="flex-1" disabled={sent || mine || unavailable} onClick={() => (user ? setOpen(true) : navigate('/login', { state: { from: location.pathname } }))}>{mine ? 'This is your listing' : unavailable ? 'No longer available' : sent ? 'Request pending' : a.button}</Button>
            <button onClick={() => toggle(wid)} aria-pressed={saved} className="border border-plum text-plum px-4 flex items-center gap-2 text-sm">
              <Heart size={16} fill={saved ? '#C58B91' : 'none'} />{saved ? 'Saved' : 'Save'}
            </button>
          </div>
          <p className="flex items-start gap-2 text-xs text-charcoal/60 mt-3"><Lock size={14} className="mt-0.5 shrink-0" />No payment is taken on ReWear. The owner's contact details are shared only if they accept your request.</p>

          <div className="mt-8 bg-blush/50 p-5 flex items-center gap-4">
            <span className="w-12 h-12 rounded-full bg-plum text-cream flex items-center justify-center font-display text-xl">{item.seller.name[0]}</span>
            <div><p className="font-medium">{item.seller.name}</p><p className="text-sm text-charcoal/70">{item.seller.college}</p></div>
          </div>
        </div>
      </div>

      {similar.length > 0 && (
        <section className="mt-24">
          <h2 className="text-3xl md:text-4xl mb-8">You may also like</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-10">{similar.map((i) => <ProductCard key={i.id} item={{ ...i, image: i.images[0] }} />)}</div>
        </section>
      )}

      {open && item.listingType === 'exchange' && <ExchangeOfferModal listing={item} onClose={() => setOpen(false)} onSent={() => setSent(true)} />}
      {open && item.listingType !== 'exchange' && (
        <Modal title={a.title} onClose={() => setOpen(false)}>
          <form onSubmit={send}>
            <p className="text-sm text-charcoal/70 mb-4">{item.name} · {item.seller.name} will see your request and can accept or reject it.</p>
            <label htmlFor="msg" className="text-sm font-medium">Message to the owner (optional)</label>
            <textarea id="msg" rows="4" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300}
              placeholder={item.listingType === 'exchange' ? 'Describe the piece you would swap…' : 'Say hello, ask about fit or pick-up…'}
              className="w-full mt-2 p-3 bg-cream border border-plum/30 focus:outline-none focus:border-plum" />
            <Button type="submit" disabled={sending} className="w-full mt-4">{sending ? 'Sending…' : a.button}</Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
