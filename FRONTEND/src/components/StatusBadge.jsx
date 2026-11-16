// All colours come from the Plum & Blush palette.
// Request statuses from the backend: pending, accepted, declined, cancelled, completed.
// "rejected" is kept only so older mock data still looks right.
const styles = {
  pending: 'bg-blush text-plum',
  accepted: 'bg-plum text-cream',
  declined: 'bg-charcoal/10 text-charcoal/70',
  rejected: 'bg-charcoal/10 text-charcoal/70',
  cancelled: 'border border-charcoal/30 text-charcoal/60',
  completed: 'bg-rose text-cream',
  active: 'bg-blush/60 text-plum',
  reserved: 'border border-rose text-plum',
}
export default function StatusBadge({ status }) {
  const label = status || 'active'
  return <span className={`inline-block text-xs px-2.5 py-1 capitalize ${styles[label] || styles.active}`}>{label}</span>
}