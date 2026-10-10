import { useEffect, useState } from 'react'
import { Eye, Globe, Loader2 } from 'lucide-react'
import { getListingOverviewAnalytics } from '../../services/listings/listingOverviewPerformanceService'

const CHANNELS = [
  { key: 'property24', label: 'Property24', logo: '/lead-sources/property24.png', metrics: [
    ['alerts', 'Alerts'], ['portalContacts', 'Portal contacts'], ['contactForms', 'Contact forms'],
    ['whatsAppContacts', 'WhatsApp forms'], ['phoneContacts', 'Phone contacts'], ['smsContacts', 'SMS contacts'],
  ] },
  { key: 'privateProperty', label: 'Private Property', logo: '/lead-sources/private-property.jpeg', metrics: [
    ['alerts', 'Alerts'], ['messages', 'Messages'], ['phoneContacts', 'Phone contacts'],
  ] },
  { key: 'website', label: 'Website', metrics: [['enquiries', 'Website enquiries']] },
]
const numberFormat = new Intl.NumberFormat('en-ZA')

function hasValue(metric) {
  return metric?.available === true && typeof metric.value === 'number' && Number.isFinite(metric.value) && metric.value >= 0
}

function StatisticsCard({ definition, source, loading, unavailable }) {
  const [failedLogo, setFailedLogo] = useState('')
  const metrics = source?.metrics || {}
  const anyData = Object.values(metrics).some(hasValue)
  const views = metrics.views
  const initialLoading = loading && !source
  const label = initialLoading ? 'Loading…' : (unavailable && !source) || (source?.statisticsUnavailable && !anyData) ? 'Unavailable'
    : anyData ? (source.complete ? 'Views complete' : 'Partial data')
      : source?.published ? (source.lastAttempt ? 'Awaiting statistics' : 'Awaiting first sync') : 'Not published'
  const showLogo = definition.logo && failedLogo !== definition.logo
  const hasNotice = (anyData && source.published === false) || source?.lastAttempt?.failed
  return (
    <article aria-label={`${definition.label} statistics`} className="flex min-w-0 flex-col rounded-[18px] border border-[#e4e9ee] bg-white p-5">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3">
        {showLogo ? (
          <>
            <img src={definition.logo} alt={definition.label} onError={() => setFailedLogo(definition.logo)} className="h-10 w-32 object-contain object-left" />
            <h3 className="sr-only">{definition.label}</h3>
          </>
        ) : (
          <h3 className="inline-flex items-center gap-2.5 text-sm font-semibold text-[#142132]">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f1f6f5] text-[#1b6553]"><Globe size={18} aria-hidden="true" /></span>
            {definition.label}
          </h3>
        )}
        <p className={`rounded-full px-2.5 py-1 text-[0.65rem] font-medium ${label === 'Partial data' ? 'bg-[#fff7e8] text-[#8a5a16]' : label === 'Views complete' ? 'bg-[#edf7f2] text-[#21634f]' : 'bg-[#f3f5f7] text-[#607387]'}`}>{label}</p>
      </div>
      <div className="mt-6">
        <p className="text-xs font-medium text-[#607387]">Views</p>
        <p className="mt-1 break-words text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-[#10243a]">
          {initialLoading ? '…' : hasValue(views) ? numberFormat.format(views.value) : '—'}
        </p>
        {!initialLoading && !hasValue(views) ? <p className="mt-1 text-xs text-[#607387]">Views unavailable</p> : null}
        {definition.key !== 'website' && hasValue(views) ? (
          <p className="mt-1 text-xs text-[#607387]">
            {views.coveredDays} of {views.expectedDays} {source?.listingCount ? 'listing-days' : 'days'} covered{views.complete ? '' : ' · Partial count'}
          </p>
        ) : null}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[#e8eef5] pt-4">
        {definition.metrics.map(([key, title]) => {
          const metric = metrics[key]
          return (
            <div key={key} className="min-w-0">
              <dt className="text-xs leading-5 text-[#607387]">{title}</dt>
              <dd aria-label={!initialLoading && !hasValue(metric) ? `${title} unavailable` : undefined} className={`mt-0.5 text-sm font-semibold ${hasValue(metric) ? 'text-[#243d56]' : 'text-[#91a0ae]'}`}>
                {initialLoading ? '…' : hasValue(metric) ? numberFormat.format(metric.value) : '—'}
                {hasValue(metric) && !metric.complete ? <span className="ml-1 text-[0.65rem] font-medium text-[#8a5a16]"> Partial</span> : null}
              </dd>
            </div>
          )
        })}
      </dl>
      {hasNotice ? <div className="mt-auto space-y-1 pt-5 text-xs leading-5 text-[#607387]">
        {anyData && source.published === false ? <p>Currently not published · Historical activity</p> : null}
        {source?.lastAttempt?.failed ? <p className="text-[#8a5a16]">Latest sync failed.{anyData ? ' Showing saved counts.' : ' Awaiting statistics.'}</p> : null}
      </div> : null}
    </article>
  )
}

export default function ListingChannelStatistics({ organisationId, listingId, refreshKey = '', summaryCards = [] }) {
  const [days, setDays] = useState(30)
  const [retry, setRetry] = useState(0)
  const key = `${organisationId || ''}:${listingId || ''}:${days}`
  const [request, setRequest] = useState({ key: '', loading: true, data: null, error: '' })
  const current = request.key === key ? request : { loading: true, data: null, error: '' }

  useEffect(() => {
    let cancelled = false
    if (!organisationId || !listingId) {
      setRequest({ key, loading: false, data: null, error: 'Channel statistics are unavailable for this listing.' })
      return undefined
    }
    setRequest((previous) => ({ key, loading: true, data: previous.key === key ? previous.data : null, error: '' }))
    async function load() {
      try {
        const data = await getListingOverviewAnalytics({ organisationId, listingId, days })
        // An older reader includes today and lacks metric coverage. Never label
        // those values as the new completed-day period during a staged release.
        if (!data.period?.completedDaysOnly || data.windowDays !== days || !data.period.startDate || !data.period.endDate) throw new Error('Statistics period unavailable')
        if (!cancelled) setRequest({ key, loading: false, data, error: '' })
      } catch {
        if (!cancelled) setRequest((previous) => ({ key, loading: false, data: previous.key === key ? previous.data : null, error: 'Channel statistics could not be loaded.' }))
      }
    }
    void load()
    return () => { cancelled = true }
  }, [organisationId, listingId, days, key, refreshKey, retry])

  return <ListingStatisticsPanel data={current.data} loading={current.loading} error={current.error} days={days} onDaysChange={setDays} onRetry={() => setRetry(value => value + 1)} summaryCards={summaryCards} scopeId={listingId} />
}

export function ListingStatisticsPanel({ data, loading = false, error = '', days = 30, onDaysChange, onRetry, summaryCards = [], scopeId = 'listing' }) {
  const current = { data, loading, error }
  const viewMetrics = CHANNELS.map(({ key: channelKey }) => current.data?.[channelKey]?.metrics?.views)
  const availableViews = viewMetrics.filter(hasValue)
  const totalViews = availableViews.length ? availableViews.reduce((total, metric) => total + metric.value, 0) : null
  const completeViews = viewMetrics.every((metric) => hasValue(metric) && metric.complete)
  const cards = [{
    label: 'Total views',
    value: current.loading && !current.data ? '…' : totalViews === null ? '—' : numberFormat.format(totalViews),
    meta: current.loading && !current.data ? 'Loading views…' : totalViews === null ? 'Views unavailable' : `${completeViews ? 'Across all channels' : 'Partial count'} · ${days} days`,
    icon: Eye,
  }, ...summaryCards]

  return (
    <section aria-label="Listing channel statistics" data-testid="listing-channel-statistics">
      {summaryCards.length ? <div role="group" aria-label="Listing performance summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {cards.map((card, index) => {
          const Icon = card.icon
          return <div key={card.label} className={`flex min-h-[148px] min-w-0 flex-col rounded-[18px] border p-4 sm:p-5 ${index === 0 ? 'border-[#164b3f] bg-[#164b3f] text-white' : 'border-[#e4e9ee] bg-[#f8fafb] text-[#10243a]'}`}>
            <div className="flex items-center justify-between gap-3">
              <p className={`text-xs font-semibold ${index === 0 ? 'text-[#d6eae2]' : 'text-[#607387]'}`}>{card.label}</p>
              <Icon size={17} aria-hidden="true" className={index === 0 ? 'text-[#abd6c4]' : 'text-[#719088]'} />
            </div>
            <p className={`mt-5 text-[2.25rem] font-semibold leading-none tracking-[-0.045em] ${index === 0 ? 'text-white' : 'text-[#10243a]'}`}>{card.value}</p>
            <p className={`mt-3 text-xs leading-5 ${index === 0 ? 'text-[#d6eae2]' : 'text-[#607387]'}`}>{card.meta}</p>
          </div>
        })}
      </div> : null}
      <div aria-busy={current.loading} className={summaryCards.length ? 'mt-6 border-t border-[#e8eef5] pt-5' : ''}>
        <div className="flex items-center justify-start">
          <fieldset className="flex max-w-full gap-1 rounded-xl bg-[#f1f4f5] p-1">
            <legend className="sr-only">Statistics period</legend>
            {[7, 30, 90].map((value) => (
              <label key={value} className="cursor-pointer">
                <input type="radio" name={`channel-statistics-period-${scopeId}`} value={value} checked={days === value} onChange={() => onDaysChange(value)} className="peer sr-only" />
                <span className="inline-flex min-h-9 items-center justify-center rounded-lg px-4 text-xs font-semibold text-[#607387] transition peer-checked:bg-white peer-checked:text-[#174c3f] peer-checked:shadow-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#174c3f]">{value} days</span>
              </label>
            ))}
          </fieldset>
        </div>
        <div aria-live="polite">
          {current.loading ? <p className="mt-3 flex items-center gap-2 text-xs text-[#607387]"><Loader2 size={13} className="animate-spin" aria-hidden="true" />{current.data ? 'Refreshing statistics…' : 'Loading statistics…'}</p> : null}
          {current.error ? (
            <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#f3d7a8] bg-[#fff8ea] px-3 py-2 text-xs text-[#8a5a16]">
              <p>{current.data ? 'Could not refresh statistics. Showing last loaded counts.' : current.error}</p>
              <button type="button" className="min-h-8 font-semibold underline underline-offset-2" onClick={() => onRetry()}>Try again</button>
            </div>
          ) : null}
        </div>
        <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-3">
          {CHANNELS.map((definition) => <StatisticsCard key={definition.key} definition={definition} source={current.data?.[definition.key]} loading={current.loading} unavailable={Boolean(current.error)} />)}
        </div>
      </div>
    </section>
  )
}
