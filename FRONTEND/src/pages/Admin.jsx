import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Flag, Shirt } from 'lucide-react'
import Button from '../components/Button'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import StatusBadge from '../components/StatusBadge'
import FormField, { inputClass } from '../components/FormField'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { getAdminReports, dismissReport, resolveReport, getAdminListings, removeListingAsAdmin, REPORT_REASONS } from '../services/api'

// Admin area (role "admin" only). The backend checks the role on every call; this page only hides the screens.
// Make an account an admin with:  cd backend && npm run admin:create -- <email>
const TABS = [['reports', 'Reports', Flag], ['listings', 'Listings', Shirt]]
const REPORT_FILTERS = [['open', 'Open'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['all', 'All']]
const LISTING_FILTERS = [['', 'All (not removed)'], ['available', 'Available'], ['reserved', 'Reserved'], ['completed', 'Completed'], ['removed', 'Removed']]
const reasonLabel = (value) => (REPORT_REASONS.find(([v]) => v === value) || [value, value])[1]
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

// One confirmation dialog for every admin action, with an optional note (max 500 characters, backend limit).
function ConfirmAction({ title, text, confirmLabel, onConfirm, onClose }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    setBusy(true); setError('')
    try { await onConfirm(note.trim()) } catch (err) { setError(err.message || 'Something went wrong.'); setBusy(false) }
  }
  return (
    <Modal title={title} onClose={busy ? () => {} : onClose}>
      <p className="text-sm text-charcoal/70 mb-4">{text}</p>
      {error && <p role="alert" className="border border-plum text-plum text-sm p-3 mb-4">{error}</p>}
      <FormField id="admin-note" label="Note (optional, only admins see it)">
        <textarea id="admin-note" rows="2" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass()} />
      </FormField>
      <div className="flex gap-3 mt-5">
        <Button onClick={go} disabled={busy}>{busy ? 'Saving…' : confirmLabel}</Button>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
      </div>
    </Modal>
  )
}

