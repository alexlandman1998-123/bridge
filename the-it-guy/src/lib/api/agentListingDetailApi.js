const SELLER_PORTAL_INVITE_READY_AFTER_MANDATE_SIGNED_STATUS_KEYS = new Set([
  'active',
  'finalised',
  'finalized',
  'fully_signed',
  'live',
  'mandate_signed',
  'published',
  'signed',
  'signed_uploaded',
  'sold',
  'transaction_created',
  'under_offer',
  'uploaded_signed',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeStatusKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

async function loadPrivateListingService() {
  return import('../../services/privateListingService.js')
}

async function loadAgencyPipelineService() {
  return import('../agencyPipelineService.js')
}

export async function getPrivateListing(listingId, options = {}) {
  const { getPrivateListing: getPrivateListingFromService } = await loadPrivateListingService()
  return getPrivateListingFromService(listingId, options)
}

export async function createPrivateListingDocumentDownloadUrl(options = {}) {
  const { createPrivateListingDocumentDownloadUrl: createDownloadUrl } = await loadPrivateListingService()
  return createDownloadUrl(options)
}

export async function getSellerPortalAccessState(token) {
  const { getSellerPortalAccessState: getAccessState } = await loadPrivateListingService()
  return getAccessState(token)
}

export async function getSellerPortalSecurityDiagnostics(token) {
  const { getSellerPortalSecurityDiagnostics: getDiagnostics } = await loadPrivateListingService()
  return getDiagnostics(token)
}

export async function listAppointmentsAsync(organisationId, options = {}) {
  const { listAppointmentsAsync: listAppointments } = await loadAgencyPipelineService()
  return listAppointments(organisationId, options)
}

export function isSellerPortalInviteReadyAfterSignedMandate(listing = {}, context = {}) {
  if (context?.mandateSigned || context?.signed || context?.signedAt || context?.mandateSignedAt) return true
  const mandate = listing?.mandate && typeof listing.mandate === 'object' ? listing.mandate : {}
  const mandatePacket = listing?.mandatePacket && typeof listing.mandatePacket === 'object'
    ? listing.mandatePacket
    : listing?.mandate_packet && typeof listing.mandate_packet === 'object'
      ? listing.mandate_packet
      : {}
  const version = mandatePacket?.version && typeof mandatePacket.version === 'object' ? mandatePacket.version : {}
  const statusValues = [
    listing?.mandateStatus,
    listing?.mandate_status,
    listing?.listingStatus,
    listing?.listing_status,
    listing?.status,
    mandate?.status,
    mandate?.mandateStatus,
    mandate?.mandate_status,
    mandatePacket?.status,
    mandatePacket?.packetStatus,
    mandatePacket?.packet_status,
    version?.status,
  ]
  if (statusValues.some((value) => SELLER_PORTAL_INVITE_READY_AFTER_MANDATE_SIGNED_STATUS_KEYS.has(normalizeStatusKey(value)))) {
    return true
  }
  return Boolean(
    listing?.mandateSignedAt ||
      listing?.mandate_signed_at ||
      listing?.mandateSignedDate ||
      listing?.mandate_signed_date ||
      mandate?.signedAt ||
      mandate?.signed_at ||
      mandate?.finalisedAt ||
      mandate?.finalised_at ||
      mandate?.finalizedAt ||
      mandate?.finalized_at ||
      mandate?.finalSignedFilePath ||
      mandate?.final_signed_file_path ||
      mandatePacket?.finalSignedFilePath ||
      mandatePacket?.final_signed_file_path ||
      mandatePacket?.finalSignedFileUrl ||
      mandatePacket?.final_signed_file_url ||
      version?.final_signed_file_path ||
      version?.final_signed_file_url,
  )
}
