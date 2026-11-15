import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Upload, Search, MessageCircle } from 'lucide-react'
import Button from '../components/Button'
import ProductCard from '../components/ProductCard'
import ImageWithFallback from '../components/ImageWithFallback'
import { getTrendingProducts, getCategories, getImpactStats } from '../services/api'

// Mosaic layout classes for the 6 category tiles (desktop).
const tileClass = ['md:row-span-2', 'md:col-span-2', '', '', '', ''] // fills a 4x2 grid with no gaps
const eyebrow = 'text-xs tracking-[0.2em] text-rose mb-3'
const marqueeText = ['BUY LESS, CHOOSE WELL', 'STYLE THAT CIRCULATES', 'FROM ONE CLOSET TO ANOTHER']

export default function Home() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [stats, setStats] = useState([])

  useEffect(() => {
    getTrendingProducts().then(setProducts)
    getCategories().then(setCategories)
    getImpactStats().then(setStats)
  }, [])

  return (
    <>
      {/* HERO */}
      <section className="max-w-7xl mx-auto px-6 py-16 lg:py-24 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <p className={eyebrow}>PRE-LOVED. RE-STYLED. REPEATED.</p>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl leading-[1.05]">Your Style, Their <em className="text-rose">Second Chance.</em></h1>
          <p className="mt-6 max-w-md text-charcoal/75">Give pre-loved fashion a new story. Discover, sell, exchange and donate clothing within your student community.</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/explore"><Button>Explore Collection <ArrowRight size={16} /></Button></Link>
            <Link to="/sell"><Button variant="secondary">Start Selling</Button></Link>
          </div>
        </div>
        <div className="relative max-w-md mx-auto lg:ml-auto w-full">
          <div className="absolute -left-6 bottom-0 w-3/4 h-5/6 bg-blush rounded-t-full" aria-hidden />
          <ImageWithFallback src="/images/hero.jpg" eager alt="Model wearing a pre-loved grey shirt" className="relative w-full aspect-[4/5]" />
        </div>
      </section>

      {/* MARQUEE */}
      <div className="bg-plum text-cream overflow-hidden py-3" aria-hidden>
        <div className="marquee-track flex w-max gap-16 text-xs tracking-[0.2em] whitespace-nowrap">
          {[0, 1, 2, 3].flatMap((i) => marqueeText.map((t) => <span key={t + i}>{t}</span>))}
        </div>
      </div>

      {/* CATEGORIES */}
      <section className="max-w-7xl mx-auto px-6 pt-24">
        <div className="flex items-end justify-between mb-10">
          <div><p className={eyebrow}>SHOP YOUR MOOD</p><h2 className="text-4xl md:text-5xl">Find your next favourite</h2></div>
          <Link to="/explore" className="hidden sm:flex items-center gap-2 text-sm text-plum">Explore all <ArrowRight size={16} /></Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[180px] md:auto-rows-[200px] gap-4">
          {categories.map((c, i) => (
            <Link key={c.name} to={`/explore?category=${encodeURIComponent(c.name)}`} className={`relative overflow-hidden group ${tileClass[i]}`}>
              <ImageWithFallback src={c.image} alt={c.name} className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-plum/70 to-transparent" />
              <span className="absolute bottom-4 left-4 font-display text-cream text-xl">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* IMPACT */}
      <section className="bg-plum text-cream mt-24 py-20">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-[1.2fr_2fr] gap-12">
          <div>
            <p className="text-xs tracking-[0.2em] text-blush mb-3">THE COST OF FAST FASHION</p>
            <h2 className="text-4xl md:text-5xl !text-cream">Small closet choices. <em className="text-blush">Collective impact.</em></h2>
            <p className="mt-6 text-cream/75 max-w-sm">Keeping clothes in circulation is one of the simplest ways to reduce fashion's footprint.</p>
            <Link to="/donate" className="inline-block mt-8"><Button variant="light">Pass something on</Button></Link>
          </div>
          <div className="grid sm:grid-cols-3 gap-8 sm:border-l sm:border-cream/20 sm:pl-8">
            {stats.map((s) => (
              <div key={s.value + s.label}>
                <p className="font-display text-6xl">{s.value}</p>
                <p className="mt-3 font-medium">{s.label}</p>
                <p className="text-sm text-cream/70 mt-1">{s.note}</p>
                <p className="text-xs text-cream/50 mt-3">Source: {s.source}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRENDING */}
      <section className="max-w-7xl mx-auto px-6 pt-24">
        <div className="flex items-end justify-between mb-10">
          <div><p className={eyebrow}>CLOSET ENVY</p><h2 className="text-4xl md:text-5xl">Trending on campus</h2></div>
          <Link to="/explore" className="hidden sm:flex items-center gap-2 text-sm text-plum">See the full edit <ArrowRight size={16} /></Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-10">
          {products.map((p) => <ProductCard key={p.id} item={p} />)}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-7xl mx-auto px-6 pt-24">
        <div className="grid md:grid-cols-2">
          <div className="relative min-h-[320px]">
            <ImageWithFallback src="/images/how-it-works.jpg" alt="Clothes on hangers" className="absolute inset-0 w-full h-full" />
            <p className="absolute bottom-6 left-6 font-display text-cream text-3xl max-w-[12ch] drop-shadow">Closet space, meet <em>possibility.</em></p>
          </div>
          <div className="bg-blush p-10 lg:p-16">
            <p className="text-xs tracking-[0.2em] text-plum/70 mb-3">SIMPLE BY DESIGN</p>
            <h2 className="text-4xl">Three steps to a better-dressed campus.</h2>
            <ul className="mt-8 divide-y divide-plum/20">
              {[[Upload, 'List', 'Upload your pre-loved clothing in minutes.', '/sell'],
                [Search, 'Discover', 'Explore affordable fashion near you.', '/explore'],
                [MessageCircle, 'Connect', 'Send a request to buy, exchange or donate.', '/explore']].map(([Icon, t, d, to]) => (
                <li key={t}><Link to={to} className="flex items-center gap-4 py-5 group">
                  <Icon className="text-plum" size={22} />
                  <div className="flex-1"><p className="font-display text-xl text-plum">{t}</p><p className="text-sm text-charcoal/70">{d}</p></div>
                  <ArrowRight size={18} className="text-plum group-hover:translate-x-1 transition-transform" />
                </Link></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* WHY REWEAR */}
      <section className="max-w-7xl mx-auto px-6 pt-24">
        <p className={eyebrow}>MADE FOR CAMPUS LIFE</p>
        <h2 className="text-4xl md:text-5xl mb-10">More style. Less compromise.</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 border-t border-plum/20">
          {[['Affordable fashion', 'Great style should fit your wardrobe and your budget.'],
            ['Sustainable choices', 'Every re-worn piece keeps clothing out of landfill.'],
            ['Student community', 'Buy, swap or donate with people from your own campus.'],
            ['Easy clothing reuse', 'List in minutes, then accept or decline requests.']].map(([t, d]) => (
            <div key={t} className="py-8 pr-6 lg:border-r border-plum/20 last:border-r-0">
              <h3 className="text-xl">{t}</h3><p className="text-sm text-charcoal/70 mt-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIAL – SAMPLE */}
      <section className="bg-blush mt-24 py-20 px-6 text-center">
        <p className="font-display text-2xl md:text-4xl text-plum max-w-3xl mx-auto leading-snug">“ReWear made clearing my closet feel less like letting go and more like passing on a really good story.”</p>
        <p className="mt-6 text-sm text-charcoal/80">Sample testimonial · illustrative only, not a real customer review</p>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 pt-24 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div><p className={eyebrow}>YOUR CLOSET IS INVITED</p><h2 className="text-4xl md:text-5xl">Ready to give your clothes a second chance?</h2></div>
        <Link to="/sell"><Button>List your first piece <ArrowRight size={16} /></Button></Link>
      </section>
    </>
  )
}
