import { useEffect, useRef } from 'react'

const CLIENT_PORTAL_METRICS_EVENT = 'arch9:client-portal-launch-metrics'

function publishMetrics(metrics) {
  if (typeof window === 'undefined') return
  window.__arch9ClientPortalLaunchMetrics = Object.freeze({ ...metrics })
  document.documentElement.dataset.clientPortalLaunchMetrics = JSON.stringify(window.__arch9ClientPortalLaunchMetrics)
  window.dispatchEvent(new CustomEvent(CLIENT_PORTAL_METRICS_EVENT, { detail: window.__arch9ClientPortalLaunchMetrics }))
}

export default function useClientPortalLaunchMetrics({ persona = 'buyer', ready = false } = {}) {
  const metricsRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof performance === 'undefined') return undefined

    const navigation = performance.getEntriesByType('navigation')[0]
    const metrics = {
      contract: 'arch9-client-portal-launch-metrics-v1',
      persona: persona === 'seller' ? 'seller' : 'buyer',
      route: persona === 'seller' ? '/client/:token/selling' : '/demo/:token/buyer',
      navigationType: navigation?.type || 'navigate',
      usefulContentMs: null,
      largestContentfulPaintMs: null,
      cumulativeLayoutShift: 0,
      capturedAt: new Date().toISOString(),
    }
    metricsRef.current = metrics
    publishMetrics(metrics)

    const observers = []
    if (typeof PerformanceObserver !== 'undefined') {
      const supported = PerformanceObserver.supportedEntryTypes || []
      if (supported.includes('largest-contentful-paint')) {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries()
          const last = entries[entries.length - 1]
          if (last) {
            metrics.largestContentfulPaintMs = Math.round(last.startTime)
            publishMetrics(metrics)
          }
        })
        observer.observe({ type: 'largest-contentful-paint', buffered: true })
        observers.push(observer)
      }
      if (supported.includes('layout-shift')) {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) metrics.cumulativeLayoutShift += entry.value
          }
          metrics.cumulativeLayoutShift = Number(metrics.cumulativeLayoutShift.toFixed(4))
          publishMetrics(metrics)
        })
        observer.observe({ type: 'layout-shift', buffered: true })
        observers.push(observer)
      }
    }

    return () => {
      observers.forEach((observer) => observer.disconnect())
      metricsRef.current = null
    }
  }, [persona])

  useEffect(() => {
    if (!ready || !metricsRef.current || metricsRef.current.usefulContentMs !== null) return
    const frameId = window.requestAnimationFrame(() => {
      if (!metricsRef.current) return
      metricsRef.current.usefulContentMs = Math.round(performance.now())
      metricsRef.current.capturedAt = new Date().toISOString()
      publishMetrics(metricsRef.current)
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [ready])
}

export { CLIENT_PORTAL_METRICS_EVENT }
