import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from './Modal'
import Button from './Button'
import ImageWithFallback from './ImageWithFallback'
import { useToast } from './Toast'
import { useAuth } from '../context/AuthContext'
import { getMyListings, submitRequest } from '../services/api'
import { API_MODE } from '../services/config'

// The student picks one of THEIR OWN active pieces to offer in exchange.
export default function ExchangeOfferModal({ listing, onClose, onSent }) {
  const { user } = useAuth()
  const toast = useToast()
  const [options, setOptions] = useState(null)
  const [picked, setPicked] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    getMyListings(user.id)
      .then((l) => setOptions(l.filter((x) => x.listingType !== 'donate' && x.status === 'active' && x.id !== listing.id)))
      .catch((err) => { setOptions([]); setError(err.message) })
  }, [user.id, listing.id])

  const send = async (e) => {
    e.preventDefault()
    if (sending) return // one click = one request (the button is disabled too)
    if (!picked) return setError('Choose one of your pieces to offer.')
    setSending(true)
    try {
      // the 5th argument (the picked piece itself) is what the real backend needs: it takes a title + description, not an id
      await submitRequest(listing.id, message, user, picked, options.find((o) => o.id === picked))
      toast('Exchange request sent. You will see the owner’s reply under My Requests.')
      onSent?.(); onClose()
    } catch (err) {
      setError(err.message); setSending(false)
      if (err.code === 'DUPLICATE_REQUEST') onSent?.() // already sent earlier: the page should show "Offer sent"
    }
  }

  return (
    <Modal title="Offer an exchange" onClose={onClose}>
      <p className="text-sm text-charcoal/70 mb-4">You want <b>{listing.name}</b>. {listing.seller.name} is looking for: {listing.lookingFor || 'open to offers'}.</p>
      {options === null ? <p className="text-sm">Loading your pieces…</p> : options.length === 0 ? (
        <div className="bg-blush/50 p-4 text-sm">
          {error ? `Could not load your pieces: ${error}` : 'You have no active pieces to offer yet.'}
          <Link to="/sell?type=exchange" onClick={onClose} className="block mt-2 text-plum underline">List a piece to swap</Link>
        </div>
      ) : (
        <form onSubmit={send}>
          <p className="text-sm font-medium mb-2">Your offer</p>
          <ul className="max-h-52 overflow-y-auto flex flex-col gap-2">
            {options.map((o) => (
              <li key={o.id}>
                <button type="button" aria-pressed={picked === o.id} onClick={() => { setPicked(o.id); setError('') }}
                  className={`w-full flex items-center gap-3 p-2 border text-left ${picked === o.id ? 'border-plum bg-blush/50' : 'border-plum/20'}`}>
                  <ImageWithFallback src={o.images[0]} alt="" className="w-12 h-14 shrink-0" />
                  <span className="text-sm"><b className="block">{o.name}</b>Size {o.size} · {o.condition}</span>
                </button>
              </li>
            ))}
          </ul>
          <label htmlFor="offer-msg" className="text-sm font-medium block mt-4">Message (optional)</label>
          <textarea id="offer-msg" rows="3" maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} className="w-full mt-2 p-3 bg-cream border border-plum/30 focus:outline-none focus:border-plum" />
          {error && <p role="alert" className="text-xs text-plum font-medium mt-2">{error}</p>}
          {API_MODE && <p className="text-xs text-charcoal/60 mt-2">Your offer is sent as a short description of this piece. The piece itself stays listed until you remove it yourself.</p>}
          <Button type="submit" disabled={sending} className="w-full mt-4">{sending ? 'Sending…' : 'Offer Exchange'}</Button>
        </form>
      )}
    </Modal>
  )
}
