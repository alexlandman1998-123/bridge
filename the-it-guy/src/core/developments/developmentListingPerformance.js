const CHANNEL_KEYS = ['property24', 'privateProperty', 'website']
const EXCLUDED_VIEWINGS = new Set(['cancelled', 'declined', 'rejected'])
const UPCOMING_VIEWINGS = new Set(['confirmed', 'accepted', 'pending_approval', 'reschedule_requested', 'viewing_requested', 'requested'])

function hasValue(metric) {
  return metric?.available === true && Number.isFinite(metric.value) && metric.value >= 0
}

export function aggregateDevelopmentListingPerformance({ listings = [], snapshots = [], leadBatches = [], viewingBatches = [], days = 30, now = new Date() }) {
  const uniqueListings = [...new Map(listings.map(listing => [`${listing.organisationId}:${listing.id}`, listing])).values()]
  const listingCount = uniqueListings.length
  const result = { listingCount, windowDays: days }
  for (const key of CHANNEL_KEYS) {
    const sources = snapshots.map(snapshot => snapshot.data?.[key])
    const metricKeys = new Set(sources.flatMap(source => Object.keys(source?.metrics || {})))
    metricKeys.add('views')
    const metrics = Object.fromEntries([...metricKeys].map(metricKey => {
      const values = sources.map(source => source?.metrics?.[metricKey]).filter(hasValue)
      return [metricKey, {
        available: values.length > 0,
        value: values.length ? values.reduce((sum, metric) => sum + metric.value, 0) : null,
        complete: values.length === listingCount && listingCount > 0 && values.every(metric => metric.complete),
        coveredDays: values.reduce((sum, metric) => sum + (metric.coveredDays || 0), 0),
        expectedDays: listingCount * days,
      }]
    }))
    result[key] = {
      metrics, listingCount,
      published: sources.some(source => source?.published),
      statisticsUnavailable: snapshots.some(snapshot => !snapshot.data),
      complete: metrics.views.complete,
      lastAttempt: sources.some(source => source?.lastAttempt?.failed) ? { failed: true } : null,
    }
  }

  // One buyer may be interested in several units. Count their lead once.
  const leads = new Map()
  for (const batch of leadBatches) {
    const contactLeads = new Map((batch.rows || []).filter(row => row.lead_id && row.contact_id).map(row => [row.contact_id, row.lead_id]))
    for (const row of batch.rows || []) {
      const leadId = row.lead_id || contactLeads.get(row.contact_id)
      const identity = leadId ? `lead:${leadId}` : row.contact_id ? `contact:${row.contact_id}` : ''
      if (!identity) continue
      const key = `${batch.organisationId}:${identity}`
      const previous = leads.get(key)
      if (!previous || new Date(row.created_at).getTime() < new Date(previous.created_at).getTime()) leads.set(key, row)
    }
  }
  const viewings = new Map()
  for (const batch of viewingBatches) {
    for (const row of batch.rows || []) {
      const status = String(row.status || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')
      if (!row.appointment_id || row.archived_at || EXCLUDED_VIEWINGS.has(status) || !String(row.appointment_type || '').toLowerCase().includes('view')) continue
      viewings.set(`${batch.organisationId}:${row.appointment_id}`, { ...row, normalizedStatus: status })
    }
  }
  const reportingOrganisations = new Set(uniqueListings.map(listing => listing.organisationId).filter(Boolean)).size
  const marketDays = uniqueListings.map(listing => new Date(listing.marketStartDate || '').getTime()).filter(Number.isFinite)
    .map(date => Math.max(0, Math.floor((now.getTime() - date) / 86_400_000)))
  return {
    ...result,
    leadCount: leads.size,
    newThisWeek: [...leads.values()].filter(row => {
      const date = new Date(row.created_at).getTime()
      return date >= now.getTime() - 7 * 86_400_000 && date <= now.getTime()
    }).length,
    leadsAvailable: listingCount === 0 || leadBatches.some(batch => batch.available || !batch.error || batch.rows?.length),
    leadsComplete: listingCount === 0 || (leadBatches.length === reportingOrganisations && leadBatches.every(batch => !batch.error) && uniqueListings.every(listing => listing.organisationId)),
    viewingCount: viewings.size,
    upcomingViewings: [...viewings.values()].filter(row => {
      const date = new Date(row.date_time || `${row.appointment_date}T${row.start_time}`).getTime()
      return UPCOMING_VIEWINGS.has(row.normalizedStatus) && date >= now.getTime()
    }).length,
    viewingsAvailable: listingCount === 0 || viewingBatches.some(batch => !batch.error || batch.rows?.length),
    viewingsComplete: listingCount === 0 || (viewingBatches.length === reportingOrganisations && viewingBatches.every(batch => !batch.error) && uniqueListings.every(listing => listing.organisationId)),
    averageDaysOnMarket: marketDays.length ? Math.round(marketDays.reduce((sum, value) => sum + value, 0) / marketDays.length) : null,
    datedListingCount: marketDays.length,
    unavailableListingCount: snapshots.filter(snapshot => !snapshot.data).length,
  }
}
