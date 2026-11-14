import { useWishlist } from '../context/WishlistContext'
import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import ImageWithFallback from './ImageWithFallback'

const typeLabel = { sell: 'For sale', exchange: 'For exchange', donate: 'Free' }

export default function ProductCard({ item }) {
  const { has, toggle } = useWishlist()
  const { id, name, image, condition, size, price, originalPrice, listingType, seller } = item
  const saved = has(item.id)
  return (
    <article className="group">
      <div className="relative aspect-[4/5] overflow-hidden bg-blush">
        <Link to={`/product/${id}`}>
          <ImageWithFallback src={image} alt={name} className="w-full h-full group-hover:scale-105 transition-transform duration-500" />
        </Link>
        <span className="absolute top-3 left-3 bg-cream text-plum text-[11px] tracking-wider px-2.5 py-1">{typeLabel[listingType]}</span>
        <button onClick={() => toggle(id)} aria-pressed={saved} aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-cream/90 flex items-center justify-center text-plum">
          <Heart size={16} fill={saved ? '#C58B91' : 'none'} />
        </button>
      </div>
      <div className="pt-3">
        <div className="flex justify-between text-[11px] tracking-wider text-charcoal/60 uppercase">
          <span>{condition}</span><span>Size {size}</span>
        </div>
        <h3 className="text-xl mt-1">{name}</h3>
        <p className="mt-1 font-medium">
          {listingType === 'sell' && <>₹{price.toLocaleString('en-IN')} {originalPrice && <s className="text-charcoal/40 text-sm font-normal ml-1">₹{originalPrice.toLocaleString('en-IN')}</s>}</>}
          {listingType === 'exchange' && <span className="text-rose">Open to exchange</span>}
          {listingType === 'donate' && <span className="text-rose">Free to a good home</span>}
        </p>
        <div className="flex items-center gap-2 mt-3 text-xs text-charcoal/70">
          <span className="w-6 h-6 rounded-full bg-blush text-plum flex items-center justify-center text-[10px] font-medium">{seller.name[0]}</span>
          {seller.name} · {seller.college}
        </div>
      </div>
    </article>
  )
}
