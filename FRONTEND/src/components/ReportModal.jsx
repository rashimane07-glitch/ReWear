import { useState } from 'react'
import Modal from './Modal'
import Button from './Button'
import FormField, { inputClass } from './FormField'
import { useToast } from './Toast'
import { reportListing, REPORT_REASONS } from '../services/api'

const MAX_DETAILS = 500 // backend limit

// "Report this listing": sends POST /reports. An administrator reviews it in the Admin page.
export default function ReportModal({ listing, onClose }) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (sending) return
    if (!reason) return setError('Choose a reason.')
    setSending(true); setError('')
    try {
      await reportListing(listing.id, reason, details)
      toast('Thank you. An administrator will review this listing.')
      onClose()
    } catch (err) {
      setError(err.message || 'Could not send the report.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal title="Report this listing" onClose={sending ? () => {} : onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-charcoal/70">“{listing.name}”. Reports are private: the seller does not see who reported it.</p>
        {error && <p role="alert" className="border border-plum text-plum text-sm p-3">{error}</p>}
        <FormField id="report-reason" label="Reason">
          <select id="report-reason" value={reason} onChange={(e) => { setReason(e.target.value); setError('') }} className={inputClass(!reason && error)}>
            <option value="">Choose a reason</option>
            {REPORT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </FormField>
        <FormField id="report-details" label="Details (optional)" hint={`${details.length}/${MAX_DETAILS}`}>
          <textarea id="report-details" rows="3" maxLength={MAX_DETAILS} value={details} onChange={(e) => setDetails(e.target.value)} className={inputClass()} placeholder="What is wrong with this listing?" />
        </FormField>
        <div className="flex gap-3">
          <Button type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send report'}</Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={sending}>Cancel</Button>
        </div>
      </form>
    </Modal>
  )
}
