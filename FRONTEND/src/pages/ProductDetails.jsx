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
import { getListings, getListingById, getRequests, submitRequest } from '../services/api'

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
  const [item, setItem] = useState(undefined) // undefined = loading, null = not found / failed
  const [loadError, setLoadError] = useState(null)
  const [similar, setSimilar] = useState([])
  const [active, setActive] = useState(0)
  // Mock ids are numbers, real (backend) ids are strings. Use whichever this one is.
  const idKey = /^\d+$/.test(id) ? Number(id) : id
  const saved = has(idKey)
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [contact, setContact] = useState(null) // only set if the backend shares it after acceptance
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    setItem(undefined); setLoadError(null); setActive(0); setSent(false); setContact(null); window.scrollTo(0, 0)
    getListingById(id)
      .then((i) => {
        if (cancelled) return
        setItem(i)
        if (i) {
          getListings()
            .then((all) => { if (!cancelled) setSimilar(all.filter((x) => x.category === i.category && x.id !== i.id).slice(0, 4)) })
            .catch(() => {})
        }
      })
      .catch((err) => { if (!cancelled) { setLoadError(err); setItem(null) } })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (!user) return
    getRequests(user.id)
      .then(({ sent }) => {
        const forThis = sent.filter((r) => String(r.listingId ?? r.listing?.id) === String(id))
        setSent(forThis.some((r) => ['pending', 'accepted'].includes(r.status)))
        // Contact details are shown only if the backend actually provided them.
        const shared = forThis.find((r) => ['accepted', 'completed'].includes(r.status) && r.ownerContact)
        setContact(shared ? shared.ownerContact : null)
      })
      .catch(() => {})
  }, [id, user])

  if (item === undefined) return <div className="max-w-7xl mx-auto px-6 py-24"><div className="h-96 bg-blush/60 animate-pulse" /></div>
  if (item === null && loadError?.status === 401)
    return <EmptyState title="Log in to view this listing" text="Listing details are available to logged-in members." action={<Link to="/login" state={{ from: location.pathname }}><Button>Log in</Button></Link>} />
  if (item === null) return <EmptyState title="Listing not found" text={loadError ? loadError.message : 'It may have been removed.'} action={<Link to="/explore"><Button>Back to Explore</Button></Link>} />

  const a = ACTIONS[item.listingType] || ACTIONS.sell
  const title = item.name ?? item.title
  const images = Array.isArray(item.images) ? item.images : []
  const sellerName = item.seller?.name || 'Seller'
  const mine = user && item.ownerId === user.id
  const send = async (e) => {
    e.preventDefault(); setSending(true)
    try { await submitRequest(item.id, message, user) } catch (err) { setSending(false); return toast(err.message, 'error') }
    setSending(false); setOpen(false); setSent(true); setMessage('')
    toast(`${a.sent}. You'll see the owner's reply under My Requests.`)
  }
  const details = [['Size', item.size], ['Category', item.category], ['Condition', item.condition]]

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <nav className="text-sm text-charcoal/60 mb-8"><Link to="/explore" className="hover:text-plum">Explore</Link> / {item.category} / {title}</nav>
      <div className="grid md:grid-cols-2 gap-12">
        <div>
          <ImageWithFallback src={images[active]} alt={title} className="w-full aspect-[4/5]" />
          {images.length > 1 && (
            <div className="flex gap-3 mt-3">
              {images.map((src, i) => (
                <button key={src} onClick={() => setActive(i)} aria-label={`View photo ${i + 1}`} className={`w-20 aspect-square border-2 ${i === active ? 'border-plum' : 'border-transparent'}`}>
                  <ImageWithFallback src={src} alt="" className="w-full h-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <span className="inline-block bg-blush text-plum text-xs tracking-wider px-3 py-1 mb-4">{{ sell: 'FOR SALE', exchange: 'FOR EXCHANGE', donate: 'FREE DONATION' }[item.listingType]}</span>
          <h1 className="text-4xl md:text-5xl">{title}</h1>
          <p className="text-2xl mt-3 font-medium">
            {item.listingType === 'sell' && item.price != null && (
              <>₹{Number(item.price).toLocaleString('en-IN')}{item.originalPrice ? <s className="text-base text-charcoal/40 font-normal ml-2">₹{Number(item.originalPrice).toLocaleString('en-IN')}</s> : null}</>
            )}
            {item.listingType === 'exchange' && <span className="text-rose text-xl">{item.lookingFor ? `Looking for: ${item.lookingFor}` : 'Open to exchange offers'}</span>}
            {item.listingType === 'donate' && <span className="text-rose text-xl">Free</span>}
          </p>
          <dl className="grid grid-cols-3 gap-4 mt-8 border-y border-plum/15 py-5">
            {details.map(([k, v]) => <div key={k}><dt className="text-xs tracking-wider text-charcoal/60 uppercase">{k}</dt><dd className="mt-1">{v}</dd></div>)}
          </dl>
          <p className="mt-6 text-charcoal/80 leading-relaxed">{item.description}</p>

          <div className="mt-8 flex gap-3">
            <Button className="flex-1" disabled={sent || mine} onClick={() => (user ? setOpen(true) : navigate('/login', { state: { from: location.pathname } }))}>{mine ? 'This is your listing' : sent ? 'Request pending' : a.button}</Button>
            <button onClick={() => toggle(idKey)} aria-pressed={saved} className="border border-plum text-plum px-4 flex items-center gap-2 text-sm">
              <Heart size={16} fill={saved ? '#C58B91' : 'none'} />{saved ? 'Saved' : 'Save'}
            </button>
          </div>
          <p className="flex items-start gap-2 text-xs text-charcoal/60 mt-3"><Lock size={14} className="mt-0.5 shrink-0" />No payment is taken on ReWear. The owner's contact details are shared only if they accept your request.</p>

          <div className="mt-8 bg-blush/50 p-5 flex items-center gap-4">
            <span className="w-12 h-12 rounded-full bg-plum text-cream flex items-center justify-center font-display text-xl">{sellerName[0]}</span>
            <div>
              <p className="font-medium">{sellerName}</p>
              {item.seller?.college && <p className="text-sm text-charcoal/70">{item.seller.college}</p>}
              {contact && <p className="text-sm text-plum mt-1">Contact: {contact}</p>}
            </div>
          </div>
        </div>
      </div>

      {similar.length > 0 && (
        <section className="mt-24">
          <h2 className="text-3xl md:text-4xl mb-8">You may also like</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-10">{similar.map((i) => <ProductCard key={i.id} item={{ ...i, image: i.images?.[0] }} />)}</div>
        </section>
      )}

      {open && item.listingType === 'exchange' && <ExchangeOfferModal listing={item} onClose={() => setOpen(false)} onSent={() => setSent(true)} />}
      {open && item.listingType !== 'exchange' && (
        <Modal title={a.title} onClose={() => setOpen(false)}>
          <form onSubmit={send}>
            <p className="text-sm text-charcoal/70 mb-4">{title} · {sellerName} will see your request and can accept or decline it.</p>
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