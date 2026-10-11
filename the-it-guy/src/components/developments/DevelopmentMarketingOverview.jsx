import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BarChart3, Building2, CalendarDays, CheckCircle2, Globe2, RefreshCw, Users } from 'lucide-react'
import { ListingStatisticsPanel } from '../listings/ListingChannelStatistics.jsx'
import { loadDevelopmentListingPerformance } from '../../services/developmentListingPerformanceService.js'

const number = new Intl.NumberFormat('en-ZA')
const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 })
const EMPTY_ROWS = []

function ListingCard({ listing, users, onOpen }) {
  const [failedImage, setFailedImage] = useState('')
  const [failedAvatar, setFailedAvatar] = useState('')
  const agent = users.find(user => [user.id, user.userId, user.user_id, user.email].filter(Boolean).some(key => [listing.assignedAgentId, listing.assignedAgentEmail].filter(Boolean).some(value => String(value).toLowerCase() === String(key).toLowerCase())))
  const name = agent?.fullName || agent?.name || listing.assignedAgent
  const email = agent?.email || listing.assignedAgentEmail
  const avatar = agent?.avatarUrl || agent?.avatar_url || listing.assignedAgentAvatarUrl
  const initials = String(name || 'Agent').split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()
  const facts = [['bed', listing.bedrooms], ['bath', listing.bathrooms], ['garage', listing.garages]]
  return (
    <article className="flex w-[310px] max-w-[calc(100vw-64px)] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] border border-[#dce6ee] bg-white shadow-[0_8px_28px_rgba(15,23,42,0.035)] sm:w-[360px] sm:max-w-none">
      <div className="relative h-44 overflow-hidden bg-[#edf3f4] sm:h-48">
        {listing.coverImageUrl && failedImage !== listing.coverImageUrl ? <img src={listing.coverImageUrl} alt={listing.title} onError={() => setFailedImage(listing.coverImageUrl)} loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-[#87a397]"><Building2 size={36} aria-hidden="true" /></div>}
        <span className="absolute left-4 top-4 rounded-full border border-white/60 bg-white/95 px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.09em] text-[#35546c]">{String(listing.status || 'draft').replace(/_/g, ' ')}</span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h4 className="line-clamp-2 min-h-12 text-lg font-semibold leading-6 tracking-[-0.025em] text-[#142132]" title={listing.title}>{listing.title}</h4>
        <p className="mt-2 whitespace-nowrap text-[clamp(1.1rem,2.6vw,1.65rem)] font-semibold tracking-[-0.035em] text-[#24577e]">{listing.price ? currency.format(listing.price) : 'Price pending'}</p>
        <div className="mt-5 grid grid-cols-3 gap-1 rounded-[16px] border border-[#e0e8f0] bg-[#f8fbfd] px-2 py-3 text-center text-xs font-semibold text-[#35546c]">
          {facts.map(([label, value]) => <span key={label}>{value == null ? '—' : number.format(value)} {label}{value === 1 ? '' : 's'}</span>)}
        </div>
        <div className={`mt-4 flex min-h-[82px] flex-col justify-center gap-2 rounded-[16px] border px-4 py-3 ${listing.liveChannels?.length ? 'border-[#d6e7dc] bg-[#f4faf6]' : 'border-[#e6ecf0] bg-[#fafcfd]'}`}>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#5b7b6e]">{listing.liveChannels?.length ? 'Live on' : 'Publication'}</p>
          {listing.liveChannels?.length ? listing.liveChannels.map(channel => <div key={channel.key} className="flex items-center gap-2 text-sm font-semibold text-[#236347]">
            {channel.logoSrc ? <img src={channel.logoSrc} alt="" className="h-5 w-8 object-contain" /> : <Globe2 size={16} aria-hidden="true" />}
            <span>{channel.label}</span><CheckCircle2 size={16} className="ml-auto shrink-0" aria-label="Live" />
          </div>) : <p className="text-sm text-[#718299]">Not published</p>}
        </div>
        <div className="mt-auto pt-5">
          <div className="flex min-w-0 items-center gap-3 border-t border-[#e8eef3] pt-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-[#dfe8ed] bg-[#edf5f0] text-sm font-semibold text-[#446c58]">
              {avatar && failedAvatar !== avatar ? <img src={avatar} alt="" onError={() => setFailedAvatar(avatar)} className="h-full w-full object-cover" /> : initials}
            </span>
            <div className="min-w-0 text-xs text-[#74869a]">
              <p className="truncate text-sm font-semibold text-[#243d56]" title={name}>{name}</p>
              {email ? <p className="mt-1 truncate" title={email}>{email}</p> : null}
              <p className="mt-1 truncate" title={listing.agencyName}>{listing.agencyName}</p>
            </div>
          </div>
          <button type="button" onClick={() => onOpen(listing.id)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#cfdeeb] bg-white text-sm font-semibold text-[#24577e] transition hover:border-[#24577e] hover:bg-[#f4f8fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#238355] focus-visible:ring-offset-2">Open <ArrowRight size={17} aria-hidden="true" /><span className="sr-only"> {listing.title}</span></button>
        </div>
      </div>
    </article>
  )
}

export default function DevelopmentMarketingOverview({ listings = EMPTY_ROWS, organisationUsers = EMPTY_ROWS, onOpenListing }) {
  const [days, setDays] = useState(30)
  const [retry, setRetry] = useState(0)
  const gallery = useRef(null)
  const key = JSON.stringify([days, listings.map(listing => [listing.organisationId, listing.id, listing.updatedAt])])
  const [request, setRequest] = useState({ key: '', retry: -1, loading: true, data: null, error: '' })
  const current = request.key === key ? { ...request, loading: request.retry !== retry, error: request.retry !== retry ? '' : request.error } : { loading: true, data: null, error: '' }
  useEffect(() => {
    const controller = new AbortController()
    loadDevelopmentListingPerformance(listings, days, controller.signal).then(data => {
      if (!controller.signal.aborted) setRequest({ key, retry, loading: false, data, error: '' })
    }).catch(() => {
      if (!controller.signal.aborted) setRequest(previous => ({ key, retry, loading: false, data: previous.key === key ? previous.data : null, error: 'Listing performance could not be loaded.' }))
    })
    return () => controller.abort()
  }, [listings, days, retry, key])
  const data = current.data
  const value = (available, count) => current.loading && !data ? '…' : available ? number.format(count) : '—'
  const cards = [
    { label: 'Total leads', value: value(data?.leadsAvailable, data?.leadCount), meta: !data ? 'Listing-linked buyers' : !data.leadsAvailable ? 'Lead data unavailable' : `${number.format(data.newThisWeek)} new this week${data.leadsComplete ? '' : ' · Partial count'}`, icon: Users },
    { label: 'Viewings', value: value(data?.viewingsAvailable, data?.viewingCount), meta: !data ? 'Across linked listings' : !data.viewingsAvailable ? 'Viewing data unavailable' : `${number.format(data.upcomingViewings)} upcoming${data.viewingsComplete ? '' : ' · Partial count'}`, icon: CalendarDays },
    { label: 'Avg. days on market', value: value(data?.averageDaysOnMarket != null, data?.averageDaysOnMarket), meta: data?.datedListingCount ? `Across ${number.format(data.datedListingCount)} of ${listings.length} listings` : 'Listing dates unavailable', icon: BarChart3 },
  ]
  const scrollGallery = direction => gallery.current?.scrollBy({ left: direction * gallery.current.clientWidth * 0.8, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  return (
    <div className="min-w-0 space-y-6">
      <article className="rounded-[22px] border border-[#e1e7ec] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.035)] sm:p-6">
        <ListingStatisticsPanel data={data} loading={current.loading} error={current.error} days={days} onDaysChange={setDays} onRetry={() => setRetry(value => value + 1)} summaryCards={cards} scopeId="development" />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-5 text-[#718299]">Combined performance across {listings.length} linked listing{listings.length === 1 ? '' : 's'}.{data?.unavailableListingCount ? ` Statistics unavailable for ${data.unavailableListingCount}.` : ''}</p>
          <button type="button" onClick={() => setRetry(value => value + 1)} disabled={current.loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dce6ee] px-4 text-xs font-semibold text-[#35546c] transition hover:bg-[#f8fafb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#238355] disabled:opacity-50"><RefreshCw size={14} className={current.loading ? 'animate-spin' : ''} aria-hidden="true" />Refresh</button>
        </div>
      </article>
      <section aria-label="Current development listings" className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><h3 className="text-lg font-semibold tracking-[-0.025em] text-[#142132]">Current listings</h3><span className="rounded-full border border-[#dbe8e1] bg-[#edf5f0] px-2.5 py-1 text-xs font-semibold text-[#38634e]">{number.format(listings.length)}</span></div>
          {listings.length > 1 ? <div className="flex gap-2">{[[-1, 'Previous listings'], [1, 'Next listings']].map(([direction, label]) => <button key={label} type="button" aria-label={label} onClick={() => scrollGallery(direction)} className="grid h-10 w-10 place-items-center rounded-full border border-[#dce6ee] bg-white text-[#35546c] transition hover:border-[#98b9a7] hover:bg-[#edf5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#238355]">{direction === -1 ? <ArrowLeft size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}</button>)}</div> : null}
        </div>
        {listings.length ? <div ref={gallery} tabIndex={0} aria-label="Scroll linked listings" className="flex snap-x snap-mandatory gap-5 overflow-x-auto rounded-[22px] pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#238355] focus-visible:ring-offset-2">
          {listings.map(listing => <ListingCard key={`${listing.organisationId}:${listing.id}`} listing={listing} users={organisationUsers} onOpen={onOpenListing} />)}
        </div> : <div className="rounded-[22px] border border-dashed border-[#cdded4] bg-[#f7faf8] px-6 py-12 text-center"><Building2 size={28} className="mx-auto text-[#7c9e8c]" aria-hidden="true" /><h4 className="mt-4 text-base font-semibold text-[#243d56]">No linked listings yet</h4><p className="mt-2 text-sm text-[#718299]">Agent listings linked to this development will appear here.</p></div>}
      </section>
    </div>
  )
}
