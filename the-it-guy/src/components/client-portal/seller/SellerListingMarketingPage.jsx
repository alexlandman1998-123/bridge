import { useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ExternalLink, Megaphone } from 'lucide-react'
import SellerPropertyGallery from './SellerPropertyGallery.jsx'
import { buildSellerPublicationCards } from './sellerMarketingModel.js'
import { getListingOverviewDaysOnMarket, resolveListingOverviewMarketStartDate } from '../../../services/listings/listingOverviewPerformanceService.js'

const currency = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value)

function PropertyDescription({ description }) {
  const id = useId()
  const content = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  useLayoutEffect(() => {
    const element = content.current
    const measure = () => setOverflows(element.scrollHeight > 112)
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [description])
  return (
    <>
      <p ref={content} id={id} tabIndex={expanded ? 0 : undefined} className={`mt-3 whitespace-pre-line break-words text-sm leading-7 text-[#52647a] ${expanded ? 'max-h-80 overflow-y-auto pr-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#123f3a]' : 'max-h-28 overflow-hidden'}`}>{description || 'Your agent has not shared the listing description yet.'}</p>
      {overflows ? <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded((value) => !value)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-[#123f3a] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#123f3a]">{expanded ? 'See less' : 'See more'}<ChevronDown size={16} className={expanded ? 'rotate-180' : ''} /></button> : null}
    </>
  )
}

export default function SellerListingMarketingPage({ listing = {}, channels = [], channelLeads = null }) {
  const cards = buildSellerPublicationCards(channels, channelLeads)
  const facts = [[listing.bedrooms, 'Bedrooms'], [listing.bathrooms, 'Bathrooms'], [listing.parkingBays, 'Parking bays'], [listing.floorSize, 'm² floor area'], [listing.erfSize, 'm² land area']].filter(([value]) => Number(value) > 0)
  const marketDate = resolveListingOverviewMarketStartDate(listing, listing)
  const validMarketDate = marketDate && Number.isFinite(new Date(marketDate).getTime())
  const glance = [
    ['Property type', String(listing.propertyType || '').replaceAll('_', ' ')],
    ['Listed on', validMarketDate ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(marketDate)) : ''],
    ['Days on market', validMarketDate ? String(getListingOverviewDaysOnMarket(marketDate)) : ''],
  ].filter(([, value]) => value)
  return (
    <section aria-label="Listing and marketing" className="space-y-5">
      <section aria-label="Listing publication platforms">
        {cards.some((card) => card.leadCount === null) ? <p className="mb-3 text-xs leading-5 text-[#64748b] sm:hidden">A dash means lead tracking is unavailable.</p> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => <article key={card.id} className="flex min-w-0 flex-col rounded-[18px] border border-[#dbe5ef] bg-white p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#e4ebf2] bg-[#f8fafc] p-2">{card.logoUrl ? <img src={card.logoUrl} alt="" className="h-full w-full object-contain" /> : <Megaphone size={22} className="text-[#123f3a]" />}</span>
              <div className="min-w-0"><h2 className="break-words text-base font-semibold text-[#102032]">{card.label}</h2><p className={`mt-1 text-xs ${card.href ? 'text-[#047857]' : 'text-[#64748b]'}`}>{card.href ? card.status || 'Live link shared' : 'No shared listing link'}</p></div>
            </div>
            <dl className="my-3 border-y border-[#e4ebf2] py-3 sm:my-5 sm:py-4"><div className="flex items-center justify-between gap-3"><dt className="text-sm text-[#64748b]">Attributed leads</dt><dd className="text-2xl font-semibold text-[#123f3a]">{card.leadCount === null ? '—' : card.leadCount}</dd></div></dl>
            {card.leadCount === null ? <p className="mb-3 hidden text-xs leading-5 sm:block text-[#64748b]">Lead tracking is not available for this platform yet.</p> : null}
            {card.href ? <a href={card.href} target="_blank" rel="noopener noreferrer" aria-label={`View listing on ${card.label}`} className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#123f3a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b312d]">View live listing <ExternalLink size={15} /></a> : <p className="mt-auto hidden text-xs leading-5 sm:block text-[#64748b]">A live link will appear here once your agent shares it.</p>}
          </article>)}
        </div>
      </section>

      <div className={`relative overflow-hidden rounded-[20px] border border-[#dbe5ef] bg-white ${listing.images?.length ? 'h-[330px] sm:h-[480px] xl:h-[540px]' : 'h-[250px] sm:h-[300px]'}`}>
        <SellerPropertyGallery images={listing.images || []} propertyTitle={listing.title} showThumbnails />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)]">
        <article className="min-w-0 rounded-[20px] border border-[#dbe5ef] bg-white p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">Listing details</p>
          <h1 className="mt-2 break-words text-2xl font-semibold leading-tight tracking-[-0.04em] text-[#102032] sm:text-3xl">{listing.headline || listing.title || 'Your property'}</h1>
          {listing.headline && listing.headline !== listing.title ? <p className="mt-2 text-sm leading-6 text-[#64748b]">{listing.title}</p> : null}
          {facts.length ? <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-y border-[#e4ebf2] py-5 sm:[grid-template-columns:repeat(var(--fact-count),minmax(0,1fr))]" style={{ '--fact-count': facts.length }}>{facts.map(([value, label]) => <div key={label} className="min-w-0"><dt className="text-xs text-[#64748b]">{label}</dt><dd className="mt-1 text-lg font-semibold text-[#123f3a]">{value}</dd></div>)}</dl> : null}
          <h2 className="mt-6 text-base font-semibold text-[#102032]">About the property</h2>
          <PropertyDescription key={listing.description || ''} description={listing.description} />
        </article>
        <div className="space-y-4">
        <aside aria-label="Asking price" className="rounded-[20px] bg-[#123f3a] p-6 text-white sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">Asking price</p>
          <p className="mt-3 break-words text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">{listing.priceOnApplication ? 'Price on application' : Number(listing.askingPrice) > 0 ? currency(listing.askingPrice) : 'Price not yet shared'}</p>
        </aside>
        {glance.length ? <aside aria-label="Listing at a glance" className="rounded-[20px] border border-[#dbe5ef] bg-white p-5 sm:p-6">
          <h2 className="text-base font-semibold text-[#102032]">Listing at a glance</h2>
          <dl className="mt-4 divide-y divide-[#e4ebf2]">{glance.map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"><dt className="text-sm text-[#64748b]">{label}</dt><dd className="text-right text-sm font-semibold capitalize text-[#123f3a]">{value}</dd></div>)}</dl>
        </aside> : null}
        </div>
      </div>


    </section>
  )
}
