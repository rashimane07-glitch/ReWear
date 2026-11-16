import Button from './Button'
import StatusBadge from './StatusBadge'
import ImageWithFallback from './ImageWithFallback'

const typeName = { sell: 'Purchase', exchange: 'Exchange', donate: 'Donation' }
const timeAgo = (ts) => { if (!ts) return ''; const h = Math.round((Date.now() - ts) / 36e5); return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago` }

// Backend request statuses: pending, accepted, declined, cancelled, completed.
export default function RequestRow({ r, incoming, onUpdate }) {
  const listing = r.listing
  const title = listing?.name ?? listing?.title ?? 'Listing removed'
  const image = listing?.image ?? listing?.images?.[0]
  const person = r.from ?? r.requester ?? {}
  const kind = typeName[r.type ?? listing?.listingType]
  const offeredTitle = r.offered?.name ?? r.offered?.title ?? r.offeredItem?.title
  const shared = r.status === 'accepted' || r.status === 'completed'

  return (
    <li className="flex gap-4 border border-plum/15 p-3">
      <ImageWithFallback src={image} alt={title} className="w-16 h-20 sm:w-20 sm:h-24 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2"><p className="font-display text-lg text-plum">{title}</p><StatusBadge status={r.status} /></div>
        <p className="text-sm text-charcoal/70">
          {kind ? `${kind} request` : 'Request'} · {incoming ? `from ${person.name || 'a member'}${person.college ? `, ${person.college}` : ''}` : `to ${listing?.seller?.name || 'the owner'}`} {r.createdAt ? `· ${timeAgo(r.createdAt)}` : ''}
        </p>
        {offeredTitle && <p className="text-sm mt-1">Offering: <b>{offeredTitle}</b>{r.offered?.size ? ` (size ${r.offered.size})` : ''}</p>}
        {r.message && <p className="text-sm mt-1 italic">“{r.message}”</p>}
        {incoming && shared && person.email && <p className="text-sm mt-2">Requester contact: <b>{person.email}</b></p>}
        {!incoming && r.ownerContact && <p className="text-sm mt-2">Owner contact: <b>{r.ownerContact}</b></p>}
        {incoming && r.status === 'pending' && (
          <div className="flex gap-2 mt-3">
            <Button className="py-2" onClick={() => onUpdate(r, 'accepted')}>Accept</Button>
            <Button variant="secondary" className="py-2" onClick={() => onUpdate(r, 'declined')}>Decline</Button>
          </div>
        )}
        {!incoming && r.status === 'pending' && (
          <Button variant="secondary" className="py-2 mt-3" onClick={() => onUpdate(r, 'cancelled')}>Cancel request</Button>
        )}
        {incoming && r.status === 'accepted' && <Button variant="secondary" className="py-2 mt-3" onClick={() => onUpdate(r, 'completed')}>Mark as completed</Button>}
      </div>
    </li>
  )
}