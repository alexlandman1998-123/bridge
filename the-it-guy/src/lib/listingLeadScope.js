// Only the opened listing needs this seller-intake filter. Keep it outside the
// shared agency selection module so it loads with the listing workspace.
function text(value) {
  return String(value || '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function isSellerLeadForListing(lead = {}, listing = {}) {
  const safeLead = record(lead)
  const safeListing = record(listing)
  const category = lower(safeLead.leadCategory || safeLead.lead_category || safeLead.contactType || safeLead.contact_type)
  if (category.includes('seller')) return true
  const leadId = text(safeLead.leadId || safeLead.lead_id || safeLead.id)
  if (!leadId) return false
  // An intake link identifies the owner of this listing, not a buyer enquiry.
  // Match lead IDs rather than contact IDs: one contact can also have a buyer lead.
  return [safeListing.sellerLeadId, safeListing.seller_lead_id,
    safeListing.originatingCrmLeadId, safeListing.originating_crm_lead_id,
    safeListing.seller?.leadId, safeListing.seller?.lead_id,
    safeListing.sellerLead?.leadId, safeListing.sellerLead?.lead_id]
    .map(text)
    .includes(leadId)
}
