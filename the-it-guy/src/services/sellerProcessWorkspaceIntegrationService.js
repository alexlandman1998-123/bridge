import { buildSellerProcessShadowIntegration } from './sellerProcessShadowIntegrationService.js'

export const SELLER_PROCESS_SHADOW_WORKSPACE_KEY = 'sellerProcessShadowIntegration'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function firstPresent(...values) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
}

function normalizeKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
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

function getPacketType(row = {}) {
  return normalizeKey(row?.packetType || row?.packet_type || row?.type)
}

function chooseListing({ row = {}, listings = [] } = {}) {
  return asArray(listings)[0] || asArray(row?.listings)[0] || row?.listing || null
}

function chooseMandatePacket({ row = {}, documentPackets = [], listing = null } = {}) {
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
  ]
}

export function shouldAttachSellerProcessShadowIntegration(options = {}) {
  return options?.includeSellerProcessShadowIntegration === true ||
    options?.includeSellerProcessShadow === true ||
    options?.sellerProcessShadow === true
}

export function buildSellerLeadWorkspaceShadowIntegration(context = {}) {
  const row = context.row || {}
  const lead = context.lead || row || {}
  const listing = chooseListing(context)
  const mandatePacket = chooseMandatePacket({ ...context, row, listing })
  const documents = collectDocuments({ ...context, row, listing })

  return buildSellerProcessShadowIntegration({
    organisationSettings: context.organisationSettings || context.organizationSettings || null,
    sellerProcessProfile: context.sellerProcessProfile || context.seller_process_profile || '',
    lead,
    contact: context.contact || row.contact || {},
    listing: listing || {},
    appointments: context.appointments || row.appointments || [],
    documents,
    activities: context.leadActivities || context.activities || row.leadActivities || row.activities || [],
    mandatePacket,
    mandatePacketStatus: mandatePacket ? { packet: mandatePacket } : null,
  })
}

export function attachSellerProcessShadowIntegration(workspace = {}, context = {}, options = {}) {
  if (!shouldAttachSellerProcessShadowIntegration(options)) return workspace
  return {
    ...workspace,
    [SELLER_PROCESS_SHADOW_WORKSPACE_KEY]: buildSellerLeadWorkspaceShadowIntegration({
      ...context,
      row: context.row || workspace.row || null,
    }),
  }
}
