import { Link } from 'react-router-dom'
import ImageWithFallback from './ImageWithFallback'

// Split-screen: editorial photo on the left (desktop), form on the right.
export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="relative hidden md:block bg-blush">
        <ImageWithFallback src="/images/hero.jpg" alt="Model in a pre-loved grey shirt" className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-plum/80 to-transparent" />
        <p className="absolute bottom-10 left-10 right-10 font-display text-cream text-4xl leading-tight">Your Style, Their <em>Second Chance.</em></p>
      </div>
      <div className="flex flex-col justify-center px-6 sm:px-16 py-12">
        <Link to="/" className="font-display text-3xl text-plum mb-10">Re<em>Wear</em><span className="text-rose">.</span></Link>
        <h1 className="text-4xl md:text-5xl">{title}</h1>
        <p className="text-charcoal/70 mt-2 mb-8">{subtitle}</p>
        <div className="max-w-md">{children}</div>
      </div>
    </div>
  )
}
