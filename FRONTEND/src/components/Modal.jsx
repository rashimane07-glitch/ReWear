import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function Modal({ title, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 bg-charcoal/50 flex items-center justify-center p-4" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="bg-cream w-full max-w-md max-h-[90vh] overflow-y-auto p-8 relative focus:outline-none">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-plum"><X size={20} /></button>
        <h2 className="text-3xl mb-4">{title}</h2>
        {children}
      </div>
    </div>
  )
}
