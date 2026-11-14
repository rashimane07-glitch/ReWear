import Button from './Button'
import StatusBadge from './StatusBadge'
import ImageWithFallback from './ImageWithFallback'

const typeName = { sell: 'Purchase', exchange: 'Exchange', donate: 'Donation' }
const timeAgo = (ts) => { const h = Math.round((Date.now() - ts) / 36e5); return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago` }

export default function RequestRow({ r, incoming, onUpdate }) {
  return (
    <li className="flex gap-4 border border-plum/15 p-3">
      <ImageWithFallback src={r.listing?.images[0]} alt={r.listing?.name || 'Listing removed'} className="w-16 h-20 sm:w-20 sm:h-24 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2"><p className="font-display text-lg text-plum">{r.listing?.name || 'Listing removed'}</p><StatusBadge status={r.status} /></div>
        <p className="text-sm text-charcoal/70">{typeName[r.type]} request · {incoming ? `from ${r.from.name}, ${r.from.college}` : `to ${r.listing?.seller.name}`} · {timeAgo(r.createdAt)}</p>
        {r.offered && <p className="text-sm mt-1">Offering: <b>{r.offered.name}</b> (size {r.offered.size})</p>}
        {r.message && <p className="text-sm mt-1 italic">“{r.message}”</p>}
        {incoming && (r.status === 'accepted' || r.status === 'completed') && <p className="text-sm mt-2">Requester contact: <b>{r.from.email}</b></p>}
        {!incoming && r.ownerContact && <p className="text-sm mt-2">Owner contact: <b>{r.ownerContact}</b></p>}
        {incoming && r.status === 'pending' && (
          <div className="flex gap-2 mt-3">
            <Button className="py-2" onClick={() => onUpdate(r, 'accepted')}>Accept</Button>
            <Button variant="secondary" className="py-2" onClick={() => onUpdate(r, 'rejected')}>Reject</Button>
          </div>
        )}
        {incoming && r.status === 'accepted' && <Button variant="secondary" className="py-2 mt-3" onClick={() => onUpdate(r, 'completed')}>Mark as completed</Button>}
      </div>
    </li>
  )
}

