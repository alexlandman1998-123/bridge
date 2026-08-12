export const KINGSTONS_BUYER_OTP_READINESS_VERSION = 'kingstons_buyer_otp_readiness_phase1_v1'
export const KINGSTONS_BUYER_OTP_OFFER_LINK_VERSION = 'kingstons_buyer_otp_offer_link_phase3_v1'
export const KINGSTONS_BUYER_OTP_TRANSACTION_HANDOFF_SOURCE = 'kingstons_buyer_otp_phase4_transaction_handoff'
export const KINGSTONS_BUYER_PORTAL_DECISION_VERSION = 'kingstons_buyer_portal_decision_phase7_v1'
export const KINGSTONS_BUYER_OTP_DIGITAL_DECISION_VERSION = 'kingstons_buyer_otp_digital_decision_phase8_v1'

export const KINGSTONS_BUYER_OTP_DIGITAL_DECISION = Object.freeze({
  version: KINGSTONS_BUYER_OTP_DIGITAL_DECISION_VERSION,
  status: 'paused',
  livePath: 'manual_buyer_otp_upload',
  label: 'Signed OTP upload',
  reason: '',
  agentAction: '',
  nextDecision: 'Revisit digital OTP only after the manual buyer OTP rollout is stable.',
})

export const KINGSTONS_BUYER_OTP_REQUIREMENT = Object.freeze({
  key: 'signed_otp',
  label: 'Signed OTP',
  aliases: [
    'signed_otp',
    'signed_offer_to_purchase',
    'offer_to_purchase_signed',
    'otp_signed',
    'otp_signed_reuploaded',
    'signed_final',
    'offer_to_purchase',
  ],
})

const READY_STATUSES = new Set(['approved', 'complete', 'completed', 'received', 'signed', 'signed_otp_received', 'under_review', 'uploaded', 'verified'])
const ATTENTION_STATUSES = new Set(['archived', 'blocked', 'error', 'failed', 'rejected'])
const GENERATED_OTP_TYPES = new Set([
  'otp_generated',
  'otp_pending_approval',
  'otp_approved',
  'otp_sent_to_client',
  'generated_otp',
])

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function values(...items) {
  return items.flatMap((item) => {
    if (Array.isArray(item)) return item
    return item ? [item] : []
  })
}

function firstText(...items) {
  return items.map(text).find(Boolean) || ''
}

