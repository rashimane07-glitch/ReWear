import { FILTER_OPTIONS as O } from '../data/listings'

function Group({ title, children }) {
  return <fieldset className="border-t border-plum/15 py-5"><legend className="text-sm font-medium float-left w-full mb-3">{title}</legend><div className="clear-both flex flex-col gap-2">{children}</div></fieldset>
}
function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-[#633B4D] w-4 h-4" />{label}
    </label>
  )
}

// filters shape: { category: [], size: [], condition: [], type: [], maxPrice: number }
export default function FilterSidebar({ filters, setFilters, onClear }) {
  const toggle = (key, value) =>
    setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }))
  return (
    <aside aria-label="Filters">
      <div className="flex justify-between items-baseline mb-4">
        <h2 className="text-2xl">Filters</h2>
        <button onClick={onClear} className="text-xs text-rose underline">Clear all</button>
      </div>
      <Group title="Listing type">{O.types.map(([v, l]) => <Check key={v} label={l} checked={filters.type.includes(v)} onChange={() => toggle('type', v)} />)}</Group>
      <Group title="Category">{O.categories.map((c) => <Check key={c} label={c} checked={filters.category.includes(c)} onChange={() => toggle('category', c)} />)}</Group>
      <Group title="Size">{O.sizes.map((c) => <Check key={c} label={c} checked={filters.size.includes(c)} onChange={() => toggle('size', c)} />)}</Group>
      <Group title="Condition">{O.conditions.map((c) => <Check key={c} label={c} checked={filters.condition.includes(c)} onChange={() => toggle('condition', c)} />)}</Group>
      <div className="border-t border-plum/15 py-5">
        <label htmlFor="price" className="text-sm font-medium block mb-3">Max price: ₹{filters.maxPrice.toLocaleString('en-IN')}</label>
        <input id="price" type="range" min="100" max={O.maxPrice} step="50" value={filters.maxPrice}
          onChange={(e) => setFilters((f) => ({ ...f, maxPrice: Number(e.target.value) }))} className="w-full accent-[#633B4D]" />
        <p className="text-xs text-charcoal/60 mt-1">Applies to items for sale only.</p>
      </div>
    </aside>
  )
}
