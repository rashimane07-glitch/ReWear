import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal } from 'lucide-react'
import ProductCard from '../components/ProductCard'
import FilterSidebar from '../components/FilterSidebar'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import { getListings } from '../services/api'
import { FILTER_OPTIONS } from '../data/listings'

const emptyFilters = (category) => ({ category: category ? [category] : [], size: [], condition: [], type: [], maxPrice: FILTER_OPTIONS.maxPrice })

// Compare labels loosely so "Western Wear", "western_wear" and "western-wear" all match.
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const matches = (selected, value) => !selected.length || selected.some((s) => norm(s) === norm(value))

export default function Explore() {
  const [params] = useSearchParams()
  const [all, setAll] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')
  const [filters, setFilters] = useState(emptyFilters(params.get('category')))
  const [drawer, setDrawer] = useState(false)

  useEffect(() => {
    let off = false
    setAll(null); setError(null)
    getListings()
      .then((d) => { if (!off) setAll(Array.isArray(d) ? d : []) })
      .catch((err) => { if (!off) { setError(err.message || 'Could not load listings.'); setAll([]) } })
    return () => { off = true }
  }, [attempt])

  const results = useMemo(() => {
    if (!all) return []
    const q = query.trim().toLowerCase()
    const list = all.filter((i) =>
      (!q || `${i.name ?? i.title ?? ''} ${i.category ?? ''} ${i.description ?? ''}`.toLowerCase().includes(q)) &&
      matches(filters.category, i.category) &&
      matches(filters.size, i.size) &&
      matches(filters.condition, i.condition) &&
      matches(filters.type, i.listingType) &&
      (i.listingType !== 'sell' || i.price == null || i.price <= filters.maxPrice))
    const price = (i, empty) => (i.listingType === 'sell' && i.price != null ? i.price : empty)
    if (sort === 'newest') list.sort((a, b) => (b.listedAt || 0) - (a.listedAt || 0))
    if (sort === 'low') list.sort((a, b) => price(a, Infinity) - price(b, Infinity))
    if (sort === 'high') list.sort((a, b) => price(b, -1) - price(a, -1))
    return list
  }, [all, query, sort, filters])

  const clear = () => { setFilters(emptyFilters()); setQuery('') }

  return (
    <div className="max-w-7xl mx-auto px-6 pb-12">
      <header className="text-center pt-16 pb-10">
        <p className="text-xs tracking-[0.2em] text-rose mb-3">THE MARKETPLACE</p>
        <h1 className="text-5xl md:text-7xl">Style worth <em className="text-rose">repeating.</em></h1>
        <p className="mt-4 text-charcoal/70">Curated pre-loved pieces from students near you.</p>
      </header>

      <div className="flex flex-col sm:flex-row gap-4 sm:items-end border-b border-plum/40 pb-3 mb-8">
        <label className="flex items-center gap-3 flex-1">
          <Search size={18} className="text-plum" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search blazers, denim, boots…" aria-label="Search listings"
            className="bg-transparent flex-1 focus:outline-none placeholder:text-charcoal/50" />
        </label>
        <div className="flex items-center gap-3 text-sm">
          <button onClick={() => setDrawer(true)} className="lg:hidden flex items-center gap-2 border border-plum px-3 py-2 text-plum"><SlidersHorizontal size={16} />Filters</button>
          <label htmlFor="sort" className="text-charcoal/60">Sort by</label>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="bg-transparent font-medium focus:outline-none">
            <option value="newest">Newest first</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option>
          </select>
        </div>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-12">
        <div className="hidden lg:block"><FilterSidebar filters={filters} setFilters={setFilters} onClear={clear} /></div>
        {drawer && (
          <div className="lg:hidden fixed inset-0 z-50 bg-charcoal/50" onClick={() => setDrawer(false)}>
            <div className="bg-cream w-[85%] max-w-sm h-full overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
              <FilterSidebar filters={filters} setFilters={setFilters} onClear={clear} />
              <Button className="w-full mt-4" onClick={() => setDrawer(false)}>Show {results.length} pieces</Button>
            </div>
          </div>
        )}
        <section aria-live="polite">
          <p className="text-sm text-charcoal/70 mb-6">{!all ? 'Loading pieces…' : error ? 'Could not load pieces' : `${results.length} pieces found`}</p>
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-10">
            {!all && Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[4/5] bg-blush/60 animate-pulse" />)}
            {all && !error && results.map((i) => <ProductCard key={i.id} item={{ ...i, image: i.image ?? i.images?.[0] }} />)}
            {all && error && (
              <EmptyState title="Couldn't load listings" text={error} action={<Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>} />
            )}
            {all && !error && !results.length && (
              <EmptyState title={all.length ? 'No pieces match yet' : 'The marketplace is empty'} text={all.length ? 'Try a different search or clear a few filters.' : 'Be the first to list a piece.'}
                action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />
            )}
          </div>
        </section>
      </div>
    </div>
  )
}