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

function getEventPayload(event = {}) {
  return event.eventPayload && typeof event.eventPayload === 'object'
    ? event.eventPayload
    : event.event_payload_json && typeof event.event_payload_json === 'object'
      ? event.event_payload_json
      : event.metadata && typeof event.metadata === 'object'
        ? event.metadata
        : {}
}

function getEventCreatedAt(event = {}) {
  return normalizeText(
    event.createdAt ||
      event.created_at ||
      event.sentAt ||
      event.sent_at ||
      getEventPayload(event).sentAt ||
      getEventPayload(event).sent_at,
  )
}

function getSellerPortalInviteEventStatus(event = {}) {
  const type = normalizeKey(event.eventType || event.event_type || event.type || event.activity_type)
  if (type === 'seller_portal_invite_sent_after_mandate_signed') return 'sent'
  if (type === 'seller_portal_invite_failed_after_mandate_signed') return 'failed'
  if (type === 'seller_portal_invite_skipped_after_mandate_signed') return 'skipped'
  if (type === 'seller_portal_invite_blocked_before_mandate_signed') return 'blocked'
  if (type === 'seller_portal_invite_ready_after_mandate_signed') return 'ready'
  return ''
}

function compareInviteEvents(left = {}, right = {}) {
  const statusRank = { sent: 5, failed: 4, blocked: 3, skipped: 2, ready: 1 }
  const leftStatus = getSellerPortalInviteEventStatus(left)
  const rightStatus = getSellerPortalInviteEventStatus(right)
  const leftTime = Date.parse(getEventCreatedAt(left))
  const rightTime = Date.parse(getEventCreatedAt(right))
  const timeDelta = (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
  if (timeDelta) return timeDelta
  return (statusRank[rightStatus] || 0) - (statusRank[leftStatus] || 0)
}

function resolveSellerPortalInviteDelivery(packetEvents = []) {
  const inviteEvents = (Array.isArray(packetEvents) ? packetEvents : [])
    .filter((item) => getSellerPortalInviteEventStatus(item))
  const sentEvent = inviteEvents
    .filter((item) => getSellerPortalInviteEventStatus(item) === 'sent')
    .sort(compareInviteEvents)[0] || null
  const event = sentEvent || inviteEvents.sort(compareInviteEvents)[0] || null
  if (!event) {
    return {
      status: 'missing',
      detail: 'No seller portal password setup invite event is recorded for this signed mandate.',
      actionRequired: true,
    }
  }

  const payload = getEventPayload(event)
  const status = getSellerPortalInviteEventStatus(event)
  const eventId = normalizeText(event.id)
  if (status === 'sent') {
    return {
      status,
      eventId,
      sentAt: normalizeText(payload.sentAt || payload.sent_at || event.created_at),
      deliveryId: normalizeText(payload.deliveryId || payload.delivery_id),
      canonicalInviteId: normalizeText(payload.canonicalInviteId || payload.canonical_invite_id),
      detail: 'Seller portal password setup invite was sent.',
      actionRequired: false,
    }
  }
  if (status === 'failed') {
    return {
      status,
      eventId,
      failedAt: normalizeText(payload.failedAt || payload.failed_at || event.created_at),
      detail: normalizeText(payload.errorMessage || payload.error_message) || 'Seller portal password setup invite failed.',
      actionRequired: true,
    }
  }
  if (status === 'skipped') {
    return {
      status,
      eventId,
      skipReason: normalizeText(payload.skipReason || payload.skip_reason),
      detail: normalizeText(payload.skipReason || payload.skip_reason) || 'Seller portal password setup invite was skipped.',
      actionRequired: true,
    }
  }
  if (status === 'blocked') {
    return {
      status,
      eventId,
      blockedAt: normalizeText(payload.blockedAt || payload.blocked_at || event.created_at),
      detail: normalizeText(payload.message || payload.errorMessage || payload.error_message) ||
        'Seller portal password setup invite was blocked before the mandate was signed.',
      actionRequired: true,
    }
  }
  return {
    status,
    eventId,
    readyAt: normalizeText(payload.finalizedAt || payload.finalized_at || payload.signedAt || payload.signed_at || event.created_at),
    detail: 'Seller portal password setup invite is ready but no sent event is recorded yet.',
    actionRequired: true,
  }
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
  packetEvents = [],
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
  const hasPortalContext = Boolean(portalContext && typeof portalContext === 'object' && Object.keys(portalContext).length)
  const portalInvite = resolveSellerPortalInviteDelivery(packetEvents)

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
    buildCheck(
      'seller_portal_invite_sent_after_mandate_signed',
      'Seller portal password setup invite sent',
      portalInvite.status === 'sent',
      {
        required: false,
        severity: 'warning',
        notApplicable: !packetId,
        detail: portalInvite.detail,
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
    portalInviteStatus: portalInvite.status,
    portalInviteEventId: portalInvite.eventId || '',
    portalInviteSentAt: portalInvite.sentAt || '',
    portalInviteFailedAt: portalInvite.failedAt || '',
    portalInviteBlockedAt: portalInvite.blockedAt || '',
    portalInviteReadyAt: portalInvite.readyAt || '',
    portalInviteDeliveryId: portalInvite.deliveryId || '',
    portalInviteCanonicalInviteId: portalInvite.canonicalInviteId || '',
    portalInviteSkipReason: portalInvite.skipReason || '',
    portalInviteDetail: portalInvite.detail || '',
    portalInviteActionRequired: Boolean(packetId && portalInvite.actionRequired),
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
