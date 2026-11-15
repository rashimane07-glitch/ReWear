// All colours come from the Plum & Blush palette.
const styles = {
  pending: 'bg-blush text-plum', accepted: 'bg-plum text-cream', rejected: 'bg-charcoal/10 text-charcoal/70',
  completed: 'bg-rose text-cream', active: 'bg-blush/60 text-plum', reserved: 'border border-rose text-plum',
}
export default function StatusBadge({ status }) {
  return <span className={`inline-block text-xs px-2.5 py-1 capitalize ${styles[status] || styles.active}`}>{status}</span>
}
