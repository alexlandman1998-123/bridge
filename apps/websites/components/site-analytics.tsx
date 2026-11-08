'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { readWebsiteMeasurement, saveWebsiteMeasurement } from '@/lib/measurement'

type EventType = 'site_visit' | 'page_view' | 'listing_view'
function record(eventType: EventType, measurement: ReturnType<typeof readWebsiteMeasurement>, listingId?: string) {
  if (!measurement) return
  const body = JSON.stringify({ eventId: crypto.randomUUID(), eventType, path: window.location.pathname, listingId, measurement })
  const send = () => fetch('/api/analytics', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' })
  // A stable event ID makes this bounded network retry safe at ingestion.
  void (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { if ((await send()).ok) return } catch { /* Retry once with the same event ID. */ }
    }
  })()
}

export function SiteAnalyticsTracker() {
  const pathname = usePathname()
  const previous = useRef('')
  useEffect(() => {
    if (!pathname) return
    const measurement = readWebsiteMeasurement(window, navigator, Date.now(), document.referrer)
    if (!measurement) return
    const key = `${measurement.sessionId}:${pathname}`
    if (previous.current === key) return
    previous.current = key
    // The server deduplicates sessions, so later navigation can recover a
    // session whose first request was lost without counting another visit.
    record('site_visit', measurement)
    if (!measurement.visitRecorded) {
      measurement.visitRecorded = true
      saveWebsiteMeasurement(window, measurement)
    }
    record('page_view', measurement)
  }, [pathname])
  return null
}

export function ListingAnalyticsTracker({ listingId }: { listingId: string }) {
  const previous = useRef('')
  useEffect(() => {
    if (!listingId || previous.current === listingId) return
    const measurement = readWebsiteMeasurement(window, navigator, Date.now(), document.referrer)
    if (!measurement) return
    previous.current = listingId
    record('listing_view', measurement, listingId)
  }, [listingId])
  return null
}
