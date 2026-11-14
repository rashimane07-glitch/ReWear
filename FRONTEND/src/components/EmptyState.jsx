import { SearchX } from 'lucide-react'
export default function EmptyState({ title, text, action }) {
  return (
    <div className="text-center py-20 col-span-full">
      <div className="w-16 h-16 rounded-full bg-blush mx-auto flex items-center justify-center mb-5"><SearchX className="text-plum" /></div>
      <h3 className="text-2xl">{title}</h3>
      <p className="text-charcoal/70 mt-2 mb-6">{text}</p>
      {action}
    </div>
  )
}
