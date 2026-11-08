import { supabase } from '../lib/supabaseClient.js'
import { getListingOverviewAnalytics } from './listings/listingOverviewPerformanceService.js'
import { aggregateDevelopmentListingPerformance } from '../core/developments/developmentListingPerformance.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const metric = (values, expected) => {
  const valid = values.filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
  return { available: valid.length > 0, value: valid.length ? valid.reduce((sum, value) => sum + value, 0) : null, complete: valid.length === expected }
}

export async function loadMobileDeveloperMarketing(developmentIds, signal, { client = supabase, readListing = getListingOverviewAnalytics } = {}) {
  const ids = [...new Set(developmentIds.filter(id => UUID.test(id || '')))]
  if (!client || !ids.length) return null
  const listings = []
  for (let offset = 0; ; offset += 1000) {
    const response = await client.from('private_listings').select('id,organisation_id').in('development_id', ids)
      .order('id').range(offset, offset + 999).abortSignal(signal)
    if (response.error) throw response.error
    listings.push(...(response.data || []).map(row => ({ id: row.id, organisationId: row.organisation_id })))
    if ((response.data || []).length < 1000) break
  }
  const snapshots = []
  for (let offset = 0; offset < listings.length; offset += 4) {
    snapshots.push(...await Promise.all(listings.slice(offset, offset + 4).map(async listing => {
      try { return { ...listing, data: await readListing({ organisationId: listing.organisationId, listingId: listing.id, days: 30, signal }) } }
      catch { return { ...listing, data: null } }
    })))
  }
  const summaries = []
  for (let offset = 0; offset < ids.length; offset += 4) {
    summaries.push(...await Promise.all(ids.slice(offset, offset + 4).map(async id => {
      try {
        const response = await client.rpc('get_development_visual_analytics', { requested_development_id: id, requested_days: 30 }).abortSignal(signal)
        return response.error ? null : response.data?.summary
      } catch { return null }
    })))
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const result = aggregateDevelopmentListingPerformance({ listings, snapshots, days: 30 })
  result.website = { metrics: { views: metric(summaries.map(row => row?.sceneViews), ids.length), enquiries: metric(summaries.map(row => row?.enquiries), ids.length) } }
  return result
}

export function recentDeveloperLeads(leads = [], now = Date.now()) {
  const cutoff = now - 30 * 86_400_000
  return leads.filter(lead => {
    const created = Date.parse(lead.createdAt || lead.created_at || '')
    return Number.isFinite(created) && created >= cutoff && created <= now
  })
}
