import { normalizeProperty24PreviewText } from './listingDataService.js'

export function summarizeProperty24LeadPayload(payload) {
  const leads = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.messages)
      ? payload.messages
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
      receivedAt: lead.receivedAt || lead.ReceivedAt || lead.createdAt || lead.CreatedAt || lead.date || lead.Date || null,
      contactName: lead.contactName || lead.ContactName || lead.name || lead.Name || null,
      email: lead.email || lead.Email || lead.emailAddress || lead.EmailAddress || null,
      mobile: lead.contactNumber || lead.ContactNumber || lead.mobile || lead.Mobile || lead.phoneNumber || lead.PhoneNumber || null,
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

const MAX_LISTING_LEAD_WINDOW_MS = 62 * 24 * 60 * 60 * 1000
const DEFAULT_LISTING_LEAD_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const SOUTH_AFRICA_UTC_OFFSET_MS = 2 * 60 * 60 * 1000

function resolveListingLeadDate(value, label) {
  const date = value ? new Date(value) : null
  if (value && Number.isNaN(date?.getTime())) throw new Error(`${label} must be a valid date-time.`)
  return date
}

export async function fetchProperty24ListingLeads({ property24, listingNumber, startDate, endDate } = {}) {
  if (!property24) throw new Error('Property24 client is required.')
  if (!listingNumber) throw new Error('listingNumber is required.')
  // P24's per-listing lead endpoint requires a bounded date range; the live
  // service permits at most 62 days. Default to the latest 30 days so a new
  // listing can be checked safely without the UI having to manufacture dates.
  const resolvedEndDate = resolveListingLeadDate(endDate, 'endDate') || new Date()
  const resolvedStartDate = resolveListingLeadDate(startDate, 'startDate') || new Date(resolvedEndDate.getTime() - DEFAULT_LISTING_LEAD_WINDOW_MS)
  const dateWindowMs = resolvedEndDate.getTime() - resolvedStartDate.getTime()
  if (dateWindowMs <= 0) throw new Error('startDate must be before endDate.')
  if (dateWindowMs > MAX_LISTING_LEAD_WINDOW_MS) throw new Error('Property24 listing lead checks are limited to a 62-day date range.')

  // Property24 returns lead dates in South African time. Live enquiries only
  // appeared after the UTC request clock reached their local clock time.
  // Extend the upper bound by two hours in UTC so the latest enquiries are
  // included whether Property24 compares local clock values or UTC instants.
  // Keep the requested start unchanged for the rolling replay. Respect the
  // provider's 62-day maximum even for an explicit historical range.
  const lookaheadMs = Math.min(SOUTH_AFRICA_UTC_OFFSET_MS, MAX_LISTING_LEAD_WINDOW_MS - dateWindowMs)
  let result
  let lookaheadFallback = false
  try {
    result = await property24.fetchListingLeadsForListing(listingNumber, {
      startDate: resolvedStartDate.toISOString(),
      endDate: new Date(resolvedEndDate.getTime() + lookaheadMs).toISOString(),
    })
  } catch (error) {
    if (!lookaheadMs || ![400, 422].includes(Number(error?.status))) throw error
    // Preserve the working request if Property24 rejects a future end date.
    // Surface the fallback so an apparently successful sync is not silent.
    console.warn('[Property24] lead lookahead rejected; retrying original window', {
      listingNumber,
      status: error.status,
    })
    lookaheadFallback = true
    result = await property24.fetchListingLeadsForListing(listingNumber, {
      startDate: resolvedStartDate.toISOString(),
      endDate: resolvedEndDate.toISOString(),
    })
  }
  return {
    ...result,
    lookaheadFallback,
    summary: summarizeProperty24LeadPayload(result.data),
  }
}
