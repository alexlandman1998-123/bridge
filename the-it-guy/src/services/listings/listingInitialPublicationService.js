import { supabase } from '../../lib/supabaseClient'

const CHANNELS = { property24: 'Property24', private_property: 'Private Property', agency_website: 'Agency Website' }
export const INITIAL_LISTING_PUBLICATION_EVENT = 'itg:initial-listing-publication'
const latestResults = new Map()
export function readInitialListingChannelResults(listingId) { return latestResults.get(listingId) || [] }
function updateResults(listingId, results) {
  latestResults.set(listingId, results)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(INITIAL_LISTING_PUBLICATION_EVENT, { detail: { listingId, results } }))
}
export function getInitialProperty24Expiry(now = new Date()) {
  const expiry = new Date(now); expiry.setUTCDate(expiry.getUTCDate() + 90)
  return expiry.toISOString().slice(0, 10)
}
export function mapPublicationJobs(jobs = []) {
  return jobs.map(job => ({ key: job.channel, label: CHANNELS[job.channel] || job.channel, jobId: job.id,
    status: ['queued', 'processing', 'dispatching'].includes(job.state) ? 'publishing' : job.state === 'accepted' ? 'submitted' : job.state === 'uncertain' ? 'uncertain' : 'needs_attention',
    message: job.message,
  }))
}

// Await only durable acceptance. Publication belongs to the server after this
// returns, including after a tab closes or a login token expires.
export async function publishInitialListingChannels({ listingId, channels = [], listingStatus, onResult, action, requestKey }, dependencies = {}) {
  if (!listingId) throw new Error('Save the listing before publishing.')
  if (!['active', 'under_offer'].includes(listingStatus)) return []
  const selected = [...new Set(channels)].filter(key => CHANNELS[key])
  if (!selected.length) return []
  const client = dependencies.client || supabase
  const request = dependencies.fetch || globalThis.fetch
  updateResults(listingId, selected.map(key => ({ key, label: CHANNELS[key], status: 'publishing', message: 'Saving publishing request…' })))
  try {
    const session = await client.auth.getSession()
    const token = session.data?.session?.access_token
    if (session.error || !token) throw new Error('Sign in again to queue this saved listing.')
    const response = await request('/api/listings/publication-jobs', { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId, channels: selected, ...(action === 'update' ? { action, requestKey } : {}) }),
    })
    const payload = await response.json()
    if (!response.ok || !Array.isArray(payload.jobs) || selected.some(key => !payload.jobs.some(job => job.channel === key))) {
      throw new Error(payload.message || 'The publishing request could not be confirmed. Retry to check the same saved listing.')
    }
    const results = mapPublicationJobs(payload.jobs)
    updateResults(listingId, results)
    results.forEach(result => onResult?.(result))
    return results
  } catch (error) {
    updateResults(listingId, selected.map(key => ({ key, label: CHANNELS[key], status: 'needs_attention', message: error.message })))
    // Never fall back to a direct provider call after an ambiguous queue response.
    throw error
  }
}

// Resume receipts from the server on a full reload, not just SPA navigation.
// Poll only while a job is pending; hidden tabs do no status work.
export function watchInitialListingPublication(listingId, { client = supabase, interval = 2500 } = {}) {
  let stopped = false, timer, hadPending = false
  async function refresh() {
    clearTimeout(timer)
    if (stopped || !listingId || !client) return
    if (typeof document !== 'undefined' && document.hidden) { timer = setTimeout(refresh, interval); return }
    try {
      const { data, error } = await client.from('listing_publication_jobs').select('id,channel,state,message').eq('listing_id', listingId)
      if (stopped) return
      if (error) throw error
      const results = mapPublicationJobs(data || [])
      updateResults(listingId, results)
      const pending = results.some(row => row.status === 'publishing')
      if (hadPending && !pending && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('itg:listings-updated', { detail: { listingId } }))
      hadPending = pending
      if (pending) timer = setTimeout(refresh, interval)
    } catch { if (!stopped) timer = setTimeout(refresh, interval * 4) }
  }
  void refresh()
  const visibility = () => { if (!document.hidden) void refresh() }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility)
  return () => { stopped = true; clearTimeout(timer); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility) }
}
