import Button from './Button'
import StatusBadge from './StatusBadge'
import ImageWithFallback from './ImageWithFallback'

const typeName = { sell: 'Purchase', exchange: 'Exchange', donate: 'Donation' }
const timeAgo = (ts) => { const h = Math.round((Date.now() - ts) / 36e5); return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago` }

// incoming = a request I RECEIVED (I am the owner); otherwise one I SENT.
// onUpdate(r, 'accepted' | 'rejected' | 'completed' | 'cancelled') is optional: without it no buttons are shown.
// busy = this request is being updated right now (the buttons are disabled, so nothing is sent twice).
// CONTACT PRIVACY: this row only shows what the data contains. `r.ownerContact` is filled in by services/api.js, and only for an
// accepted request the person sent. `r.from.email` exists only in demo mode (the real backend never shares the requester's contact).
export default function RequestRow({ r, incoming, onUpdate, busy = false }) {
  const act = (status) => onUpdate && onUpdate(r, status)
  return (
    <li className="flex gap-4 border border-plum/15 p-3">
      <ImageWithFallback src={r.listing?.images[0]} alt={r.listing?.name || 'Listing removed'} className="w-16 h-20 sm:w-20 sm:h-24 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2"><p className="font-display text-lg text-plum">{r.listing?.name || 'Listing removed'}</p><StatusBadge status={r.status} /></div>
        <p className="text-sm text-charcoal/70">{typeName[r.type]} request · {incoming ? `from ${r.from.name}${r.from.college ? `, ${r.from.college}` : ''}` : `to ${r.listing?.seller.name}`} · {timeAgo(r.createdAt)}</p>
        {r.offered && <p className="text-sm mt-1">Offering: <b>{r.offered.name}</b>{r.offered.size ? ` (size ${r.offered.size})` : ''}</p>}
        {r.offered && !r.offered.size && r.offered.description && <p className="text-xs text-charcoal/60 mt-0.5">{r.offered.description}</p>}
        {r.message && <p className="text-sm mt-1 italic">“{r.message}”</p>}
        {incoming && (r.status === 'accepted' || r.status === 'completed') && r.from.email && <p className="text-sm mt-2">Requester contact: <b>{r.from.email}</b></p>}
        {incoming && r.status === 'accepted' && !r.from.email && <p className="text-sm mt-2 text-charcoal/70">{r.from.name} can now see your contact details and will get in touch.</p>}
        {!incoming && r.ownerContact && <p className="text-sm mt-2">Owner contact: <b>{r.ownerContact}</b></p>}
        {!incoming && r.status === 'accepted' && !r.ownerContact && <p className="text-sm mt-2 text-charcoal/60">The owner's contact details are not available for this request right now.</p>}
        {onUpdate && incoming && r.status === 'pending' && (
          <div className="flex gap-2 mt-3">
            <Button className="py-2" disabled={busy} onClick={() => act('accepted')}>{busy ? 'Please wait…' : 'Accept'}</Button>
            <Button variant="secondary" className="py-2" disabled={busy} onClick={() => act('rejected')}>Reject</Button>
          </div>
        )}
        {onUpdate && incoming && r.status === 'accepted' && (
          <div className="flex gap-2 mt-3">
            <Button variant="secondary" className="py-2" disabled={busy} onClick={() => act('completed')}>{busy ? 'Please wait…' : 'Mark as completed'}</Button>
            <Button variant="secondary" className="py-2" disabled={busy} onClick={() => act('cancelled')}>Call off</Button>
          </div>
        )}
        {onUpdate && !incoming && r.status === 'pending' && <Button variant="secondary" className="py-2 mt-3" disabled={busy} onClick={() => act('cancelled')}>{busy ? 'Please wait…' : 'Withdraw request'}</Button>}
        {onUpdate && !incoming && r.status === 'accepted' && <Button variant="secondary" className="py-2 mt-3" disabled={busy} onClick={() => act('cancelled')}>{busy ? 'Please wait…' : 'Cancel'}</Button>}
      </div>
    </li>
  )
}
