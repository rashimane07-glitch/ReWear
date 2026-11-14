// variant: primary (plum fill) | secondary (outline) | light (for dark backgrounds)
const styles = {
  primary: 'bg-plum text-cream hover:bg-plum/90',
  secondary: 'border border-plum text-plum hover:bg-plum hover:text-cream',
  light: 'border border-cream/60 text-cream hover:bg-cream hover:text-plum',
}
export default function Button({ variant = 'primary', className = '', children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