function Reports() {
  const toast = useToast()
  const [status, setStatus] = useState('open')
  const [reports, setReports] = useState(null)
  const [error, setError] = useState('')
  const [action, setAction] = useState(null) // { report, kind: 'dismiss' | 'resolve' | 'remove' }

  const load = useCallback(() => {
    setReports(null); setError('')
    getAdminReports(status).then(setReports).catch((err) => { setReports([]); setError(err.message) })
  }, [status])
  useEffect(() => { load() }, [load])

  const confirm = async (note) => {
    const { report, kind } = action
    if (kind === 'dismiss') await dismissReport(report.id, note)
    else await resolveReport(report.id, kind === 'remove' ? 'remove_listing' : 'none', note)
    setAction(null)
    toast({ dismiss: 'Report dismissed.', resolve: 'Report resolved.', remove: 'Report resolved and listing removed.' }[kind])
    load()
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Report status">
        {REPORT_FILTERS.map(([value, label]) => (
          <button key={value} onClick={() => setStatus(value)} aria-pressed={status === value} className={`px-4 py-1.5 text-sm border ${status === value ? 'bg-plum text-cream border-plum' : 'border-plum/30 text-plum'}`}>{label}</button>
        ))}
      </div>
      {error && <p role="alert" className="border border-plum text-plum text-sm p-3 mb-4">{error} <button onClick={load} className="underline ml-2">Try again</button></p>}
      {!reports ? <p>Loading…</p> : reports.length === 0 && !error ? (
        <EmptyState title="No reports here" text={status === 'open' ? 'Nothing is waiting for review.' : 'No reports with this status.'} />
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => {
            const listing = r.target && r.target.type === 'listing' ? r.target : null
            return (
              <li key={r.id} className="border border-plum/15 p-4">
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <p className="font-medium">
                    {listing ? <>Listing: {listing.status !== 'removed' ? <Link to={`/product/${listing.id}`} className="text-plum underline">{listing.title}</Link> : <span>{listing.title} (removed)</span>}</> : <>User: {r.target ? r.target.name : 'unknown'}</>}
                  </p>
                  <StatusBadge status={r.status} />
                </div>
                <p className="text-sm text-charcoal/70 mt-1">
                  {reasonLabel(r.reason)} · reported by {r.reporter && r.reporter.name ? r.reporter.name : 'a user'} · {day(r.createdAt)}
                  {listing && listing.owner && listing.owner.name ? ` · seller: ${listing.owner.name}` : ''}
                </p>
                {r.details && <p className="text-sm mt-2 whitespace-pre-line">“{r.details}”</p>}
                {r.resolution && <p className="text-xs text-charcoal/60 mt-2">Decision: {r.resolution.action === 'remove_listing' ? 'listing removed' : r.status}{r.resolution.note ? ` · note: ${r.resolution.note}` : ''} · {day(r.resolution.at)}</p>}
                {r.status === 'open' && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button onClick={() => setAction({ report: r, kind: 'resolve' })} className="text-sm border border-plum text-plum px-3 py-1.5">Resolve</button>
                    {listing && listing.status !== 'removed' && <button onClick={() => setAction({ report: r, kind: 'remove' })} className="text-sm bg-plum text-cream px-3 py-1.5">Resolve and remove listing</button>}
                    <button onClick={() => setAction({ report: r, kind: 'dismiss' })} className="text-sm border border-charcoal/40 px-3 py-1.5">Dismiss</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {action && (
        <ConfirmAction
          title={{ dismiss: 'Dismiss this report?', resolve: 'Resolve this report?', remove: 'Resolve and remove the listing?' }[action.kind]}
          text={{ dismiss: 'The report is closed with no change to the listing.', resolve: 'The report is marked as handled. The listing stays as it is.', remove: 'The listing is removed from the marketplace and the report is marked as handled. This cannot be undone from the site.' }[action.kind]}
          confirmLabel={{ dismiss: 'Dismiss', resolve: 'Resolve', remove: 'Remove listing' }[action.kind]}
          onConfirm={confirm}
          onClose={() => setAction(null)}
        />
      )}
    </>
  )
}

function Listings() {
  const toast = useToast()
  const [state, setState] = useState('')
  const [listings, setListings] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)
  const [error, setError] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  const [toRemove, setToRemove] = useState(null)

  const load = useCallback(() => {
    setListings(null); setError(''); setNextCursor(null)
    getAdminListings({ state }).then((r) => { setListings(r.listings); setNextCursor(r.nextCursor) }).catch((err) => { setListings([]); setError(err.message) })
  }, [state])
  useEffect(() => { load() }, [load])

  const more = async () => {
    setLoadingMore(true)
    try { const r = await getAdminListings({ state, cursor: nextCursor }); setListings((l) => [...l, ...r.listings]); setNextCursor(r.nextCursor) } catch (err) { setError(err.message) } finally { setLoadingMore(false) }
  }
  const remove = async (note) => {
    await removeListingAsAdmin(toRemove.id, note)
    setToRemove(null); toast('Listing removed.'); load()
  }

  return (
    <>
      <label className="text-sm flex items-center gap-3 mb-6">Show
        <select value={state} onChange={(e) => setState(e.target.value)} className="border border-plum/30 px-3 py-1.5 bg-transparent">
          {LISTING_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="border border-plum text-plum text-sm p-3 mb-4">{error} <button onClick={load} className="underline ml-2">Try again</button></p>}
      {!listings ? <p>Loading…</p> : listings.length === 0 && !error ? <EmptyState title="No listings" text="Nothing matches this filter." /> : (
        <ul className="flex flex-col gap-2">
          {listings.map((l) => (
            <li key={l.id} className="border border-plum/15 p-3 flex flex-wrap items-center gap-3 justify-between">
              <div className="min-w-0">
                <p className="font-medium truncate">{l.status !== 'removed' ? <Link to={`/product/${l.id}`} className="text-plum hover:underline">{l.title}</Link> : l.title}</p>
                <p className="text-xs text-charcoal/60">{l.owner && l.owner.name ? l.owner.name : 'unknown seller'} · {l.listingType}{l.price ? ` · ₹${l.price.toLocaleString('en-IN')}` : ''} · {l.imageCount} photo{l.imageCount === 1 ? '' : 's'} · {day(l.createdAt)}{l.removal ? ` · removed by ${l.removal.removedBy}` : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={l.status === 'available' ? 'active' : l.status} />
                {l.status !== 'removed' && <button onClick={() => setToRemove(l)} className="text-sm border border-charcoal/40 px-3 py-1.5">Remove</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {nextCursor && <div className="mt-6 text-center"><Button variant="secondary" onClick={more} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</Button></div>}
      {toRemove && <ConfirmAction title="Remove this listing?" text={`“${toRemove.title}” will disappear from the marketplace. The seller is not notified automatically.`} confirmLabel="Remove listing" onConfirm={remove} onClose={() => setToRemove(null)} />}
    </>
  )
}

export default function Admin() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'reports'

  if (user.role !== 'admin') {
    return <EmptyState title="Admins only" text="This area is for ReWear administrators." action={<Link to="/dashboard"><Button>Go to my dashboard</Button></Link>} />
  }
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-4xl md:text-5xl mb-2">Admin</h1>
      <p className="text-charcoal/70 mb-8">Review reported listings and keep the marketplace safe.</p>
      <nav aria-label="Admin sections" className="flex gap-2 mb-8 border-b border-plum/15">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} onClick={() => setParams({ tab: key })} aria-current={tab === key ? 'page' : undefined} className={`flex items-center gap-2 px-4 py-2 text-sm -mb-px border-b-2 ${tab === key ? 'border-plum text-plum' : 'border-transparent text-charcoal/70'}`}><Icon size={16} />{label}</button>
        ))}
      </nav>
      {tab === 'reports' ? <Reports /> : <Listings />}
    </div>
  )
}
