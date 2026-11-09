import { useEffect, useState } from 'react'
import { BarChart3, CalendarDays, RefreshCw, Users } from 'lucide-react'
import { ListingStatisticsPanel } from '../listings/ListingChannelStatistics.jsx'
import { loadDevelopmentListingPerformance } from '../../services/developmentListingPerformanceService.js'

const number = new Intl.NumberFormat('en-ZA')
const EMPTY_ROWS = []

export default function DevelopmentChannelStatistics({ developmentId, websitePublished, listings = EMPTY_ROWS, includeSummary = false }) {
  const [days, setDays] = useState(30)
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([developmentId, websitePublished, days, listings.map(listing => [listing.organisationId, listing.id, listing.updatedAt])])
  const [request, setRequest] = useState({ key: '', retry: -1, loading: true, data: null, error: '' })
  const current = request.key === key ? { ...request, loading: request.retry !== retry, error: request.retry !== retry ? '' : request.error } : { loading: true, data: null, error: '' }
  useEffect(() => {
    const controller = new AbortController()
    loadDevelopmentListingPerformance(listings, days, controller.signal, { developmentId, websitePublished }).then(data => {
      if (!controller.signal.aborted) setRequest({ key, retry, loading: false, data, error: '' })
    }).catch(() => {
      if (!controller.signal.aborted) setRequest(previous => ({ key, retry, loading: false, data: previous.key === key ? previous.data : null, error: 'Listing performance could not be loaded.' }))
    })
    return () => controller.abort()
  }, [developmentId, websitePublished, listings, days, retry, key])
  const data = current.data
  const value = (available, count) => current.loading && !data ? '…' : available ? number.format(count) : '—'
  const cards = [
    { label: 'Total leads', value: value(data?.leadsAvailable, data?.leadCount), meta: !data ? 'Listing-linked buyers' : !data.leadsAvailable ? 'Lead data unavailable' : `${number.format(data.newThisWeek)} new this week${data.leadsComplete ? '' : ' · Partial count'}`, icon: Users },
    { label: 'Viewings', value: value(data?.viewingsAvailable, data?.viewingCount), meta: !data ? 'Across linked listings' : !data.viewingsAvailable ? 'Viewing data unavailable' : `${number.format(data.upcomingViewings)} upcoming${data.viewingsComplete ? '' : ' · Partial count'}`, icon: CalendarDays },
    { label: 'Avg. days on market', value: value(data?.averageDaysOnMarket != null, data?.averageDaysOnMarket), meta: data?.datedListingCount ? `Across ${number.format(data.datedListingCount)} of ${listings.length} listings` : 'Listing dates unavailable', icon: BarChart3 },
  ]
  return (
    <article className="rounded-[22px] border border-[#e1e7ec] bg-white p-4 shadow-[0_8px_28px_rgba(15,23,42,0.035)] sm:p-6">
      <ListingStatisticsPanel data={data} loading={current.loading} error={current.error} days={days} onDaysChange={setDays} onRetry={() => setRetry(value => value + 1)} summaryCards={includeSummary ? cards : EMPTY_ROWS} scopeId="development" />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-[#718299]">Combined performance across {listings.length} linked listing{listings.length === 1 ? '' : 's'}.{data?.unavailableListingCount ? ` Statistics unavailable for ${data.unavailableListingCount}.` : ''}</p>
        <button type="button" onClick={() => setRetry(value => value + 1)} disabled={current.loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#dce6ee] px-4 text-xs font-semibold text-[#35546c] transition hover:bg-[#f8fafb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#238355] disabled:opacity-50"><RefreshCw size={14} className={current.loading ? 'animate-spin' : ''} aria-hidden="true" />Refresh</button>
      </div>
    </article>
  )
}
