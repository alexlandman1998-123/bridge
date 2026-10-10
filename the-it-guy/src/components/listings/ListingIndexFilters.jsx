import { SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { DEFAULT_LISTING_INDEX_FILTERS, getListingIndexFilterKeys, LISTING_INDEX_TABS } from '../../services/listings/listingIndexFilterModel.js'
import { getPropertyCategoryLabel } from '../../lib/propertyTaxonomy.js'

const labels = { collectionView: 'Listing status', location: 'Location', agent: 'Assigned agent', minPrice: 'Min price (R)', maxPrice: 'Max price (R)', propertyType: 'Property type', bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', parking: 'Parking', commercialCategory: 'Category', minArea: 'Min area (m²)', maxArea: 'Max area (m²)', developmentId: 'Development', phase: 'Phase', block: 'Block', availability: 'Unit availability', propertyCategory: 'Property category' }
const fieldClass = 'h-11 w-full min-w-0 rounded-[12px] border border-[#dce6f2] bg-white px-3 text-sm text-[#35546c] focus:border-[#1f7a45] focus:outline-none focus:ring-1 focus:ring-[#1f7a45]'

export function ListingIndexTabs({ value = 'all', counts = {}, onChange }) {
  return <div role="tablist" aria-label="Listing category" className="grid grid-cols-2 gap-1.5 rounded-[18px] border border-[#dbe6f2] bg-[#f5f9fd] p-1.5 sm:grid-cols-4">
    {LISTING_INDEX_TABS.map(tab => <button key={tab.key} type="button" role="tab" aria-selected={value === tab.key} onClick={() => onChange(tab.key)} className={`flex min-h-12 min-w-0 items-center justify-between gap-2 rounded-[12px] border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1f7a45] ${value === tab.key ? 'border-[#1f4f78] bg-[#1f4f78] text-white shadow-sm' : 'border-[#d8e3ef] bg-white text-[#35546c] hover:border-[#b7c8db]'}`}>
      {tab.label}<span className={`rounded-full px-2 py-0.5 text-xs ${value === tab.key ? 'bg-white/20' : 'bg-[#edf4fa] text-[#60758b]'}`}>{counts[tab.key] || 0}</span>
    </button>)}
  </div>
}

export default function ListingIndexFilters({ tab = 'all', value = DEFAULT_LISTING_INDEX_FILTERS, onChange, candidates = [], collectionCounts = {}, search = '', onClearSearch }) {
  const [more, setMore] = useState(false)
  const keys = getListingIndexFilterKeys(tab, value)
  const options = field => {
    const values = new Map()
    candidates.forEach(({ facts }) => {
      const raw = field === 'commercialCategory' || field === 'propertyCategory' ? facts.category : facts[field]
      if (!raw) return
      const label = field === 'developmentId' ? facts.developmentName : field === 'agent' ? facts.agentLabel : field === 'propertyType' ? facts.propertyTypeLabel : field === 'commercialCategory' || field === 'propertyCategory' ? getPropertyCategoryLabel(raw) : raw
      values.set(String(raw), String(label))
    })
    return [...values].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))
  }
  const availableKeys = keys.filter(field => !['phase', 'block', 'availability'].includes(field) || options(field).length || value[field])
  const primaryKeys = ['collectionView', 'location', 'minPrice', 'maxPrice', ...(tab === 'residential' ? ['propertyType', 'bedrooms'] : tab === 'commercial' ? ['commercialCategory', 'minArea'] : tab === 'developments' ? ['developmentId', 'propertyCategory'] : [])]
  const active = availableKeys.filter(field => String(value[field] ?? '') !== String(DEFAULT_LISTING_INDEX_FILTERS[field]))
  const update = (field, next) => onChange({ ...value, [field]: next })
  const displayValue = field => {
    if (field === 'collectionView') return { current: 'Current', archived: 'Previous', review: 'Imported review' }[value[field]]
    const option = options(field).find(item => item.id === String(value[field]))
    return option?.label || (['bedrooms', 'bathrooms', 'parking'].includes(field) ? `${value[field]}+` : value[field])
  }
  return <div className="mb-5 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4" aria-label="Listing filters">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {availableKeys.filter(field => more || primaryKeys.includes(field)).map(field => {
        const select = !['minPrice', 'maxPrice', 'minArea', 'maxArea'].includes(field)
        const choices = field === 'collectionView' ? [{ id: 'current', label: `Current (${collectionCounts.current || 0})` }, { id: 'archived', label: `Previous (${collectionCounts.archived || 0})` }, ...(collectionCounts.review || value.collectionView === 'review' ? [{ id: 'review', label: `Imported review (${collectionCounts.review || 0})` }] : [])] : ['bedrooms', 'bathrooms', 'parking'].includes(field) ? [1, 2, 3, 4, 5].map(number => ({ id: String(number), label: `${number}+` })) : options(field)
        if (select && value[field] && !choices.some(item => item.id === String(value[field]))) choices.push({ id: String(value[field]), label: String(value[field]) })
        return <label key={field} className="grid min-w-0 gap-1.5"><span className="text-xs font-semibold text-[#60758b]">{labels[field]}</span>
          {select ? <select className={fieldClass} value={value[field]} onChange={event => update(field, event.target.value)}>
            {field !== 'collectionView' ? <option value="">All</option> : null}
            {choices.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select> : <input className={fieldClass} type="number" min="0" step="any" placeholder="Any" value={value[field]} onChange={event => update(field, event.target.value)} />}
        </label>
      })}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" aria-expanded={more} onClick={() => setMore(previous => !previous)} className="inline-flex min-h-10 items-center gap-2 rounded-[10px] px-3 text-xs font-semibold text-[#35546c] hover:bg-[#edf4fa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1f7a45]"><SlidersHorizontal size={14} aria-hidden="true" />{more ? 'Fewer filters' : 'More filters'}</button>
      {search ? <button type="button" onClick={onClearSearch} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#dbe6f2] bg-white px-3 text-xs text-[#35546c]">Search: {search}<X size={12} aria-hidden="true" /></button> : null}
      {active.map(field => <button key={field} type="button" aria-label={`Remove ${labels[field]} filter`} onClick={() => update(field, DEFAULT_LISTING_INDEX_FILTERS[field])} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#dbe6f2] bg-white px-3 text-xs text-[#35546c]">{labels[field]}: {displayValue(field)}<X size={12} aria-hidden="true" /></button>)}
      {active.length || search ? <button type="button" onClick={() => { onChange({ ...DEFAULT_LISTING_INDEX_FILTERS }); onClearSearch?.() }} className="min-h-10 px-3 text-xs font-semibold text-[#1f7a45] underline underline-offset-4">Clear filters</button> : null}
    </div>
  </div>
}
