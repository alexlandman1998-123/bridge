function text(value) {
  return String(value || '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function fullName(contact = {}, lead = {}) {
  const name = [
    contact.firstName || contact.first_name || lead.firstName || lead.first_name || lead.sellerName || lead.buyerName,
    contact.lastName || contact.last_name || lead.lastName || lead.last_name || lead.sellerSurname || lead.buyerSurname,
  ].filter(Boolean).join(' ').trim()
  return name || text(lead.name) || text(contact.email || lead.email) || 'Unnamed lead'
}

export function isBuyerStyleLead(lead = {}) {
  const category = lower(lead.leadCategory || lead.lead_category || lead.contactType || lead.contact_type)
  return category.includes('buyer') || category.includes('investor')
}

export function mapAgencyLeadSelectionRows({ leads = [], contacts = [] } = {}) {
  const contactsById = new Map(
    (Array.isArray(contacts) ? contacts : []).map((contact) => [text(contact.contactId || contact.contact_id), contact]),
  )
  return (Array.isArray(leads) ? leads : []).map((lead) => {
    const contact = contactsById.get(text(lead.contactId || lead.contact_id)) || {}
    return {
      ...lead,
      id: text(lead.leadId || lead.lead_id || lead.id),
      leadId: text(lead.leadId || lead.lead_id || lead.id),
      contactId: text(lead.contactId || lead.contact_id || contact.contactId || contact.contact_id),
      name: fullName(contact, lead),
      email: lower(contact.email || lead.email || lead.sellerEmail || lead.buyerEmail),
      phone: text(contact.phone || lead.phone || lead.sellerPhone || lead.buyerPhone),
      source: text(lead.leadSource || lead.lead_source),
      listingId: text(lead.listingId || lead.listing_id),
      enquiredListingId: text(lead.enquiredListingId || lead.enquired_listing_id),
      unitId: text(lead.unitId || lead.unit_id),
      unitNumber: text(lead.unitNumber || lead.unit_number),
    }
  })
}

export function isLeadLinkedToListing(lead = {}, listing = {}) {
  const listingId = text(listing.id || listing.listingId || listing.listing_id || listing.privateListingId || listing.private_listing_id)
  if (!listingId) return false
  return [lead.listingId, lead.listing_id, lead.enquiredListingId, lead.enquired_listing_id, lead.unitId, lead.unit_id]
    .map(text)
    .includes(listingId)
}

export function getBuyerLeadOptions(leadRows = [], listing = {}) {
  const listingId = text(listing.id || listing.listingId || listing.listing_id)
  return (Array.isArray(leadRows) ? leadRows : [])
    .filter(isBuyerStyleLead)
    .sort((left, right) => {
      const leftLinked = isLeadLinkedToListing(left, { id: listingId }) ? 0 : 1
      const rightLinked = isLeadLinkedToListing(right, { id: listingId }) ? 0 : 1
      return leftLinked - rightLinked || text(left.name).localeCompare(text(right.name))
    })
}

export function buildLeadListingLinkPatch(listing = {}) {
  const listingId = text(listing.id || listing.listingId || listing.listing_id)
  return {
    listingId,
    enquiredListingId: listingId,
    enquiredPropertyTitle: text(listing.listingTitle || listing.title),
    enquiredPropertyAddress: text(listing.propertyAddress || listing.addressLine1 || listing.streetAddress),
    enquiredPropertyPrice: Number(listing.askingPrice || listing.estimatedValue || 0) || null,
  }
}
