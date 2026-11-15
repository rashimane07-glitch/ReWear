export const inputClass = (error) =>
  `w-full px-4 py-3 bg-cream border text-sm focus:outline-none focus:border-plum ${error ? 'border-plum ring-1 ring-plum' : 'border-plum/30'}`

// Label + control + error message. Pass the control as children and give it id={id}.
export default function FormField({ id, label, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-2">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-charcoal/60 mt-1">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-plum font-medium mt-1">{error}</p>}
    </div>
  )
}
