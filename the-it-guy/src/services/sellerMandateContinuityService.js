function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const SIGNED_STATUS_KEYS = new Set([
  'active',
  'archived',
  'complete',
  'completed',
  'finalised',
  'finalized',
  'fully_signed',
  'signed',
  'signed_uploaded',
  'uploaded_signed',
])

function isSignedStatus(value = '') {
  return SIGNED_STATUS_KEYS.has(normalizeKey(value))
}

function getPacketId(mandatePacket = null) {
  if (!mandatePacket || typeof mandatePacket !== 'object') return ''
  return normalizeText(
    mandatePacket.id ||
      mandatePacket.packetId ||
      mandatePacket.packet_id ||
      mandatePacket.packet?.id ||
      mandatePacket.version?.packet_id,
  )
}

function getFinalSignedArtifact(mandatePacket = null) {
  if (!mandatePacket || typeof mandatePacket !== 'object') {
    return { filePath: '', fileUrl: '', fileName: '' }
  }
  return {
    filePath: normalizeText(
      mandatePacket.finalSignedFilePath ||
        mandatePacket.final_signed_file_path ||
        mandatePacket.version?.final_signed_file_path ||
        mandatePacket.version?.finalSignedFilePath,
    ),
    fileUrl: normalizeText(
      mandatePacket.finalSignedDownloadUrl ||
        mandatePacket.finalSignedFileAccessUrl ||
        mandatePacket.finalSignedFileUrl ||
        mandatePacket.final_signed_file_access_url ||
        mandatePacket.final_signed_file_url ||
        mandatePacket.version?.final_signed_file_access_url ||
        mandatePacket.version?.final_signed_file_url,
    ),
    fileName: normalizeText(
      mandatePacket.finalSignedFileName ||
        mandatePacket.final_signed_file_name ||
        mandatePacket.version?.final_signed_file_name ||
        mandatePacket.version?.finalSignedFileName,
    ),
  }
}

function hasPacketSignedSignal(mandatePacket = null) {
  const artifact = getFinalSignedArtifact(mandatePacket)
  return Boolean(artifact.filePath || artifact.fileUrl)
}

function documentLooksLikeSignedMandate(document = {}) {
  const source = [
    document.documentType,
    document.document_type,
    document.category,
    document.document_category,
    document.name,
    document.document_name,
    document.file_name,
    document.fileName,
    document.requirement_key,
    document.requirementKey,
  ].map(normalizeKey).join(' ')
  return (
    source.includes('signed_mandate') ||
    source.includes('mandate_signature') ||
    source.includes('final_signed_packet') ||
    (source.includes('mandate') && source.includes('signed'))
  )
}

function documentIsSellerVisible(document = {}) {
  const visibility = normalizeKey(document.visibility || document.document_visibility || document.visibility_scope)
  return ['seller_visible', 'client_visible', 'shared', 'seller'].includes(visibility)
}

function documentHasFileReference(document = {}) {
  return Boolean(
    normalizeText(
      document.filePath ||
        document.file_path ||
        document.storage_path ||
        document.url ||
        document.signedUrl ||
        document.signed_url ||
        document.fileUrl ||
        document.file_url,
    ),
  )
}

function findSignedMandateDocument(documents = []) {
  return (Array.isArray(documents) ? documents : []).find((document) =>
    documentLooksLikeSignedMandate(document) &&
    documentIsSellerVisible(document) &&
    documentHasFileReference(document)
  ) || null
}

function eventLooksSellerVisible(event = {}) {
  const metadata = event.eventData && typeof event.eventData === 'object'
    ? event.eventData
    : event.metadata && typeof event.metadata === 'object'
      ? event.metadata
      : {}
  return normalizeKey(event.visibility || event.visibility_scope || metadata.visibility) === 'client_visible'
}

function eventLooksLikeMandateSigned(event = {}) {
  return normalizeKey(event.eventType || event.event_type || event.type || event.activity_type) === 'mandate_signed'
}

function findMandateSignedEvent(events = []) {
  return (Array.isArray(events) ? events : []).find((event) =>
    eventLooksLikeMandateSigned(event) && eventLooksSellerVisible(event)
  ) || null
}

function getPortalContextPacketId(portalContext = {}) {
  return normalizeText(
    portalContext.mandatePacketId ||
      portalContext.mandate_packet_id ||
      portalContext.activeSellingContext?.mandatePacketId ||
      portalContext.activeSellingContext?.mandate_packet_id,
  )
}

function buildCheck(key, label, complete, { required = true, detail = '', severity = 'critical', notApplicable = false } = {}) {
  return {
    key,
    label,
    complete: Boolean(complete),
    required: Boolean(required),
    severity,
    state: notApplicable ? 'not_applicable' : complete ? 'complete' : required ? 'blocked' : 'warning',
    detail: normalizeText(detail),
  }
}

