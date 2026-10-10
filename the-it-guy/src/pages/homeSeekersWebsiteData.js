import { useCallback, useEffect, useRef, useState } from 'react'

export function useHomeSeekersWebsiteData() {
  const [state, setState] = useState({ listings: [], loading: true, error: '' })
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/home-seekers/site', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('The current listings could not be loaded.')
        const data = await response.json()
        if (!Array.isArray(data.listings)) throw new Error('The current listings could not be loaded.')
        setState({ listings: data.listings, loading: false, error: '' })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ listings: [], loading: false, error: 'The current listings could not be loaded. Please try again shortly.' })
      })
    return () => controller.abort()
  }, [])
  return state
}

export function formatHomeSeekersPrice(value, transactionType) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return 'Price on request'
  return `R${amount.toLocaleString('en-ZA')}${transactionType === 'rental' ? ' / pm' : ''}`
}

export function homeSeekersCard(listing) {
  return {
    id: listing.id,
    place: listing.suburb || listing.title,
    address: listing.address || listing.title,
    price: formatHomeSeekersPrice(listing.price, listing.transactionType),
    beds: listing.bedrooms || null,
    baths: listing.bathrooms || null,
    cars: listing.parkingBays || null,
    parking: listing.parkingBays || null,
    type: listing.type,
    feature: listing.title,
    description: listing.description,
    image: listing.image,
    transactionType: listing.transactionType,
    listingStatus: listing.listingStatus,
    statusLabel: listing.transactionType === 'rental' ? 'To let' : listing.listingStatus === 'sold' ? 'Sold' : listing.listingStatus === 'under_offer' ? 'Under offer' : 'For sale',
  }
}

export function trackHomeSeekersEvent(eventType, listingId = null) {
  const body = { eventType, path: window.location.pathname, ...(listingId ? { listingId } : {}) }
  const sent = navigator.sendBeacon?.('/api/home-seekers/analytics', new Blob([JSON.stringify(body)], { type: 'application/json' }))
  if (!sent) void fetch('/api/home-seekers/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {})
}

export async function submitHomeSeekersLead(details, { fetcher = fetch, pageUrl = window.location.href, timeoutMs = 20000 } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher('/api/home-seekers/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ ...details, pageUrl, idempotencyKey: details.idempotencyKey || crypto.randomUUID() }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || result.accepted !== true) {
      const error = new Error(result.error || 'Your enquiry could not be sent. Your details are still here; please try again.')
      error.status = response.status
      throw error
    }
    return result
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The connection took too long. Your details are still here; please try again.')
    throw error
  } finally { clearTimeout(timeout) }
}

export function useHomeSeekersLeadSubmission() {
  const attempt = useRef(null)
  const inFlight = useRef(null)
  return useCallback((details) => {
    if (inFlight.current) return inFlight.current
    const signature = JSON.stringify({ ...details, pageUrl: window.location.href })
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() }
    inFlight.current = submitHomeSeekersLead({ ...details, idempotencyKey: attempt.current.key })
      .then((result) => { attempt.current = null; return result })
      .catch((error) => {
        // A definitive rejection (including a rate limit receipt) starts a new
        // attempt next time. Network/5xx failures may have committed a lead,
        // so keep their key until the unchanged enquiry is confirmed.
        if (error.status >= 400 && error.status < 500) attempt.current = null
        throw error
      })
      .finally(() => { inFlight.current = null })
    return inFlight.current
  }, [])
}

export function useHomeSeekersPageTracking(listingId = null) {
  useEffect(() => {
    try {
      if (!sessionStorage.getItem('home-seekers-visit-recorded')) {
        trackHomeSeekersEvent('site_visit')
        sessionStorage.setItem('home-seekers-visit-recorded', '1')
      }
      trackHomeSeekersEvent('page_view')
      if (listingId) trackHomeSeekersEvent('listing_view', listingId)
    } catch {
      // Browsing and enquiry flows continue when analytics storage is unavailable.
    }
  }, [listingId])
}