function uniqueRows(rows = []) {
  const seen = new Set()
  return rows.filter((row, index) => {
    const id = text(row?.id || row?.documentId || row?.document_id || row?.storage_path || row?.file_url) || `${key(row?.name || row?.label || row?.title)}:${index}`
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function normalizeStatus(row = {}) {
  const safeRow = row && typeof row === 'object' ? row : {}
  const document = safeRow?.document && typeof safeRow.document === 'object' ? safeRow.document : safeRow
  return key(safeRow.status || safeRow.reviewStatus || safeRow.review_status || document.status || document.reviewStatus || document.review_status)
}

function documentSignals(row = {}) {
  const safeRow = row && typeof row === 'object' ? row : {}
  const document = safeRow?.document && typeof safeRow.document === 'object' ? safeRow.document : safeRow
  return values(
    safeRow.key,
    safeRow.id,
    safeRow.name,
    safeRow.label,
    safeRow.title,
    safeRow.category,
    safeRow.documentType,
    safeRow.document_type,
    safeRow.requiredDocumentKey,
    safeRow.required_document_key,
    document.name,
    document.document_name,
    document.category,
    document.documentType,
    document.document_type,
    document.fileName,
    document.file_name,
  ).map(key).filter(Boolean)
}

function hasUploadedFileEvidence(row = {}) {
  const safeRow = row && typeof row === 'object' ? row : {}
  const document = safeRow?.document && typeof safeRow.document === 'object' ? safeRow.document : safeRow
  const upload = safeRow?.upload && typeof safeRow.upload === 'object' ? safeRow.upload : {}
  return Boolean(
    text(document.storage_path || document.file_path || document.filePath) ||
      text(document.file_url || document.url || document.fileUrl) ||
      text(upload.storage_path || upload.file_path || upload.filePath || upload.file_url || upload.url || upload.fileUrl) ||
      text(document.sourceDocumentId || document.source_document_id || safeRow.sourceDocumentId || safeRow.source_document_id) ||
      safeRow.uploaded === true ||
      safeRow.hasUpload === true ||
      document.uploaded === true ||
      document.hasUpload === true,
  )
}

function isGeneratedOtpArtifact(row = {}) {
  const signals = documentSignals(row)
  return signals.some((signal) => GENERATED_OTP_TYPES.has(signal))
}

function matchesSignedOtp(row = {}) {
  if (isGeneratedOtpArtifact(row)) return false
  const signals = documentSignals(row)
  const aliases = values(KINGSTONS_BUYER_OTP_REQUIREMENT.key, KINGSTONS_BUYER_OTP_REQUIREMENT.aliases).map(key)
  return aliases.some((alias) =>
    signals.some((signal) => signal === alias || signal.includes(alias) || alias.includes(signal)),
  )
}

function normalizeCandidate(row = {}) {
  const safeRow = row && typeof row === 'object' ? row : {}
  const document = safeRow?.document && typeof safeRow.document === 'object' ? safeRow.document : safeRow
  return {
    ...safeRow,
    document,
    documentId: text(document.id || safeRow.documentId || safeRow.document_id || safeRow.id),
    sourceDocumentId: text(document.sourceDocumentId || document.source_document_id || safeRow.sourceDocumentId || safeRow.source_document_id),
    status: normalizeStatus(safeRow),
    uploadedAt: text(document.uploaded_at || document.uploadedAt || safeRow.uploadedAt || safeRow.uploaded_at || document.created_at || safeRow.created_at),
    hasUploadedFileEvidence: hasUploadedFileEvidence(safeRow),
  }
}

export function isKingstonsManualSignedOtpDocument(row = {}) {
  const candidate = normalizeCandidate(row)
  if (!matchesSignedOtp(candidate)) return false
  if (isGeneratedOtpArtifact(candidate)) return false
  return candidate.hasUploadedFileEvidence
}

export function buildKingstonsBuyerOtpReadiness({
  documents = [],
  documentLibraryRows = [],
} = {}) {
  const candidates = uniqueRows([
    ...(Array.isArray(documentLibraryRows) ? documentLibraryRows : []),
    ...(Array.isArray(documents) ? documents : []),
  ]).map(normalizeCandidate)

  const candidate = candidates.find((row) => isKingstonsManualSignedOtpDocument(row)) || null
  const status = candidate?.status || ''
  const attention = Boolean(candidate && (ATTENTION_STATUSES.has(status) || candidate.document?.is_archived || candidate.document?.archived_at))
  const ready = Boolean(candidate && !attention && candidate.hasUploadedFileEvidence && (READY_STATUSES.has(status) || !status))
  const state = !candidate ? 'missing' : attention ? 'attention' : ready ? 'ready' : 'pending'

  const row = {
    key: KINGSTONS_BUYER_OTP_REQUIREMENT.key,
    label: KINGSTONS_BUYER_OTP_REQUIREMENT.label,
    aliases: KINGSTONS_BUYER_OTP_REQUIREMENT.aliases,
    state,
    ready,
    attention,
    missing: !candidate,
    status: status || (candidate ? 'uploaded' : 'missing'),
    statusLabel: state === 'missing'
      ? 'Missing'
      : state === 'attention'
        ? 'Needs attention'
        : state === 'ready'
          ? 'Ready'
          : 'Pending review',
    documentId: candidate?.documentId || '',
    sourceDocumentId: candidate?.sourceDocumentId || '',
    uploadedAt: candidate?.uploadedAt || '',
    document: candidate?.document || null,
  }

  const gateStatus = row.ready ? 'pass' : row.attention || row.missing ? 'blocked' : 'warning'
  return {
    version: KINGSTONS_BUYER_OTP_READINESS_VERSION,
    requirement: KINGSTONS_BUYER_OTP_REQUIREMENT,
    rows: [row],
    summary: {
      total: 1,
      ready: row.ready ? 1 : 0,
      missing: row.missing ? 1 : 0,
      pending: state === 'pending' ? 1 : 0,
      attention: row.attention ? 1 : 0,
    },
    gate: {
      status: gateStatus,
      offerConversionReady: gateStatus === 'pass',
      transactionHandoffReady: gateStatus === 'pass',
      salesWorkflowReady: gateStatus === 'pass',
      attorneyReadinessReady: gateStatus === 'pass',
      transactionReadinessReady: gateStatus === 'pass',
      label: gateStatus === 'pass' ? 'OTP-ready' : gateStatus === 'blocked' ? 'Blocked' : 'Pending review',
      reason: gateStatus === 'pass'
        ? 'Signed OTP is uploaded and available as manual Kingston evidence.'
        : row.attention
          ? 'Signed OTP needs attention before offer conversion.'
          : row.missing
            ? 'Signed OTP is missing. Upload the manually signed OTP before converting the buyer offer.'
            : 'Signed OTP is waiting for review before offer conversion.',
    },
    blockers: row.ready
      ? []
      : [{
          key: `kingstons_buyer_otp:${row.key}`,
          documentKey: row.key,
          label: row.label,
          reason: row.missing
            ? 'Signed OTP is missing from buyer offer documents.'
            : 'Signed OTP is not offer-conversion ready yet.',
        }],
  }
}

export function buildKingstonsBuyerOtpOfferLink({
  offer = {},
  document = {},
  actor = {},
  now = new Date().toISOString(),
} = {}) {
  const documentRow = document && typeof document === 'object' ? document : {}
  const offerRow = offer && typeof offer === 'object' ? offer : {}
  const actorRow = actor && typeof actor === 'object' ? actor : {}
  const offerId = firstText(offerRow.canonicalOfferId, offerRow.offerId, offerRow.offer_id, offerRow.id)
  const buyerLeadId = firstText(offerRow.buyerLeadId, offerRow.buyer_lead_id)
  const buyerContactId = firstText(offerRow.buyerContactId, offerRow.buyer_contact_id)
  const documentId = firstText(documentRow.id, documentRow.documentId, documentRow.document_id)
  const storagePath = firstText(documentRow.storage_path, documentRow.file_path, documentRow.filePath)
  const fileUrl = firstText(documentRow.file_url, documentRow.fileUrl, documentRow.url)
  const uploadedAt = firstText(documentRow.uploaded_at, documentRow.uploadedAt, documentRow.created_at, now)

  return {
    version: KINGSTONS_BUYER_OTP_OFFER_LINK_VERSION,
    status: 'signed_otp_received',
    requirementKey: KINGSTONS_BUYER_OTP_REQUIREMENT.key,
    document_type: KINGSTONS_BUYER_OTP_REQUIREMENT.key,
    documentType: KINGSTONS_BUYER_OTP_REQUIREMENT.key,
    documentId: documentId || null,
    sourceDocumentId: documentId || null,
    storage_path: storagePath || null,
    file_url: fileUrl || null,
    documentName: firstText(documentRow.document_name, documentRow.documentName, documentRow.name, documentRow.fileName) || KINGSTONS_BUYER_OTP_REQUIREMENT.label,
    offerId: offerId || null,
    offer_id: offerId || null,
    canonicalOfferId: firstText(offerRow.canonicalOfferId) || null,
    canonical_offer_id: firstText(offerRow.canonicalOfferId) || null,
    buyerLeadId: buyerLeadId || null,
    buyer_lead_id: buyerLeadId || null,
    buyerContactId: buyerContactId || null,
    buyer_contact_id: buyerContactId || null,
    buyerName: firstText(offerRow.buyerName, offerRow.buyer_name) || null,
    linkedAt: now,
    uploadedAt,
    uploaded_at: uploadedAt,
    actorId: firstText(actorRow.id, actorRow.userId) || null,
    actorName: firstText(actorRow.name, actorRow.fullName) || null,
    actorEmail: firstText(actorRow.email) || null,
  }
}

export function buildKingstonsBuyerPortalDecision({
  readiness = null,
  reason = '',
} = {}) {
  const gateStatus = readiness?.gate?.status || 'manual_only'
  const resolvedReason = firstText(
    reason,
    'Kingstons buyer OTP is handled by agent upload. Keep buyer portal and buyer onboarding links out of this manual OTP lane until the digital OTP decision is made.',
  )

  return {
    version: KINGSTONS_BUYER_PORTAL_DECISION_VERSION,
    mode: 'manual_internal',
    gateStatus,
    buyerPortalEnabled: false,
    onboardingLinkEnabled: false,
    digitalOtpEnabled: false,
    manualUploadRequired: true,
    label: 'Manual OTP only',
    actionLabel: 'Upload Signed OTP',
    reason: resolvedReason,
  }
}

export function buildKingstonsBuyerOtpDigitalDecision({
  isKingstons = false,
  requestedAction = '',
} = {}) {
  if (!isKingstons) {
    return {
      version: KINGSTONS_BUYER_OTP_DIGITAL_DECISION_VERSION,
      status: 'available',
      livePath: 'digital_or_manual',
      blocked: false,
      requestedAction,
      digitalOtpEnabled: true,
      message: '',
    }
  }

  return {
    ...KINGSTONS_BUYER_OTP_DIGITAL_DECISION,
    blocked: true,
    requestedAction,
    digitalOtpEnabled: false,
    message: '',
  }
}

export function isKingstonsBuyerOtpDigitalPaused(context = {}) {
  return buildKingstonsBuyerOtpDigitalDecision(context).blocked === true
}
