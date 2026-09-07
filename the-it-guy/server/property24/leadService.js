import { normalizeProperty24PreviewText } from './listingDataService.js'

export function summarizeProperty24LeadPayload(payload) {
  const leads = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.leads)
      ? payload.leads
      : Array.isArray(payload?.items)
        ? payload.items
        : []

  return {
    count: leads.length,
    nextAfter: normalizeProperty24PreviewText(payload?.nextAfter || payload?.NextAfter),
    sample: leads.slice(0, 3).map((lead) => ({
      listingNumber: lead.listingNumber || lead.ListingNumber || null,
      receivedAt: lead.receivedAt || lead.ReceivedAt || lead.createdAt || lead.CreatedAt || null,
      contactName: lead.contactName || lead.ContactName || lead.name || lead.Name || null,
      email: lead.email || lead.Email || lead.emailAddress || lead.EmailAddress || null,
      mobile: lead.mobile || lead.Mobile || lead.phoneNumber || lead.PhoneNumber || null,
    })),
  }
}

export async function fetchProperty24Leads({ property24, after } = {}) {
  if (!property24) throw new Error('Property24 client is required.')
  const result = await property24.fetchListingLeads({ after })
  return {
    ...result,
    summary: summarizeProperty24LeadPayload(result.data),
  }
}

export async function fetchProperty24ListingLeads({ property24, listingNumber, startDate, endDate } = {}) {
  if (!property24) throw new Error('Property24 client is required.')
  if (!listingNumber) throw new Error('listingNumber is required.')
  // The live v55 service exposes leads at the agency feed endpoint
  // (`/listings/leads`), not at `/listings/{listingNumber}/leads`. Query the
  // supported feed once and constrain the result locally to this listing.
  // `after` is the supported server-side time window; `endDate` remains part
  // of this public function signature for backwards compatibility.
  void endDate
  const result = await property24.fetchListingLeads({ after: startDate })
  const targetListingNumber = normalizeProperty24PreviewText(listingNumber)
  const filterLead = (lead) => normalizeProperty24PreviewText(lead?.listingNumber || lead?.ListingNumber) === targetListingNumber
  const filteredData = Array.isArray(result.data)
    ? result.data.filter(filterLead)
    : Array.isArray(result.data?.leads)
      ? { ...result.data, leads: result.data.leads.filter(filterLead) }
      : Array.isArray(result.data?.items)
        ? { ...result.data, items: result.data.items.filter(filterLead) }
        : result.data
  return {
    ...result,
    data: filteredData,
    summary: summarizeProperty24LeadPayload(filteredData),
  }
}
