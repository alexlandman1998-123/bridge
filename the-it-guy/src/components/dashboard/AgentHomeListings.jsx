import { Building2, ChevronLeft, ChevronRight, Eye, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getPrivateListingCoverImageUrls, getListingCardImageSource } from '../../services/privateListingService.js'
import { getListingCardAddressLabel } from '../../services/listings/listingIndexCardPresentation.js'
import { getAgentHomeListingSellerName, loadAgentHomeListingStats } from '../../services/agentHomeListingService.js'

const number = new Intl.NumberFormat('en-ZA')
const EMPTY_LISTINGS = []

function ListingPhoto({ url, address }) {
  const [failed, setFailed] = useState('')
  const source = getListingCardImageSource(url)
  return source.src && failed !== url ? <img src={source.src} alt={address} loading="lazy" decoding="async" className="h-full w-full object-cover" onError={(event) => {
    if (source.fallbackSrc && event.currentTarget.getAttribute('src') !== source.fallbackSrc) event.currentTarget.src = source.fallbackSrc
    else setFailed(url)
  }} /> : <span className="flex h-full flex-col items-center justify-center gap-2 text-[#7992b1]"><Building2 size={32} aria-hidden="true" /><span className="text-xs">Photo unavailable</span></span>
}

export default function AgentHomeListings({ listings = EMPTY_LISTINGS, organisationId = '', loading = false, error = '', onRetry, onViewAll, onOpenListing }) {
  const visible = useMemo(() => listings.filter((listing) => listing.organisationId === organisationId).slice(0, 8), [listings, organisationId])
  const [retry, setRetry] = useState(0)
  const requestKey = `${organisationId}:${visible.map((listing) => `${listing.id}:${listing.updatedAt || ''}`).join(',')}:${retry}`
  const [details, setDetails] = useState({ key: '', stats: {}, covers: {}, loading: true })
  const scroller = useRef(null)
  const current = details.key === requestKey ? details : { stats: {}, covers: {}, loading: true }

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    const initial = { key: requestKey, stats: {}, covers: {}, loading: true }
    if (visible.length) {
      void getPrivateListingCoverImageUrls(visible.map((listing) => listing.id), { thumbnail: true, onCover: (covers) => {
        if (!cancelled) setDetails((previous) => {
          const current = previous.key === requestKey ? previous : initial
          return { ...current, covers: { ...current.covers, ...covers } }
        })
      } }).catch(() => {})
      void loadAgentHomeListingStats({ organisationId, listings: visible, signal: controller.signal }).then((stats) => {
        if (!cancelled) setDetails((previous) => ({ ...(previous.key === requestKey ? previous : initial), stats, loading: false }))
      }).catch(() => {
        if (!cancelled) setDetails((previous) => ({ ...(previous.key === requestKey ? previous : initial), loading: false }))
      })
    }
    return () => { cancelled = true; controller.abort() }
  }, [organisationId, requestKey, visible])

  function scroll(direction) {
    scroller.current?.scrollBy({ left: direction * scroller.current.clientWidth * 0.82, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  return <section className="min-w-0 space-y-4" aria-label="Listings">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-[1.08rem] font-semibold tracking-[-0.02em] text-[#10243a]">Listings</h2><p className="mt-1 text-sm text-[#66768a]">Your active listings · Views over the last 30 days</p></div>
      <button type="button" onClick={onViewAll} className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-[#1f6dd5]">View all listings<ChevronRight size={16} aria-hidden="true" /></button>
    </div>
    {loading ? <p role="status" className="text-sm text-[#66768a]">Loading listings…</p> : error ? <div role="alert" className="rounded-[20px] border border-[#e3ebf4] bg-white p-5 text-sm text-[#66768a]"><p>{error}</p><button type="button" onClick={onRetry} className="mt-2 min-h-9 font-semibold text-[#1f6dd5]">Try again</button></div> : visible.length ? <>
      <div ref={scroller} role="region" aria-label="Scroll through listings" tabIndex={0} className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-3 pt-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1f6dd5]">
        {visible.map((listing) => {
          const address = getListingCardAddressLabel(listing)
          const location = [listing.suburb, listing.city].filter(Boolean).join(', ')
          const stats = current.stats[listing.id] || {}
          const sellerName = stats.sellerName || getAgentHomeListingSellerName(listing)
          const display = (value) => current.loading ? '…' : value == null ? '—' : number.format(value)
          return <button type="button" key={listing.id} onClick={() => onOpenListing?.(listing)} aria-label={`Open listing: ${address}`} className="group flex w-[272px] min-w-[272px] snap-start flex-col overflow-hidden rounded-[24px] border border-[#e2e9f2] bg-white text-left shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition hover:border-[#c8d9ee] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6dd5] sm:w-[284px] sm:min-w-[284px]">
            <span className="block h-[156px] w-full overflow-hidden bg-gradient-to-br from-[#edf4ff] via-[#f8fbff] to-[#e7eefb]"><ListingPhoto url={current.covers[listing.id] || listing.heroImageUrl || ''} address={address} /></span>
            <span className="flex flex-1 flex-col px-4 pt-4">
              <span className="line-clamp-2 min-h-12 text-[1rem] font-semibold leading-6 tracking-[-0.02em] text-[#10243a]" title={address}>{address}</span>
              <span className="mt-1 min-h-5 truncate text-sm text-[#66768a]" title={location}>{location}</span>
              <span className="mb-4 mt-3 truncate text-sm text-[#66768a]" title={`Seller: ${sellerName}`}>Seller: <span className="font-medium text-[#33475d]">{sellerName}</span></span>
              <span className="mt-auto grid grid-cols-2 divide-x divide-[#e3ebf4] border-t border-[#e3ebf4] py-4">
                <span className="pr-3"><span className="flex items-center gap-1.5 text-xs font-medium text-[#66768a]"><Eye size={14} aria-hidden="true" />Views</span><span className="mt-1 block text-[1.4rem] font-semibold tabular-nums text-[#10243a]">{display(stats.views)}</span><span className="mt-1 block text-[10px] text-[#66768a]">{!current.loading && stats.views == null ? 'Unavailable' : stats.partialViews ? 'Partial · 30 days' : 'Last 30 days'}</span></span>
                <span className="pl-3"><span className="flex items-center gap-1.5 text-xs font-medium text-[#66768a]"><Users size={14} aria-hidden="true" />New Leads</span><span className="mt-1 block text-[1.4rem] font-semibold tabular-nums text-[#10243a]">{display(stats.newLeads)}</span><span className="mt-1 block text-[10px] text-[#66768a]">{!current.loading && stats.newLeads == null ? 'Unavailable' : 'In the New stage'}</span></span>
              </span>
            </span>
          </button>
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setRetry((value) => value + 1)} className="min-h-9 text-xs font-semibold text-[#66768a]">Refresh statistics</button>
        {visible.length > 1 ? <div className="flex gap-2"><button type="button" aria-label="Scroll listings left" onClick={() => scroll(-1)} className="grid h-9 w-9 place-items-center rounded-full border border-[#dde5ef] bg-white text-[#10243a]"><ChevronLeft size={17} aria-hidden="true" /></button><button type="button" aria-label="Scroll listings right" onClick={() => scroll(1)} className="grid h-9 w-9 place-items-center rounded-full border border-[#dde5ef] bg-white text-[#10243a]"><ChevronRight size={17} aria-hidden="true" /></button></div> : null}
      </div>
    </> : <div className="rounded-[20px] border border-dashed border-[#d8e2ee] bg-white px-6 py-10 text-center"><p className="font-semibold text-[#1d3146]">No active listings yet.</p><p className="mt-2 text-sm text-[#66768a]">Your active properties will appear here once they’re ready to market.</p></div>}
  </section>
}
