import { useState } from 'react'
import { Shirt } from 'lucide-react'

// Shows a blush placeholder if the image file is missing, so there are never broken-image icons.
export default function ImageWithFallback({ src, alt, className = '', eager = false }) {
  const [failed, setFailed] = useState(false)
  if (failed || !src) {
    return (
      <div role="img" aria-label={alt} className={`bg-blush flex items-center justify-center ${className}`}>
        <Shirt className="text-plum/40" size={36} />
      </div>
    )
  }
  return <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} className={`object-cover ${className}`} />
}
