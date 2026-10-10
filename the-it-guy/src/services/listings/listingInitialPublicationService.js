import { supabase } from '../../lib/supabaseClient'

const CHANNELS = { property24: 'Property24', private_property: 'Private Property', agency_website: 'Agency Website' }
export const INITIAL_LISTING_PUBLICATION_EVENT = 'itg:initial-listing-publication'
const latestResults = new Map()
const expectedUpdates = new Map()
export function readInitialListingChannelResults(listingId) { return latestResults.get(listingId) || [] }
function updateResults(listingId, results, merge = false) {
  if (merge) results = [...readInitialListingChannelResults(listingId).filter(row => !results.some(next => next.key === row.key)), ...results]
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
    retryable: ['failed', 'cancelled'].includes(job.state),
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
  if (action === 'update' && requestKey) {
    const expected = expectedUpdates.get(listingId) || new Map()
    selected.forEach(key => expected.set(key, { requestKey, pending: true }))
    expectedUpdates.set(listingId, expected)
  }
  updateResults(listingId, selected.map(key => ({ key, label: CHANNELS[key], status: 'publishing', message: 'Saving publishing request…' })), true)
  try {
    const session = await client.auth.getSession()
    const token = session.data?.session?.access_token
    if (session.error || !token) throw new Error('Sign in again to queue this saved listing.')
    const response = await request('/api/listings/publication-jobs', { method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ listingId, channels: selected, ...(action === 'update' ? { action, requestKey } : {}) }),
    })
    const payload = await response.json()
    if (!response.ok || !Array.isArray(payload.jobs) || selected.some(key => !payload.jobs.some(job => job.channel === key))) {
      throw new Error(payload.message || 'The publishing request could not be confirmed. Check status before sending again.')
    }
    const results = mapPublicationJobs(payload.jobs)
    const expected = expectedUpdates.get(listingId)
    selected.forEach(key => { if (expected?.has(key)) expected.set(key, { requestKey, acknowledged: true }) })
    updateResults(listingId, results, true)
    results.forEach(result => onResult?.(result))
    return results
  } catch (error) {
    if (action === 'update' && requestKey) {
      const expected = expectedUpdates.get(listingId) || new Map()
      selected.forEach(key => expected.set(key, { requestKey }))
      expectedUpdates.set(listingId, expected)
    }
    updateResults(listingId, selected.map(key => ({ key, label: CHANNELS[key], status: 'uncertain', retryable: false, message: error.message })), true)
    // Never fall back to a direct provider call after an ambiguous queue response.
    throw error
  }
}

export async function refreshListingPublicationResults(listingId, { client = supabase, shouldApply = () => true } = {}) {
  if (!listingId || !client) throw new Error('Sign in to check publishing status.')
  const { data, error } = await client.from('listing_publication_jobs').select('id,channel,state,message,update_request_key').eq('listing_id', listingId)
  if (error) throw error
  if (!shouldApply()) return []
  const results = mapPublicationJobs(data || [])
  // A receipt for an older update cannot confirm a request whose response was
  // lost. Match the durable request key before treating it as the new result.
  for (const [key, expected] of expectedUpdates.get(listingId) || []) {
    const job = data?.find(row => row.channel === key)
    if (job?.update_request_key === expected.requestKey) { expectedUpdates.get(listingId).delete(key); continue }
    const row = { key, label: CHANNELS[key], status: job && ['queued', 'processing', 'dispatching', 'uncertain'].includes(job.state) ? 'uncertain' : 'needs_attention', retryable: false,
      message: job && ['queued', 'processing', 'dispatching', 'uncertain'].includes(job.state) ? 'The previous request must finish or be checked before sending these changes.' : 'These saved changes were not queued. Send them from Review.' }
    const next = expected.pending || expected.acknowledged ? readInitialListingChannelResults(listingId).find(result => result.key === key) || row : row
    const index = results.findIndex(result => result.key === key)
    if (index < 0) results.push(next)
    else results[index] = next
  }
  updateResults(listingId, results)
  return results
}

// Re-read durable receipts before retrying. Successful, pending and unconfirmed
// requests must never be replayed as part of a failed-channel retry.
export async function retryFailedListingChannels({ listingId, listingStatus, channels = [], requestKey }, dependencies = {}) {
  const results = await refreshListingPublicationResults(listingId, dependencies)
  const failed = results.filter(row => row.retryable && channels.includes(row.key)).map(row => row.key)
  if (!failed.length) return []
  return publishInitialListingChannels({ listingId, listingStatus, channels: failed, action: 'update', requestKey }, dependencies)
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
      const results = await refreshListingPublicationResults(listingId, { client, shouldApply: () => !stopped })
      if (stopped) return
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
