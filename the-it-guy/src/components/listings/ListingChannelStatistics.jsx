import { useEffect, useState } from 'react'
import { BarChart3, Globe, Loader2 } from 'lucide-react'
import { getListingOverviewAnalytics } from '../../services/listings/listingOverviewPerformanceService'

const CHANNELS = [
  { key: 'property24', label: 'Property24', metrics: [
    ['alerts', 'Alerts'], ['portalContacts', 'Portal contacts'], ['contactForms', 'Contact forms'],
    ['whatsAppContacts', 'WhatsApp forms'], ['phoneContacts', 'Phone contacts'], ['smsContacts', 'SMS contacts'],
  ] },
  { key: 'privateProperty', label: 'Private Property', metrics: [
    ['alerts', 'Alerts'], ['messages', 'Messages'], ['phoneContacts', 'Phone contacts'],
  ] },
  { key: 'website', label: 'Website', metrics: [['enquiries', 'Website enquiries']] },
]
const numberFormat = new Intl.NumberFormat('en-ZA')

function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return ''
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''
}

function timestamp(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' }) : ''
}

function hasValue(metric) {
  return metric?.available === true && typeof metric.value === 'number' && Number.isFinite(metric.value) && metric.value >= 0
}

function StatisticsCard({ definition, source, loading, unavailable }) {
  const metrics = source?.metrics || {}
  const anyData = Object.values(metrics).some(hasValue)
  const views = metrics.views
  const initialLoading = loading && !source
  const label = initialLoading ? 'Loading…' : unavailable && !source ? 'Unavailable'
    : anyData ? (source.complete ? 'Views complete' : 'Partial data')
      : source?.published ? (source.lastAttempt ? 'Awaiting statistics' : 'Awaiting first sync') : 'Not published'
  const Icon = definition.key === 'website' ? Globe : BarChart3
  const freshness = timestamp(definition.key === 'website' ? source?.lastTrackedAt : source?.lastSyncedAt)
  return (
    <article aria-label={`${definition.label} statistics`} className="flex min-w-0 flex-col rounded-[14px] border border-[#e0e9f2] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#142132]">{definition.label}</h3>
          <p className={`mt-1 text-xs font-medium ${label === 'Partial data' ? 'text-[#8a5a16]' : 'text-[#607387]'}`}>{label}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-[#dce6f2] bg-[#f7fbff] text-[#42617f]">
          <Icon size={17} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-5">
        <p className="text-xs font-medium text-[#607387]">Views</p>
        <p className="mt-1 break-words text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-[#10243a]">
          {initialLoading ? '…' : hasValue(views) ? numberFormat.format(views.value) : '—'}
        </p>
        {!initialLoading && !hasValue(views) ? <p className="mt-1 text-xs text-[#607387]">Views unavailable</p> : null}
        {definition.key !== 'website' && hasValue(views) ? (
          <p className="mt-1 text-xs text-[#607387]">
            {views.coveredDays} of {views.expectedDays} days covered{views.complete ? '' : ' · Partial count'}
          </p>
        ) : null}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[#e8eef5] pt-4">
        {definition.metrics.map(([key, title]) => {
          const metric = metrics[key]
          return (
            <div key={key} className="min-w-0">
              <dt className="text-xs leading-5 text-[#607387]">{title}</dt>
              <dd className="mt-0.5 text-sm font-semibold text-[#243d56]">
                {initialLoading ? '…' : hasValue(metric) ? numberFormat.format(metric.value) : 'Unavailable'}
                {hasValue(metric) && !metric.complete ? <span className="ml-1 text-[0.65rem] font-medium text-[#8a5a16]"> Partial</span> : null}
              </dd>
            </div>
          )
        })}
      </dl>
      <div className="mt-auto space-y-1 pt-5 text-xs leading-5 text-[#607387]">
        {anyData && source.published === false ? <p>Currently not published · Historical activity</p> : null}
        {source?.lastAttempt?.failed ? <p className="text-[#8a5a16]">Latest sync failed.{anyData ? ' Showing saved counts.' : ' Awaiting statistics.'}</p> : null}
        {definition.key === 'website' ? (
          <>
            <p>Page views may include repeat visits. Continuous tracking coverage is unverified.</p>
            <p>Last tracked activity: {freshness || 'Unavailable'}</p>
          </>
        ) : (
          <>
            <p>Data through: {calendarDate(source?.dataThrough) || 'Unavailable'}</p>
            <p>Last synced: {freshness || 'Unavailable'}</p>
          </>
        )}
      </div>
    </article>
  )
}

export default function ListingChannelStatistics({ organisationId, listingId, refreshKey = '' }) {
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

  return (
    <section aria-label="Listing channel statistics" aria-busy={current.loading} className="mt-5 border-t border-[#e8eef5] pt-5" data-testid="listing-channel-statistics">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#142132]">Channel statistics</h2>
          <p className="mt-1 text-xs leading-5 text-[#607387]">
            {current.data ? `${calendarDate(current.data.period.startDate)} – ${calendarDate(current.data.period.endDate)}` : `Last ${days} completed days`}
          </p>
        </div>
        <fieldset className="flex shrink-0 gap-1 rounded-[10px] border border-[#dce6f2] bg-[#f7fbff] p-1">
          <legend className="sr-only">Statistics period</legend>
          {[7, 30, 90].map((value) => (
            <label key={value} className="cursor-pointer">
              <input type="radio" name={`channel-statistics-period-${listingId}`} value={value} checked={days === value} onChange={() => setDays(value)} className="peer sr-only" />
              <span className="inline-flex min-h-8 items-center justify-center rounded-md px-3 text-xs font-semibold text-[#607387] peer-checked:bg-[#123955] peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#123955]">{value} days</span>
            </label>
          ))}
        </fieldset>
      </div>
      <div aria-live="polite">
        {current.loading ? <p className="mt-3 flex items-center gap-2 text-xs text-[#607387]"><Loader2 size={13} className="animate-spin" aria-hidden="true" />{current.data ? 'Refreshing statistics…' : 'Loading statistics…'}</p> : null}
        {current.error ? (
          <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#f3d7a8] bg-[#fff8ea] px-3 py-2 text-xs text-[#8a5a16]">
            <p>{current.data ? 'Could not refresh statistics. Showing last loaded counts.' : current.error}</p>
            <button type="button" className="min-h-8 font-semibold underline underline-offset-2" onClick={() => setRetry((value) => value + 1)}>Try again</button>
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid items-stretch gap-4 md:grid-cols-3">
        {CHANNELS.map((definition) => <StatisticsCard key={definition.key} definition={definition} source={current.data?.[definition.key]} loading={current.loading} unavailable={Boolean(current.error)} />)}
      </div>
      <p className="mt-3 text-xs leading-5 text-[#607387]">Contacts reflect each channel’s activity and are separate from CRM leads. Dates follow each channel’s reporting calendar.</p>
    </section>
  )
}
