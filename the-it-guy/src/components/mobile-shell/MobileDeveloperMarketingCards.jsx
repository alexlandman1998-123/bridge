import { useEffect, useState } from 'react'
import { loadMobileDeveloperMarketing } from '../../services/mobileDeveloperMarketingService.js'
import './mobile-developer-marketing.css'

const channels = [
  { key: 'property24', label: 'P24', detail: 'Completed days', metric: 'alerts', metricLabel: 'Alerts' },
  { key: 'website', label: 'Website', detail: 'Includes today', metric: 'enquiries', metricLabel: 'Enquiry starts' },
  { key: 'privateProperty', label: 'Private Property', detail: 'Completed days', metric: 'messages', metricLabel: 'Messages' },
]
const number = new Intl.NumberFormat('en-ZA')
export default function MobileDeveloperMarketingCards({ developmentIds = [], organisationId, refreshKey = '' }) {
  const scope = JSON.stringify([organisationId, [...new Set(developmentIds)].filter(Boolean).sort(), refreshKey])
  const [request, setRequest] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    const [, ids] = JSON.parse(scope)
    loadMobileDeveloperMarketing(ids, controller.signal).then(data => {
      if (!controller.signal.aborted) setRequest({ scope, data })
    }).catch(() => { if (!controller.signal.aborted) setRequest({ scope, error: true }) })
    return () => controller.abort()
  }, [scope])
  const current = request?.scope === scope ? request : null
  const value = metric => !current ? '…' : metric?.available ? number.format(metric.value) : '—'
  return <section className="mobile-developer-marketing" aria-label="Marketing statistics">
    <header><h2>Marketing</h2><span>Last 30 days</span></header>
    <div className="mobile-developer-marketing-track" role="region" aria-label="Swipe through P24, Website and Private Property statistics" tabIndex={0}>
      {channels.map(channel => {
        const source = current?.data?.[channel.key]
        return <article className="mobile-developer-marketing-card" key={channel.key} aria-label={`${channel.label} statistics`}>
          <h3>{channel.label}</h3><span className="mobile-developer-marketing-period">{channel.detail}</span>
          <strong>{value(source?.metrics?.views)}</strong><span>Views</span>
          <p>{channel.metricLabel}<b>{value(source?.metrics?.[channel.metric])}</b></p>
          {current && !source?.metrics?.views?.available ? <small>{source?.lastAttempt && !source.lastAttempt.failed ? 'Awaiting statistics' : 'Statistics unavailable'}</small> : source?.metrics?.views?.available && !source.metrics.views.complete ? <small>Partial tracked activity</small> : null}
        </article>
      })}
    </div>
  </section>
}
