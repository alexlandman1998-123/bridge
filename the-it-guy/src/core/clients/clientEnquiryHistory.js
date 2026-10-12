const clean = value => String(value || '').trim()

export function buildClientEnquiryHistory({ organisationId, leads = [], logs = [], listings = [] }) {
  const scopedLeads = leads.filter(lead => lead.organisation_id === organisationId)
  const leadById = new Map(scopedLeads.map(lead => [lead.lead_id, lead]))
  const listingById = new Map(listings.filter(listing => listing.organisation_id === organisationId).map(listing => [listing.id, listing]))
  const seen = new Set()
  const leadsWithLogs = new Set()
  const enquiries = []
  const append = ({ id, leadId, listingId, source, recordedAt, reference }) => {
    const listing = listingById.get(listingId)
    enquiries.push({ id, leadId, listingId, source: clean(source) || 'Source not recorded', recordedAt, reference: clean(reference), property: clean(listing?.title || listing?.property_address) || (listingId ? `Listing ${listingId.slice(0, 8)}` : 'No property recorded') })
  }
  for (const log of logs) {
    if (log.organisation_id !== organisationId || !leadById.has(log.lead_id)) continue
    leadsWithLogs.add(log.lead_id)
    if (!['assigned', 'processed'].includes(log.status) || log.review_status === 'duplicate' || log.duplicate_of_log_id) continue
    const key = clean(log.external_reference) ? `${clean(log.source).toLowerCase()}:${clean(log.external_reference)}` : `log:${log.log_id}`
    if (seen.has(key)) continue
    seen.add(key)
    append({ id: `log:${log.log_id}`, leadId: log.lead_id, listingId: log.listing_id, source: log.source, recordedAt: log.created_at, reference: log.external_reference })
  }
  // A linked lead without ingestion records is one recorded enquiry, not an
  // additional enquiry on top of that lead's portal ingestion history.
  for (const lead of scopedLeads) {
    if (!leadsWithLogs.has(lead.lead_id) && !seen.has(`lead:${lead.lead_id}`)) {
      seen.add(`lead:${lead.lead_id}`)
      append({ id: `lead:${lead.lead_id}`, leadId: lead.lead_id, listingId: lead.listing_id, source: lead.lead_source, recordedAt: lead.created_at })
    }
  }
  enquiries.sort((a, b) => (Date.parse(b.recordedAt) || 0) - (Date.parse(a.recordedAt) || 0))
  return { enquiries, count: enquiries.length, repeat: enquiries.length > 1 }
}
