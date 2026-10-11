import { useEffect, useState } from 'react'
import { fetchDevelopmentVisualAnalytics } from '../../lib/developmentDetailApi'
import { buildHarbourHeightsWebsiteAnalyticsDemo, isHarbourHeightsAnalyticsDemo } from '../../core/developments/harbourHeightsWebsiteAnalyticsDemo'
import DevelopmentWebsiteAnalyticsDashboard from './DevelopmentWebsiteAnalyticsDashboard'

export default function DevelopmentWebsiteAnalytics({ development, loadAnalytics = fetchDevelopmentVisualAnalytics }) {
  const hasDemo = isHarbourHeightsAnalyticsDemo(development)
  const [source, setSource] = useState(hasDemo ? 'demo' : 'tracked')
  const [days, setDays] = useState(30)
  const [refresh, setRefresh] = useState(0)
  const key = `${development.id}:${days}:${refresh}`
  const [request, setRequest] = useState({ key: '', data: null, loading: true, error: '' })

  useEffect(() => {
    if (source === 'demo') return
    let cancelled = false
    Promise.resolve().then(() => loadAnalytics(development.id, { days })).then(data => {
      if (!cancelled) setRequest({ key, data, loading: false, error: '' })
    }).catch(() => {
      if (!cancelled) setRequest({ key, data: null, loading: false, error: 'Website activity could not be loaded. Try refreshing.' })
    })
    return () => { cancelled = true }
  }, [development.id, days, refresh, key, source, loadAnalytics])

  const isDemo = source === 'demo' && hasDemo
  const current = request.key === key ? request : { data: null, loading: true, error: '' }
  return <DevelopmentWebsiteAnalyticsDashboard
    analytics={isDemo ? buildHarbourHeightsWebsiteAnalyticsDemo(days) : current.data}
    days={days} onDaysChange={setDays} onRefresh={() => setRefresh(value => value + 1)}
    loading={!isDemo && current.loading} error={!isDemo ? current.error : ''}
    isDemo={isDemo} hasDemo={hasDemo} onSourceChange={next => { setSource(next); setRefresh(value => value + 1) }}
  />
}
