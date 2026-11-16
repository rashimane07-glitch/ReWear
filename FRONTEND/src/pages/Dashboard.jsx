import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LayoutGrid, Shirt, Inbox, Gift, Heart, User, LogOut } from 'lucide-react'
import Button from '../components/Button'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'
import RequestRow from '../components/RequestRow'
import EmptyState from '../components/EmptyState'
import ProductCard from '../components/ProductCard'
import FormField, { inputClass } from '../components/FormField'
import ImageWithFallback from '../components/ImageWithFallback'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useWishlist } from '../context/WishlistContext'
import { getMyListings, getRequests, getListings, deleteListing, updateListing, updateRequestStatus } from '../services/api'

const TABS = [['overview', 'Overview', LayoutGrid], ['listings', 'My Listings', Shirt], ['requests', 'My Requests', Inbox], ['donations', 'My Donations', Gift], ['wishlist', 'Wishlist', Heart], ['profile', 'Profile', User]]
const typeName = { sell: 'Purchase', exchange: 'Exchange', donate: 'Donation' }
const timeAgo = (ts) => { if (!ts) return ''; const h = Math.round((Date.now() - ts) / 36e5); return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago` }
const priceText = (l) => (l.listingType === 'sell' ? (l.price != null ? `₹${Number(l.price).toLocaleString('en-IN')}` : '—') : l.listingType === 'exchange' ? 'Exchange' : 'Free')
const typeOf = (r) => r.type ?? r.listing?.listingType

function Stat({ label, value }) {
  return <div className="bg-blush/50 p-5"><p className="font-display text-4xl text-plum">{value}</p><p className="text-sm text-charcoal/70 mt-1">{label}</p></div>
}

function ListingRow({ item, onEdit, onDelete }) {
  const name = item.name ?? item.title
  return (
    <li className="flex gap-4 items-center border border-plum/15 p-3">
      <Link to={`/product/${item.id}`}><ImageWithFallback src={item.image ?? item.images?.[0]} alt={name} className="w-16 h-20 sm:w-20 sm:h-24" /></Link>
      <div className="flex-1 min-w-0">
        <p className="font-display text-lg text-plum truncate">{name}</p>
        <p className="text-sm text-charcoal/70">{typeName[item.listingType]} · {priceText(item)}</p>
        <div className="mt-2"><StatusBadge status={item.status} /></div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <button onClick={() => onEdit(item)} className="text-sm border border-plum text-plum px-3 py-1.5">Edit</button>
        <button onClick={() => onDelete(item)} className="text-sm border border-charcoal/40 px-3 py-1.5">Delete</button>
      </div>
    </li>
  )
}

export default function Dashboard() {
  const { user, signOut, saveProfile } = useAuth()
  const { ids, toggle } = useWishlist()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview'
  const [listings, setListings] = useState(null)
  const [reqs, setReqs] = useState({ incoming: [], sent: [] })
  const [saved, setSaved] = useState([])
  const [reqTab, setReqTab] = useState('incoming')
  const [loadError, setLoadError] = useState('')
  const [toDelete, setToDelete] = useState(null)
  const [toEdit, setToEdit] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', description: '', price: '' })
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [profile, setProfile] = useState({ name: user.name, college: user.college, location: user.location || '' })

  const refresh = useCallback(() => {
    setLoadError('')
    getMyListings(user.id).then(setListings).catch((e) => { setListings([]); setLoadError(e.message || 'Could not load your listings.') })
    getRequests(user.id).then(setReqs).catch((e) => setLoadError(e.message || 'Could not load your requests.'))
  }, [user.id])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { getListings().then((all) => setSaved(all.filter((l) => ids.includes(l.id)))).catch(() => setSaved([])) }, [ids])

  const mine = (listings || []).filter((l) => l.listingType !== 'donate')
  const donations = (listings || []).filter((l) => l.listingType === 'donate')
  const pending = reqs.incoming.filter((r) => r.status === 'pending').length
  const completed = (listings || []).filter((l) => l.status === 'completed').length
  const activity = [...reqs.incoming.map((r) => ({ ...r, in: true })), ...reqs.sent].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 4)

  const update = async (r, status) => {
    try { await updateRequestStatus(r.id, status) } catch (err) { return toast(err.message || 'Could not update the request.', 'error') }
    const first = (r.from?.name || 'They').split(' ')[0]
    const msg = { accepted: `Request accepted. ${first} can now see your contact details.`, rejected: 'Request declined.', declined: 'Request declined.', cancelled: 'Request cancelled.', completed: 'Marked as completed.' }[status] || 'Request updated.'
    toast(msg, ['rejected', 'declined', 'cancelled'].includes(status) ? 'error' : 'success')
    refresh()
  }
  const confirmDelete = async () => {
    try { await deleteListing(toDelete.id) } catch (err) { return toast(err.message || 'Could not delete the listing.', 'error') }
    setToDelete(null); toast('Listing deleted.'); refresh()
  }
  const openEdit = (item) => {
    setToEdit(item)
    setEditForm({ title: item.name ?? item.title ?? '', description: item.description ?? '', price: item.price ?? '' })
  }
  const saveEdit = async (e) => {
    e.preventDefault(); setSaving(true)
    const changes = { title: editForm.title.trim(), description: editForm.description.trim() }
    if (toEdit.listingType === 'sell') changes.price = Number(editForm.price)
    try { await updateListing(toEdit.id, changes) } catch (err) { setSaving(false); return toast(err.message || 'Could not update the listing.', 'error') }
    setSaving(false); setToEdit(null); toast('Listing updated.'); refresh()
  }
  const saveProf = async (e) => { e.preventDefault(); await saveProfile(profile); setEditing(false); toast('Profile updated.') }
  const empty = (title, text, to, cta) => <EmptyState title={title} text={text} action={to && <Link to={to}><Button>{cta}</Button></Link>} />
  const list = (items) => <ul className="flex flex-col gap-3">{items.map((i) => <ListingRow key={i.id} item={i} onEdit={openEdit} onDelete={setToDelete} />)}</ul>

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 grid lg:grid-cols-[240px_1fr] gap-10">
      <aside>
        <div className="flex items-center gap-3 mb-6">
          <span className="w-12 h-12 rounded-full bg-plum text-cream flex items-center justify-center font-display text-xl">{user.name[0]}</span>
          <div className="min-w-0"><p className="font-medium truncate">{user.name}</p><p className="text-xs text-charcoal/60 truncate">{user.college}</p></div>
        </div>
        <nav aria-label="Account" className="flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0">
          {TABS.map(([k, label, Icon]) => (
            <Link key={k} to={`/dashboard?tab=${k}`} aria-current={tab === k ? 'page' : undefined}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm whitespace-nowrap ${tab === k ? 'bg-plum text-cream' : 'hover:bg-blush/60 text-charcoal'}`}><Icon size={16} />{label}</Link>
          ))}
          <button onClick={() => { signOut(); navigate('/') }} className="flex items-center gap-3 px-4 py-2.5 text-sm whitespace-nowrap hover:bg-blush/60 text-left"><LogOut size={16} />Logout</button>
        </nav>
      </aside>

      <section>
        {loadError && ['overview', 'listings', 'donations', 'requests'].includes(tab) && (
          <p role="alert" className="mb-6 text-sm text-plum border border-plum/30 bg-blush/40 p-3">Couldn't load some data: {loadError} <button onClick={refresh} className="underline ml-2">Try again</button></p>
        )}

        {tab === 'overview' && (
          <>
            <h1 className="text-4xl md:text-5xl">Welcome back, <em className="text-rose">{user.name.split(' ')[0]}.</em></h1>
            <p className="text-charcoal/70 mt-2">{user.college}</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
              <Stat label="My Listings" value={mine.length} /><Stat label="Incoming Requests" value={reqs.incoming.length} />
              <Stat label="Pending Requests" value={pending} /><Stat label="Completed Listings" value={completed} />
            </div>
            <h2 className="text-2xl mt-10 mb-4">Recent activity</h2>
            {activity.length === 0 ? <p className="text-charcoal/70">Nothing yet. Requests you send and receive will appear here.</p> : (
              <ul className="divide-y divide-plum/15 border-y border-plum/15">
                {activity.map((a) => (
                  <li key={a.id} className="py-3 flex justify-between gap-4 text-sm">
                    <span>{a.in ? `${a.from?.name || 'Someone'} sent a ${typeName[typeOf(a)]?.toLowerCase() || 'new'} request for` : 'You requested'} <b>{a.listing?.name ?? a.listing?.title}</b></span>
                    <span className="flex items-center gap-3 shrink-0"><StatusBadge status={a.status} /><span className="text-charcoal/60">{timeAgo(a.createdAt)}</span></span>
                  </li>))}
              </ul>)}
          </>
        )}

        {tab === 'listings' && (<><h1 className="text-4xl mb-6">My Listings</h1>{!listings ? <p>Loading…</p> : mine.length ? list(mine) : empty('No listings yet', 'Give your first piece a new story.', '/sell', 'Start selling')}</>)}
        {tab === 'donations' && (<><h1 className="text-4xl mb-6">My Donations</h1>{!listings ? <p>Loading…</p> : donations.length ? list(donations) : empty('No donations yet', 'Pass on something you no longer wear.', '/donate', 'Donate a piece')}</>)}

        {tab === 'requests' && (
          <>
            <h1 className="text-4xl mb-6">My Requests</h1>
            <div className="flex gap-2 mb-6">
              {[['incoming', `Received (${reqs.incoming.length})`], ['sent', `Sent (${reqs.sent.length})`]].map(([k, l]) => (
                <button key={k} onClick={() => setReqTab(k)} className={`px-4 py-2 text-sm border border-plum ${reqTab === k ? 'bg-plum text-cream' : 'text-plum'}`}>{l}</button>))}
            </div>
            {reqs[reqTab].length ? <ul className="flex flex-col gap-3">{reqs[reqTab].map((r) => <RequestRow key={r.id} r={r} incoming={reqTab === 'incoming'} onUpdate={update} />)}</ul>
              : empty(reqTab === 'incoming' ? 'No incoming requests' : 'No requests sent', reqTab === 'incoming' ? 'When someone asks about your pieces, it will show up here.' : 'Find something you love and send a request.', reqTab === 'sent' && '/explore', 'Explore')}
          </>
        )}

        {tab === 'wishlist' && (
          <>
            <h1 className="text-4xl mb-6">Wishlist</h1>
            {saved.length ? (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-10">
                {saved.map((i) => <div key={i.id}><ProductCard item={{ ...i, image: i.image ?? i.images?.[0] }} /><button onClick={() => toggle(i.id)} className="text-xs text-rose underline mt-2">Remove from wishlist</button></div>)}
              </div>) : empty('Your wishlist is empty', 'Tap the heart on any piece to save it here.', '/explore', 'Explore pieces')}
          </>
        )}

        {tab === 'profile' && (
          <>
            <h1 className="text-4xl mb-6">Profile</h1>
            <div className="flex items-center gap-4 mb-8">
              <span className="w-20 h-20 rounded-full bg-plum text-cream flex items-center justify-center font-display text-3xl">{user.name[0]}</span>
              <p className="text-sm text-charcoal/60">Profile photo upload isn't available yet.</p>
            </div>
            {editing ? (
              <form onSubmit={saveProf} className="max-w-md flex flex-col gap-5">
                {[['name', 'Full name'], ['college', 'College name'], ['location', 'Location']].map(([k, l]) => (
                  <FormField key={k} id={k} label={l}><input id={k} required={k !== 'location'} value={profile[k]} onChange={(e) => setProfile({ ...profile, [k]: e.target.value })} className={inputClass()} /></FormField>))}
                <div className="flex gap-3"><Button type="submit">Save changes</Button><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button></div>
              </form>
            ) : (
              <>
                <dl className="max-w-md divide-y divide-plum/15 border-y border-plum/15">
                  {[['Full name', user.name], ['Email', user.email], ['College', user.college], ['Location', user.location || 'Not added yet']].map(([k, v]) => (
                    <div key={k} className="py-3 flex justify-between gap-4"><dt className="text-charcoal/60 text-sm">{k}</dt><dd>{v}</dd></div>))}
                </dl>
                <Button className="mt-6" onClick={() => setEditing(true)}>Edit profile</Button>
              </>
            )}
          </>
        )}
      </section>

      {toEdit && (
        <Modal title="Edit listing" onClose={() => setToEdit(null)}>
          <form onSubmit={saveEdit} className="flex flex-col gap-4">
            <FormField id="edit-title" label="Title"><input id="edit-title" required minLength={3} maxLength={100} value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className={inputClass()} /></FormField>
            <FormField id="edit-desc" label="Description"><textarea id="edit-desc" rows="4" required minLength={10} maxLength={1000} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className={inputClass()} /></FormField>
            {toEdit.listingType === 'sell' && (
              <FormField id="edit-price" label="Price (₹)"><input id="edit-price" type="number" min="1" step="1" required value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} className={inputClass()} /></FormField>
            )}
            <div className="flex gap-3"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button><Button type="button" variant="secondary" onClick={() => setToEdit(null)}>Cancel</Button></div>
          </form>
        </Modal>
      )}

      {toDelete && (
        <Modal title="Delete this listing?" onClose={() => setToDelete(null)}>
          <p className="text-sm text-charcoal/70 mb-6">“{toDelete.name ?? toDelete.title}” will be removed from the marketplace. This can't be undone.</p>
          <div className="flex gap-3"><Button onClick={confirmDelete}>Delete listing</Button><Button variant="secondary" onClick={() => setToDelete(null)}>Keep it</Button></div>
        </Modal>
      )}
    </div>
  )
}