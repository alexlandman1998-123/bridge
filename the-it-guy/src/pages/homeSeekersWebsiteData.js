import { useEffect, useState } from 'react'

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
        if (error.name !== 'AbortError') setState({ listings: [], loading: false, error: error.message })
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
  }
}

export function trackHomeSeekersEvent(eventType, listingId = null) {
  const body = { eventType, path: window.location.pathname, ...(listingId ? { listingId } : {}) }
  const sent = navigator.sendBeacon?.('/api/home-seekers/analytics', new Blob([JSON.stringify(body)], { type: 'application/json' }))
  if (!sent) void fetch('/api/home-seekers/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {})
}

export async function submitHomeSeekersLead(details) {
  const response = await fetch('/api/home-seekers/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...details, pageUrl: window.location.href, idempotencyKey: crypto.randomUUID() }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.accepted !== true) throw new Error(result.error || 'Your enquiry could not be sent.')
  return result
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
