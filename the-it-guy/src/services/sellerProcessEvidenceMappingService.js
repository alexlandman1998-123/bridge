function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function firstPresent(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

function readId(row = {}, keys = []) {
  for (const key of keys) {
    const value = firstPresent(row?.[key])
    if (value) return value
  }
  return ''
}

function getListingId(row = {}) {
  return readId(row, ['listingId', 'listing_id', 'privateListingId', 'private_listing_id', 'id'])
}

function getLeadId(row = {}) {
  return readId(row, ['leadId', 'lead_id', 'sellerLeadId', 'seller_lead_id', 'originatingCrmLeadId', 'originating_crm_lead_id', 'id'])
}

function getPacketType(row = {}) {
  return normalizeKey(row?.packetType || row?.packet_type || row?.type || row?.title)
}

function listingMatchesLead(listing = {}, lead = {}) {
  const listingId = getListingId(listing)
  const leadListingId = readId(lead, ['listingId', 'listing_id', 'privateListingId', 'private_listing_id'])
  const leadId = getLeadId(lead)
  const listingSellerLeadId = readId(listing, ['sellerLeadId', 'seller_lead_id', 'originatingCrmLeadId', 'originating_crm_lead_id', 'leadId', 'lead_id'])
  return Boolean(
    (listingId && leadListingId && listingId === leadListingId) ||
      (leadId && listingSellerLeadId && leadId === listingSellerLeadId),
  )
}

function chooseListing(context = {}) {
  const row = context.row || {}
  const lead = context.lead || row || {}
  const explicitListing = context.listing || context.linkedSellerListing || context.linkedListing || null
  if (explicitListing) return explicitListing
  const candidates = [
    ...asArray(context.listings),
    ...asArray(row?.listings),
    row?.listing,
    lead?.listing,
  ].filter(Boolean)
  return candidates.find((listing) => listingMatchesLead(listing, lead)) || candidates[0] || null
}

function chooseMandatePacket({ row = {}, listing = null, documentPackets = [], mandatePacket = null, mandatePacketStatus = null } = {}) {
  if (mandatePacketStatus?.packet) return mandatePacketStatus.packet
  if (mandatePacket) return mandatePacket
  const listingMandatePacketId = firstPresent(listing?.mandatePacketId, listing?.mandate_packet_id, row?.mandatePacketId, row?.mandate_packet_id)
  const packets = [
    row?.mandatePacket,
    row?.mandate_packet,
    ...asArray(documentPackets),
    ...asArray(row?.documentPackets),
    ...asArray(row?.document_packets),
  ].filter(Boolean)

  return packets.find((packet) => firstPresent(packet?.id, packet?.packetId, packet?.packet_id) === listingMandatePacketId) ||
    packets.find((packet) => getPacketType(packet) === 'mandate') ||
    packets[0] ||
    null
}

function collectDocuments({ row = {}, listing = null, documents = [] } = {}) {
  return [
    ...asArray(documents),
    ...asArray(row?.documents),
    ...asArray(row?.sellerDocuments),
    ...asArray(row?.seller_documents),
    ...asArray(listing?.documents),
    ...asArray(listing?.sellerDocuments),
    ...asArray(listing?.seller_documents),
  ].filter(Boolean)
}

function collectAppointments({ row = {}, listing = null, appointments = [] } = {}) {
  return [
    ...asArray(appointments),
    ...asArray(row?.appointments),
    ...asArray(listing?.appointments),
  ].filter(Boolean)
}

function collectActivities({ row = {}, activities = [], leadActivities = [], activityTimeline = [], timeline = [] } = {}) {
  return [
    ...asArray(activities),
    ...asArray(leadActivities),
    ...asArray(activityTimeline),
    ...asArray(timeline),
    ...asArray(row?.leadActivities),
    ...asArray(row?.lead_activities),
    ...asArray(row?.activities),
    ...asArray(row?.communicationTimeline),
    ...asArray(row?.communication_timeline),
  ].filter(Boolean)
}

function buildMandatePacketStatus({ mandatePacket = null, mandatePacketStatus = null } = {}) {
  if (mandatePacketStatus) return mandatePacketStatus
  return mandatePacket ? { packet: mandatePacket } : null
}

export function buildSellerProcessEvidenceContext(context = {}) {
  const row = context.row || {}
  const lead = context.lead || row || {}
  const listing = chooseListing(context)
  const mandatePacket = chooseMandatePacket({
    ...context,
    row,
    listing,
    documentPackets: context.documentPackets || context.document_packets || [],
  })
  const documents = collectDocuments({ ...context, row, listing })
  const appointments = collectAppointments({ ...context, row, listing })
  const activities = collectActivities({ ...context, row })

  return Object.freeze({
    organisationSettings: context.organisationSettings || context.organizationSettings || null,
    sellerProcessProfile: context.sellerProcessProfile || context.seller_process_profile || '',
    lead,
    contact: context.contact || row.contact || {},
    listing: listing || {},
    appointments,
    documents,
    activities,
    mandatePacket,
    mandatePacketStatus: buildMandatePacketStatus({
      mandatePacket,
      mandatePacketStatus: context.mandatePacketStatus || context.mandate_packet_status || null,
    }),
  })
}

export function summarizeSellerProcessEvidenceContext(context = {}) {
  const evidenceContext = buildSellerProcessEvidenceContext(context)
  return Object.freeze({
    hasLead: Boolean(getLeadId(evidenceContext.lead)),
    hasListing: Boolean(getListingId(evidenceContext.listing)),
    appointmentCount: evidenceContext.appointments.length,
    documentCount: evidenceContext.documents.length,
    activityCount: evidenceContext.activities.length,
    hasMandatePacket: Boolean(evidenceContext.mandatePacket),
  })
}