export function buildSellerMandateContinuityModel({
  lead = {},
  listing = {},
  documents = [],
  mandatePacket = null,
  activityEvents = [],
  portalContext = {},
  sellerWorkspaceToken = '',
} = {}) {
  const packetId = normalizeText(
    getPacketId(mandatePacket) ||
      listing?.mandatePacketId ||
      listing?.mandate_packet_id ||
      lead?.mandatePacketId ||
      lead?.mandate_packet_id ||
      getPortalContextPacketId(portalContext),
  )
  const leadPacketId = normalizeText(lead?.mandatePacketId || lead?.mandate_packet_id)
  const listingPacketId = normalizeText(listing?.mandatePacketId || listing?.mandate_packet_id)
  const portalPacketId = getPortalContextPacketId(portalContext)
  const signedDocument = findSignedMandateDocument(documents)
  const signedEvent = findMandateSignedEvent(activityEvents)
  const finalArtifact = getFinalSignedArtifact(mandatePacket)
  const packetSigned = hasPacketSignedSignal(mandatePacket)
  const hasFinalArtifact = Boolean(finalArtifact.filePath || finalArtifact.fileUrl)
  const listingSigned = isSignedStatus(listing?.mandateStatus || listing?.mandate_status || listing?.listingStatus || listing?.listing_status)
  const leadSigned = isSignedStatus(lead?.mandateStatus || lead?.mandate_status || lead?.status || lead?.stage)
  const hasPacketSource = Boolean(mandatePacket || packetId)
  const hasPortalContext = Boolean(portalContext && typeof portalContext === 'object' && Object.keys(portalContext).length)

  const checks = [
    buildCheck(
      'mandate_packet_resolved',
      'Mandate packet is resolved',
      Boolean(packetId && (packetSigned || listingSigned || leadSigned)),
      { detail: packetId ? `Packet ${packetId}` : 'Missing mandate packet id.' },
    ),
    buildCheck(
      'lead_packet_linked',
      'Lead retains mandate packet linkage',
      Boolean(!leadPacketId || leadPacketId === packetId),
      {
        required: Boolean(leadPacketId),
        notApplicable: !leadPacketId,
        detail: leadPacketId ? `Lead packet ${leadPacketId}` : 'Lead packet linkage is not present in this context.',
      },
    ),
    buildCheck(
      'listing_packet_linked',
      'Listing retains mandate packet linkage',
      Boolean(listingPacketId && (!packetId || listingPacketId === packetId)),
      { detail: listingPacketId ? `Listing packet ${listingPacketId}` : 'Listing is missing mandate packet linkage.' },
    ),
    buildCheck(
      'listing_marked_signed',
      'Listing mandate status is signed',
      listingSigned,
      { detail: normalizeText(listing?.mandateStatus || listing?.mandate_status || listing?.listingStatus || listing?.listing_status) || 'No signed listing mandate status.' },
    ),
    buildCheck(
      'seller_visible_signed_document',
      'Signed mandate document is seller-visible',
      Boolean(signedDocument || hasFinalArtifact),
      {
        detail: signedDocument
          ? signedDocument?.document_name || signedDocument?.name || 'Seller-visible signed mandate document found.'
          : hasFinalArtifact
            ? `Using final signed packet artifact${finalArtifact.fileName ? `: ${finalArtifact.fileName}` : '.'}`
            : 'No seller-visible signed mandate document or final packet artifact found.',
      },
    ),
    buildCheck(
      'seller_visible_activity',
      'Seller-visible activity feed includes mandate signed event',
      Boolean(signedEvent),
      { detail: signedEvent?.eventData?.title || signedEvent?.activity_title || 'No seller-visible mandate signed activity found.' },
    ),
    buildCheck(
      'seller_portal_context_linked',
      'Seller portal context links to mandate packet',
      Boolean(!hasPortalContext || !portalPacketId || portalPacketId === packetId),
      {
        required: false,
        severity: 'warning',
        notApplicable: !hasPortalContext,
        detail: portalPacketId ? `Portal packet ${portalPacketId}` : 'Portal context was not available in this payload.',
      },
    ),
  ]

  const blockers = checks.filter((check) => check.state === 'blocked')
  const warnings = checks.filter((check) => check.state === 'warning')
  return {
    status: blockers.length ? 'blocked' : warnings.length ? 'warning' : 'ready',
    ready: blockers.length === 0,
    packetId,
    sellerWorkspaceToken: normalizeText(sellerWorkspaceToken),
    signedDocumentId: normalizeText(signedDocument?.id),
    signedDocumentName: normalizeText(signedDocument?.document_name || signedDocument?.name || finalArtifact.fileName),
    signedDocumentSource: signedDocument ? 'listing_document' : hasFinalArtifact ? 'packet_artifact' : '',
    finalSignedFilePath: finalArtifact.filePath,
    finalSignedFileUrl: finalArtifact.fileUrl,
    signedActivityId: normalizeText(signedEvent?.id),
    checks,
    blockers,
    warnings,
    summary: {
      total: checks.length,
      complete: checks.filter((check) => check.state === 'complete').length,
      blocked: blockers.length,
      warnings: warnings.length,
    },
  }
}
