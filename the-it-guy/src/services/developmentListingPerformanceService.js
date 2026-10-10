import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'
import { getListingOverviewAnalytics } from './listings/listingOverviewPerformanceService.js'
import { aggregateDevelopmentListingPerformance } from '../core/developments/developmentListingPerformance.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function readAll(buildQuery, signal) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const result = await buildQuery().range(offset, offset + 999).abortSignal(signal)
    if (result.error) throw result.error
    rows.push(...(result.data || []))
    if ((result.data || []).length < 1000) return rows
  }
}

export async function loadDevelopmentListingPerformance(listings, days, signal) {
  const unique = [...new Map(listings.map(listing => [`${listing.organisationId}:${listing.id}`, listing])).values()]
  const snapshots = new Array(unique.length)
  let next = 0
  // Bound requests when a development has many listings across several agents.
  await Promise.all(Array.from({ length: Math.min(4, unique.length) }, async () => {
    while (next < unique.length && !signal?.aborted) {
      const index = next++
      const listing = unique[index]
      try {
        if (!isSupabaseConfigured || !UUID.test(listing.organisationId || '') || !UUID.test(listing.id || '')) throw new Error('Listing scope unavailable')
        const data = await getListingOverviewAnalytics({ organisationId: listing.organisationId, listingId: listing.id, days, signal })
        if (!data.period?.completedDaysOnly || data.windowDays !== days || !data.period.startDate || !data.period.endDate) throw new Error('Statistics period unavailable')
        snapshots[index] = { id: listing.id, organisationId: listing.organisationId, data }
      } catch {
        snapshots[index] = { id: listing.id, organisationId: listing.organisationId, data: null }
      }
    }
  }))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const groups = new Map()
  unique.forEach(listing => {
    if (!UUID.test(listing.organisationId || '') || !UUID.test(listing.id || '')) return
    const ids = groups.get(listing.organisationId) || []
    ids.push(listing.id)
    groups.set(listing.organisationId, ids)
  })
  const leadBatches = [], viewingBatches = []
  for (const [organisationId, ids] of groups) {
    // The existing analytics RPC verifies membership and listing ownership.
    // Do not use a developer's organisation in place of the listing's owner.
    if (!snapshots.some(snapshot => snapshot.organisationId === organisationId && snapshot.data)) {
      leadBatches.push({ organisationId, rows: [], error: true })
      viewingBatches.push({ organisationId, rows: [], error: true })
      continue
    }
    const leadRows = [], viewingRows = []
    let leadError = false, viewingError = false, leadAvailable = false
    for (let offset = 0; offset < ids.length; offset += 100) {
      const chunk = ids.slice(offset, offset + 100)
      const results = await Promise.allSettled([
        readAll(() => supabase.from('lead_listing_interests').select('id,lead_id,contact_id,created_at').eq('organisation_id', organisationId).in('listing_id', chunk).order('id'), signal),
        readAll(() => supabase.from('leads').select('lead_id,contact_id,created_at').eq('organisation_id', organisationId).ilike('lead_category', 'buyer').or(`listing_id.in.(${chunk.join(',')}),enquired_listing_id.in.(${chunk.join(',')})`).order('lead_id'), signal),
        readAll(() => supabase.from('appointments').select('appointment_id,appointment_type,status,date_time,appointment_date,start_time,archived_at').eq('organisation_id', organisationId).in('listing_id', chunk).order('appointment_id'), signal),
      ])
      results.slice(0, 2).forEach(result => {
        if (result.status === 'fulfilled') { leadRows.push(...result.value); leadAvailable = true }
        else leadError = true
      })
      if (results[2].status === 'fulfilled') viewingRows.push(...results[2].value)
      else viewingError = true
    }
    leadBatches.push({ organisationId, rows: leadRows, error: leadError, available: leadAvailable })
    viewingBatches.push({ organisationId, rows: viewingRows, error: viewingError })
  }
  return aggregateDevelopmentListingPerformance({ listings: unique, snapshots, leadBatches, viewingBatches, days })
}
