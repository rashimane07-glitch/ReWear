import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

const ToastContext = createContext(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const show = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="flex items-center gap-3 bg-charcoal text-cream px-5 py-3 text-sm shadow-lg max-w-sm">
            {t.type === 'success' ? <CheckCircle2 size={18} className="text-blush" /> : <XCircle size={18} className="text-rose" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
