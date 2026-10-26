import { ArrowUpRight, Bath, BedDouble, Building2, ChevronDown, House, MapPin, Plus, Search, SlidersHorizontal, Square } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getListingCardImageSource } from '../../services/privateListingService.js'
import { MobileErrorState, MobileLoadingState } from '../../components/mobile-shell/MobileShellStates.jsx'
import './mobile-pages.css'
import './mobile-listings.css'

function ListingPhoto({ item }) {
  const source = getListingCardImageSource(item.coverUrl)
  const [failedSources, setFailedSources] = useState([])
  const src = [source.src, source.fallbackSrc].find((url) => url && !failedSources.includes(url))
  return src ? <img src={src} alt={item.title} loading="lazy" decoding="async" onError={() => setFailedSources((previous) => [...previous, src])} /> : <div className="mobile-listing-photo-empty"><House size={34} strokeWidth={1.2} aria-hidden="true" /><span>No photo yet</span></div>
}
const money = (item) => item.priceOnApplication ? 'Price on application' : Number(item.price) > 0 ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(item.price) : 'Price not recorded'
const stat = (value) => value !== null && value !== undefined && value !== '' ? value : '—'

export default function MobileListingsView({ initialKind = 'sales', rows = [], loading = false, error = null, onRetry, message }) {
  const [tab, setTab] = useState(initialKind === 'rentals' ? 'rentals' : 'sales')
  const [status, setStatus] = useState('active')
  const [query, setQuery] = useState('')
  const [propertyType, setPropertyType] = useState('all')
  const [sort, setSort] = useState('recent')
  const kind = item => item.kind || (item.listingCategory === 'rental' ? 'rentals' : 'sales')
  const types = [...new Set(rows.filter(item => kind(item) === tab).map((row) => row.propertyType).filter(Boolean))].sort()
  const search = query.trim().toLowerCase()
  const filtered = rows.filter((item) => kind(item) === tab && (status === 'all' || item.group === status) && (propertyType === 'all' || item.propertyType === propertyType) && `${item.title} ${item.address} ${item.unitNumber || ''} ${item.statusLabel} ${item.propertyType || ''}`.toLowerCase().includes(search))
  if (sort === 'price-low') filtered.sort((a, b) => (Number(a.price) || Infinity) - (Number(b.price) || Infinity))
  if (sort === 'price-high') filtered.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0))
  return <div className="mobile-pages mobile-listings">
    <div className="mobile-listings-tabs" role="group" aria-label="Listing views">{[['sales', 'Sales'], ['rentals', 'Rentals']].map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => { setTab(key); setPropertyType('all') }}>{label}</button>)}</div>
    <div className="mobile-listings-toolbar"><label className="mobile-pages-search"><Search size={17} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search listings" placeholder="Search address, title or unit" /></label><details className="mobile-listings-filter"><summary aria-label="Listing filters"><SlidersHorizontal size={18} aria-hidden="true" /></summary><div><label>Status<select aria-label="Status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All listings</option><option value="active">Active</option><option value="drafts">Drafts</option></select></label><label>Property type<select aria-label="Property type" value={propertyType} onChange={(event) => setPropertyType(event.target.value)}><option value="all">All property types</option>{types.map((type) => <option key={type}>{type}</option>)}</select></label><label>Sort by<select aria-label="Sort by" value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">Recently updated</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label><button type="button" onClick={() => { setStatus('active'); setPropertyType('all'); setSort('recent'); setQuery('') }}>Reset filters</button></div></details></div>
    <Link className="mobile-listings-create" to={tab === 'rentals' ? '/agent/rentals/listings/new' : '/mobile/listings/new'}><Plus size={19} aria-hidden="true" />Create new listing</Link>
    {message && <p className="mobile-listings-saved" role="status">{message}</p>}
    {(propertyType !== 'all' || status === 'drafts') && <p className="mobile-listings-filter-label">{[status === 'drafts' ? 'Drafts' : '', propertyType !== 'all' ? propertyType : '', `${filtered.length} results`].filter(Boolean).join(' · ')}</p>}
    <section className="mobile-listings-grid" aria-label={tab === 'sales' ? 'Sales listings' : 'Rental listings'} aria-busy={loading}>
      {loading ? <MobileLoadingState label="Loading listings" /> : error ? <MobileErrorState body={error} onRetry={onRetry} /> : filtered.length ? filtered.map((item) => <article className="mobile-property-card" key={item.id}>
        <Link to={kind(item) === 'rentals' ? `/mobile/rentals/listings/${encodeURIComponent(item.id)}` : `/mobile/listings/${encodeURIComponent(item.id)}?tab=overview`} aria-label={`Open listing: ${item.title}`}>
          <div className="mobile-property-photo"><ListingPhoto item={item} /><span className={`mobile-property-status ${item.group === 'drafts' ? 'draft' : ''}`}>{item.statusLabel}</span>{item.unitNumber && <span className="mobile-property-unit">{String(item.unitNumber).match(/^unit\s/i) ? item.unitNumber : `Unit ${item.unitNumber}`}</span>}</div>
          <div className="mobile-property-content"><div className="mobile-property-price"><strong>{money(item)}{kind(item) === 'rentals' && /^(monthly|per_?month|month)$/i.test(item.rentalPriceFrequency || '') ? ' / month' : ''}</strong><ArrowUpRight size={18} aria-hidden="true" /></div><h2>{item.title}</h2>{item.address && <p className="mobile-property-address"><MapPin size={13} aria-hidden="true" /><span>{item.address}</span></p>}<dl className="mobile-property-specs"><div><dt><BedDouble size={16} aria-hidden="true" />Beds</dt><dd>{stat(item.bedrooms)}</dd></div><div><dt><Bath size={16} aria-hidden="true" />Baths</dt><dd>{stat(item.bathrooms)}</dd></div><div><dt><Square size={15} aria-hidden="true" />{item.floorSize ? 'Floor' : 'Erf'}</dt><dd>{item.floorSize || item.erfSize ? `${item.floorSize || item.erfSize} m²` : '—'}</dd></div></dl><div className="mobile-property-footer"><span><Building2 size={13} aria-hidden="true" />{item.propertyType || 'Property'}</span><span>Open listing<ChevronDown size={13} aria-hidden="true" /></span></div></div>
        </Link>
      </article>) : <div className="mobile-pages-empty"><Building2 size={26} strokeWidth={1.5} aria-hidden="true" /><h2>{search || propertyType !== 'all' ? 'No matching listings.' : status === 'drafts' ? 'No draft listings yet.' : status === 'active' ? 'No active listings yet.' : 'No listings yet.'}</h2><p>{search || propertyType !== 'all' ? 'Try another address or reset your filters.' : status === 'drafts' ? 'Create a listing and save your progress as a draft.' : `Your ${tab === 'rentals' ? 'rental' : 'sales'} listings will appear here when they are ready.`}</p></div>}
    </section>
  </div>
}
