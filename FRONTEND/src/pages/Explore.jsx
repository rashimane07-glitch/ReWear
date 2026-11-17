import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal } from 'lucide-react'
import ProductCard from '../components/ProductCard'
import FilterSidebar from '../components/FilterSidebar'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import { getListings, browseListings } from '../services/api'
import { API_MODE } from '../services/config'
import { OPTIONS as FILTER_OPTIONS } from '../services/listingMapper'

const emptyFilters = (category) => ({ category: category ? [category] : [], gender: [], size: [], condition: [], type: [], maxPrice: FILTER_OPTIONS.maxPrice })

export default function Explore() {
  const [params] = useSearchParams()
  const [all, setAll] = useState(null) // null = loading
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')
  const [filters, setFilters] = useState(emptyFilters(params.get('category')))
  const [drawer, setDrawer] = useState(false)
  // REAL mode only: the server does the searching, filtering and sorting, one page at a time.
  const [typed, setTyped] = useState('') // the search words, a moment after typing stops
  const [nextCursor, setNextCursor] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0) // bumped by "Try again" to repeat the first request

  // MOCK mode: load everything once; the filtering below happens in the browser.
  useEffect(() => { if (!API_MODE) getListings().then(setAll) }, [])

  useEffect(() => {
    if (!API_MODE) return undefined
    const timer = setTimeout(() => setTyped(query), 350) // do not ask the server on every key press
    return () => clearTimeout(timer)
  }, [query])

  // REAL mode: ask the server again whenever the search words, the sort or a server-side filter changes.
  // (The price slider is not a server filter: the backend has no price filter, see `results` below.)
  const serverFilters = JSON.stringify([filters.category, filters.gender, filters.size, filters.condition, filters.type])
  useEffect(() => {
    if (!API_MODE) return undefined
    const controller = new AbortController()
    const [category, gender, size, condition, type] = JSON.parse(serverFilters)
    setAll(null); setLoadError(''); setNextCursor(null)
    browseListings({ query: typed, sort, filters: { category, gender, size, condition, type } }, { signal: controller.signal })
      .then(({ listings, nextCursor: next }) => { setAll(listings); setNextCursor(next) })
      .catch((err) => { if (err && err.name === 'AbortError') return; setLoadError(err.message || 'Could not load the listings.'); setAll([]) })
    return () => controller.abort()
  }, [typed, sort, serverFilters, attempt])

  const loadMore = async () => {
    setLoadingMore(true); setLoadError('')
    try {
      const [category, gender, size, condition, type] = JSON.parse(serverFilters)
      const { listings, nextCursor: next } = await browseListings({ query: typed, sort, filters: { category, gender, size, condition, type }, cursor: nextCursor })
      setAll((current) => [...(current || []), ...listings]); setNextCursor(next)
    } catch (err) {
      setLoadError(err.message || 'Could not load more listings.')
    } finally {
      setLoadingMore(false)
    }
  }

  const results = useMemo(() => {
    if (!all) return []
    // Slider at its maximum = no limit (real prices can be higher than the slider's range).
    const priceOk = (i) => i.listingType !== 'sell' || filters.maxPrice >= FILTER_OPTIONS.maxPrice || i.price <= filters.maxPrice
    if (API_MODE) return all.filter(priceOk) // already searched, filtered and sorted by the server
    const q = query.trim().toLowerCase()
    const list = all.filter((i) =>
      (!q || `${i.name} ${i.category} ${i.description}`.toLowerCase().includes(q)) &&
      (!filters.category.length || filters.category.includes(i.category)) &&
      (!filters.gender.length || filters.gender.includes(i.gender)) &&
      (!filters.size.length || filters.size.includes(i.size)) &&
      (!filters.condition.length || filters.condition.includes(i.condition)) &&
      (!filters.type.length || filters.type.includes(i.listingType)) &&
      (i.listingType !== 'sell' || i.price <= filters.maxPrice))
    const price = (i, empty) => (i.listingType === 'sell' ? i.price : empty)
    if (sort === 'newest') list.sort((a, b) => b.listedAt - a.listedAt)
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
          <p className="text-sm text-charcoal/70 mb-6">{all ? `${results.length} pieces ${API_MODE && nextCursor ? 'shown so far' : 'found'}` : 'Loading pieces…'}</p>
          {loadError && (
            <p role="alert" className="text-sm text-plum font-medium mb-6">
              {loadError}{' '}
              <button type="button" onClick={() => (all && all.length ? loadMore() : setAttempt((n) => n + 1))} className="underline">Try again</button>
            </p>
          )}
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-10">
            {!all && Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[4/5] bg-blush/60 animate-pulse" />)}
            {all && results.map((i) => <ProductCard key={i.id} item={{ ...i, image: i.images[0] }} />)}
            {all && !results.length && !loadError && (
              <EmptyState title={all.length ? 'No pieces match yet' : API_MODE ? 'No pieces match yet' : 'The marketplace is empty'} text={all.length || API_MODE ? 'Try a different search or clear a few filters.' : 'Be the first to list a piece.'}
                action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />
            )}
          </div>
          {API_MODE && all && nextCursor && (
            <div className="text-center mt-10"><Button variant="secondary" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : 'Load more'}</Button></div>
          )}
        </section>
      </div>
    </div>
  )
}
