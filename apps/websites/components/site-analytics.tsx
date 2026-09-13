'use client'

import { useEffect } from 'react'

type EventType = 'site_visit' | 'page_view' | 'listing_view'

function trackingDisabled() {
  return typeof navigator !== 'undefined' && (navigator.doNotTrack === '1' || (window as typeof window & { doNotTrack?: string }).doNotTrack === '1')
}

function record(eventType: EventType, listingId?: string) {
  if (trackingDisabled()) return
  const body = JSON.stringify({ eventType, path: window.location.pathname, listingId })
  void fetch('/api/analytics', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => null)
}

export function SiteAnalyticsTracker() {
  useEffect(() => {
    if (trackingDisabled()) return
    const key = 'arch9-website-visit-recorded'
    if (!window.sessionStorage.getItem(key)) {
      window.sessionStorage.setItem(key, '1')
      record('site_visit')
    }
    record('page_view')
  }, [])
  return null
}

export function ListingAnalyticsTracker({ listingId }: { listingId: string }) {
  useEffect(() => { if (listingId) record('listing_view', listingId) }, [listingId])
  return null
}
