import {
  buildCanonicalBondApplicationExport,
  hashCanonicalBondApplicationExport,
} from '../canonical/canonicalBondApplicationExport.js'
import {
  validateBondApplicationExportEligibility,
  validateCanonicalBondApplicationExport,
} from '../canonical/validateCanonicalBondApplicationExport.js'
import {
  BOND_APPLICATION_DELIVERY_METHODS,
  buildBondApplicationMappingCoverageReport,
  getBondApplicationDestinationAdapter,
} from '../adapters/bondApplicationAdapterRegistry.js'

export const BOND_APPLICATION_EXPORT_PACKAGE_SCHEMA_VERSION = 'phase-8-export-package-v1'
export const BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_VERSION = 'phase-8h-recipient-formats-v1'
export const BOND_APPLICATION_GOVERNANCE_REPORT_VERSION = 'phase-8i-governance-report-v1'
export const BOND_ORIGINATOR_INTERNAL_READINESS_REPORT_VERSION = 'phase-r1-originator-internal-readiness-v1'
export const BOND_ORIGINATOR_WORKSPACE_MVP_VERSION = 'phase-r2-originator-workspace-mvp-v1'
export const BOND_ORIGINATOR_DOCUMENT_REQUEST_WORKSPACE_VERSION = 'phase-r3-originator-document-requests-v1'
export const BOND_ORIGINATOR_PROGRESS_WORKSPACE_VERSION = 'phase-r4-originator-progress-tracking-v1'
export const BOND_ORIGINATOR_OFFER_GRANT_WORKSPACE_VERSION = 'phase-r5-originator-offers-grants-capture-v1'
export const BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_VERSION = 'phase-r6-one-originator-pilot-v1'
export const BOND_ORIGINATOR_OPERATIONAL_HARDENING_VERSION = 'phase-r7-operational-hardening-v1'
export const BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_VERSION = 'phase-r8-multi-originator-rollout-v1'
export const BOND_ORIGINATOR_FORMAL_INTEGRATION_VERSION = 'phase-r9-optional-formal-integrations-v1'

export const BOND_APPLICATION_EXPORT_PACKAGE_STATUSES = {
  draft: 'draft',
  validationFailed: 'validation_failed',
  readyForReview: 'ready_for_review',
  readyForOriginator: 'ready_for_originator',
  acceptedByOriginator: 'accepted_by_originator',
  approved: 'approved',
  delivering: 'delivering',
  delivered: 'delivered',
  downloaded: 'downloaded',
  deliveryFailed: 'delivery_failed',
  partiallyDelivered: 'partially_delivered',
  cancelled: 'cancelled',
  superseded: 'superseded',
}

export const BOND_APPLICATION_DELIVERY_ATTEMPT_STATUSES = {
  queued: 'queued',
  inProgress: 'in_progress',
  accepted: 'accepted',
  confirmed: 'confirmed',
  failed: 'failed',
  unknown: 'unknown',
  cancelled: 'cancelled',
}

export const BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY = 'bond_originator_intake'
export const BOND_APPLICATION_ORIGINATOR_INTAKE_ADAPTER_VERSION = 'phase-8a-originator-intake-v1'

export const BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS = {
  arch9OriginatorManual: 'arch9_originator_manual',
  oobaOriginatorManual: 'ooba_originator_manual',
  oobaOfficialPayload: 'ooba_official_payload',
  bankOfficialPayload: 'bank_official_payload',
}

export const BOND_APPLICATION_RECIPIENT_FORMAT_KEYS = {
  originatorJson: 'arch9_originator_json',
  originatorSummaryCsv: 'arch9_originator_summary_csv',
  documentManifestCsv: 'arch9_document_manifest_csv',
  oobaOfficialPayload: 'ooba_official_payload',
  bankOfficialPayload: 'bank_official_payload',
}

export const BOND_ORIGINATOR_DOCUMENT_REQUEST_TYPES = {
  missing: 'missing_document',
  replacement: 'replacement_document',
  supplemental: 'supplemental_document',
}

export const BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES = {
  draft: 'draft',
  sent: 'sent',
  viewed: 'viewed',
  inProgress: 'in_progress',
  awaitingReview: 'awaiting_review',
  accepted: 'accepted',
  rejected: 'rejected',
  needsMoreInformation: 'needs_more_information',
  withdrawn: 'withdrawn',
  cancelled: 'cancelled',
}

export const BOND_ORIGINATOR_DOCUMENT_REQUEST_PRIORITIES = {
  normal: 'normal',
  urgent: 'urgent',
}

export const BOND_ORIGINATOR_PROGRESS_EVENT_TYPES = {
  packageReady: 'package_ready',
  packageAccepted: 'package_accepted',
  packageDownloaded: 'package_downloaded',
  documentsRequested: 'documents_requested',
  documentsUploaded: 'documents_uploaded',
  documentsAccepted: 'documents_accepted',
  originatorReviewing: 'originator_reviewing',
  originatorProcessing: 'originator_processing',
  originatorUpdate: 'originator_update',
  onHold: 'on_hold',
  completed: 'completed',
}

export const BOND_ORIGINATOR_PROGRESS_STATUSES = {
  pending: 'pending',
  inProgress: 'in_progress',
  waitingForBuyer: 'waiting_for_buyer',
  awaitingOriginatorReview: 'awaiting_originator_review',
  completed: 'completed',
  onHold: 'on_hold',
}

export const BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS = {
  buyer: 'buyer',
  agent: 'agent',
  originator: 'originator',
  internal: 'internal',
}

export const BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES = {
  draft: 'draft',
  captured: 'captured',
  publishedToBuyer: 'published_to_buyer',
  acceptedByBuyer: 'accepted_by_buyer',
  declinedByBuyer: 'declined_by_buyer',
  withdrawn: 'withdrawn',
  expired: 'expired',
}

export const BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES = {
  draft: 'draft',
  received: 'received',
  publishedToBuyer: 'published_to_buyer',
  buyerSigned: 'buyer_signed',
  submittedForInstruction: 'submitted_for_instruction',
  withdrawn: 'withdrawn',
}

export const BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES = {
  draft: 'draft',
  ready: 'ready',
  active: 'active',
  paused: 'paused',
  completed: 'completed',
  blocked: 'blocked',
}

export const BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES = {
  healthy: 'healthy',
  attentionRequired: 'attention_required',
  blocked: 'blocked',
}

export const BOND_ORIGINATOR_OPERATIONAL_INCIDENT_SEVERITIES = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical',
}

export const BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES = {
  draft: 'draft',
  ready: 'ready',
  active: 'active',
  paused: 'paused',
  completed: 'completed',
  blocked: 'blocked',
}

export const BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES = {
  blocked: 'blocked',
  readyForSandbox: 'ready_for_sandbox',
  sandboxActive: 'sandbox_active',
  paused: 'paused',
  retired: 'retired',
}

export const BOND_BUYER_OFFER_DECISION_STATUSES = {
  accepted: 'accepted',
  declined: 'declined',
}

export const BOND_BUYER_GRANT_ACKNOWLEDGEMENT_STATUSES = {
  acknowledged: 'acknowledged',
  signed: 'signed',
}

export const BOND_APPLICATION_GOVERNANCE_REPORT_STATUSES = {
  clear: 'clear',
  attentionRequired: 'attention_required',
  blocked: 'blocked',
}

export const BOND_ORIGINATOR_INTERNAL_READINESS_STATUSES = {
  ready: 'ready',
  attentionRequired: 'attention_required',
  blocked: 'blocked',
}

export const BOND_ORIGINATOR_WORKSPACE_ASSIGNMENT_STATUSES = {
  assigned: 'assigned',
  accepted: 'accepted',
  revoked: 'revoked',
  completed: 'completed',
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null))
}

function fileSafeText(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'bond-application'
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvRows(rows = []) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

function recipientFormatBlockers(destinationLabel = 'recipient') {
  return [
    {
      code: 'official_schema_missing',
      severity: 'blocker',
      message: `No approved ${destinationLabel} payload schema is present in the repository.`,
    },
    {
      code: 'enum_map_missing',
      severity: 'blocker',
      message: `No approved ${destinationLabel} enum/value map is present in the repository.`,
    },
    {
      code: 'validation_rules_missing',
      severity: 'blocker',
      message: `No approved ${destinationLabel} payload validation rules are present in the repository.`,
    },
    {
      code: 'transport_policy_missing',
      severity: 'blocker',
      message: `No approved ${destinationLabel} live transport policy or credentials are present in the repository.`,
    },
    {
      code: 'acknowledgement_contract_missing',
      severity: 'blocker',
      message: `No approved ${destinationLabel} acknowledgement/status contract is present in the repository.`,
    },
  ]
}

const RECIPIENT_FORMAT_PROFILES = {
  [BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.arch9OriginatorManual]: {
    profileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.arch9OriginatorManual,
    label: 'Arch9 originator manual package',
    recipientType: 'bond_originator',
    profileVersion: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_VERSION,
    supported: true,
    officialPayload: false,
    manualDownloadOnly: true,
    liveDeliveryEnabled: false,
    formatKeys: [
      BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.originatorJson,
      BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.originatorSummaryCsv,
      BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.documentManifestCsv,
    ],
    blockedFormats: [],
    notes: [
      'Prepared for secure manual handoff to an approved bond originator.',
      'Does not submit to a bank or mutate bank workflow.',
    ],
  },
  [BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.oobaOriginatorManual]: {
    profileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.oobaOriginatorManual,
    label: 'OOBA originator manual package',
    recipientType: 'bond_originator',
    profileVersion: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_VERSION,
    supported: true,
    officialPayload: false,
    manualDownloadOnly: true,
    liveDeliveryEnabled: false,
    formatKeys: [
      BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.originatorJson,
      BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.originatorSummaryCsv,
      BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.documentManifestCsv,
    ],
    blockedFormats: [BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.oobaOfficialPayload],
    blockers: recipientFormatBlockers('OOBA official'),
    notes: [
      'OOBA is treated as a bond-originator recipient of the Arch9 information pack.',
      'Official OOBA payload generation remains blocked until OOBA supplies approved schemas and contracts.',
    ],
  },
  [BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.oobaOfficialPayload]: {
    profileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.oobaOfficialPayload,
    label: 'OOBA official payload',
    recipientType: 'bond_originator',
    profileVersion: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_VERSION,
    supported: false,
    officialPayload: true,
    manualDownloadOnly: false,
    liveDeliveryEnabled: false,
    formatKeys: [BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.oobaOfficialPayload],
    blockedFormats: [BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.oobaOfficialPayload],
    blockers: recipientFormatBlockers('OOBA official'),
    notes: ['Blocked until approved OOBA schemas, enum maps, validation rules, transport policy and acknowledgement contracts are supplied.'],
  },
  [BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.bankOfficialPayload]: {
    profileKey: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.bankOfficialPayload,
    label: 'Bank official payload',
    recipientType: 'bank',
    profileVersion: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_VERSION,
    supported: false,
    officialPayload: true,
    manualDownloadOnly: false,
    liveDeliveryEnabled: false,
    formatKeys: [BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.bankOfficialPayload],
    blockedFormats: [BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.bankOfficialPayload],
    blockers: recipientFormatBlockers('bank official'),
    notes: ['Blocked until each bank supplies approved schemas, enum maps, validation rules, transport policy and acknowledgement contracts.'],
  },
}

function hasBlockingIssue(issues = []) {
  return issues.some((issue) => issue.severity === 'blocker')
}

function safeOperationalContext(context = {}) {
  return {
    requestedBy: context.requestedBy || null,
    requestedByRole: context.requestedByRole || null,
    reviewRequired: context.reviewRequired !== false,
    deliveryMode: context.deliveryMode || BOND_APPLICATION_DELIVERY_METHODS.secureExport,
    bankWorkflowUpdateDeferred: true,
    noAutomaticBankSubmission: true,
  }
}

function normalizeDocumentManifestItems(manifest = {}) {
  const shared = Array.isArray(manifest.manifest) ? manifest.manifest : []
  const packageDocuments = Array.isArray(manifest.packageDocuments) ? manifest.packageDocuments : []
  return { shared, packageDocuments }
}

function buildOriginatorDocumentBundleManifest(canonicalExport = {}) {
  const participantDocuments = (canonicalExport.participants || []).flatMap((participant) =>
    (participant.documents || []).map((document) => ({
      ...document,
      participantKey: document.participantKey || participant.participantKey,
      participantRole: document.participantRole || participant.role,
    })),
  )
  const sharedDocuments = normalizeDocumentManifestItems(canonicalExport.documents).shared
  const packageDocuments = normalizeDocumentManifestItems(canonicalExport.documents).packageDocuments
  const supportingDocuments = [...participantDocuments, ...sharedDocuments]
  return {
    signedApplicationDocuments: packageDocuments,
    supportingDocuments,
    participantDocumentCount: participantDocuments.length,
    sharedDocumentCount: sharedDocuments.length,
    packageDocumentCount: packageDocuments.length,
    totalDocumentCount: supportingDocuments.length + packageDocuments.length,
  }
}

function countParticipantsByRole(canonicalExport = {}) {
  return (canonicalExport.participants || []).reduce((accumulator, participant) => {
    const role = participant.role || 'unknown'
    accumulator[role] = (accumulator[role] || 0) + 1
    return accumulator
  }, {})
}

function hasSubmittedSnapshotIssue(issues = []) {
  return issues.some((item) => item.severity === 'blocker')
}

function normalizeOriginatorDocumentRequestType(requestType) {
  return Object.values(BOND_ORIGINATOR_DOCUMENT_REQUEST_TYPES).includes(requestType)
    ? requestType
    : BOND_ORIGINATOR_DOCUMENT_REQUEST_TYPES.supplemental
}

function canRequestOriginatorDocuments(exportPackage = {}) {
  return exportPackage.destinationKey === BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY &&
    [
      BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator,
      BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded,
    ].includes(exportPackage.status)
}

function canRecordOriginatorProgress(exportPackage = {}) {
  return exportPackage.destinationKey === BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY &&
    [
      BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.readyForOriginator,
      BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator,
      BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded,
    ].includes(exportPackage.status)
}

function normalizeOriginatorProgressEventType(eventType) {
  return Object.values(BOND_ORIGINATOR_PROGRESS_EVENT_TYPES).includes(eventType)
    ? eventType
    : BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.originatorUpdate
}

function normalizeOriginatorProgressStatus(status) {
  return Object.values(BOND_ORIGINATOR_PROGRESS_STATUSES).includes(status)
    ? status
    : BOND_ORIGINATOR_PROGRESS_STATUSES.inProgress
}

function originatorProgressStatusLabel(status) {
  const labels = {
    pending: 'Pending',
    in_progress: 'In progress',
    waiting_for_buyer: 'Waiting for buyer',
    awaiting_originator_review: 'Awaiting originator review',
    completed: 'Completed',
    on_hold: 'On hold',
  }
  return labels[status] || 'In progress'
}

function originatorProgressEventTypeLabel(eventType) {
  const labels = {
    package_ready: 'Package ready',
    package_accepted: 'Package accepted',
    package_downloaded: 'Documents downloaded',
    documents_requested: 'Documents requested',
    documents_uploaded: 'Documents uploaded',
    documents_accepted: 'Documents accepted',
    originator_reviewing: 'Originator reviewing',
    originator_processing: 'Originator processing',
    originator_update: 'Progress update',
    on_hold: 'On hold',
    completed: 'Completed',
  }
  return labels[eventType] || 'Progress update'
}

function progressVisibility({ visibleToBuyer = true, visibleToAgent = true, visibleToOriginator = true } = {}) {
  return { visibleToBuyer, visibleToAgent, visibleToOriginator }
}

function normalizeNumberString(value) {
  if (value === null || value === undefined || value === '') return null
  const normalized = String(value).replace(/[^\d.-]/g, '')
  if (!normalized || Number.isNaN(Number(normalized))) return null
  return normalized
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function readCaptureValue(source = {}, camelKey, snakeKey = camelKey) {
  return source?.[camelKey] ?? source?.[snakeKey] ?? null
}

function buildDocumentLookup(documents = []) {
  return new Map(
    (Array.isArray(documents) ? documents : [])
      .map((document) => [normalizeText(document?.id), document])
      .filter(([id]) => Boolean(id)),
  )
}

function buildBuyerDocumentReference(documentId, documentLookup) {
  const id = normalizeText(documentId)
  if (!id) return null
  const document = documentLookup.get(id) || {}
  return {
    id,
    name: normalizeText(document.name || document.fileName || document.file_name) || null,
    category: normalizeText(document.category || document.document_type || document.documentType) || null,
    uploadedAt: document.created_at || document.createdAt || document.uploaded_at || document.uploadedAt || null,
    url: normalizeText(document.url || document.downloadUrl || document.download_url) || null,
  }
}

function buildOriginatorOfferGrantDocumentReference(documentId, documentLookup) {
  const id = normalizeText(documentId)
  if (!id) return null
  const document = documentLookup.get(id) || {}
  return {
    id,
    name: normalizeText(document.name || document.fileName || document.file_name) || null,
    category: normalizeText(document.category || document.document_type || document.documentType) || null,
    uploadedAt: document.created_at || document.createdAt || document.uploaded_at || document.uploadedAt || null,
    secureAccessRequired: true,
  }
}

function isBuyerVisibleOriginatorOffer(offer = {}) {
  return [
    BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.publishedToBuyer,
    BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.acceptedByBuyer,
    BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.declinedByBuyer,
  ].includes(normalizeText(readCaptureValue(offer, 'status')))
}

function isBuyerVisibleOriginatorGrant(grant = {}) {
  return [
    BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.publishedToBuyer,
    BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.buyerSigned,
    BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.submittedForInstruction,
  ].includes(normalizeText(readCaptureValue(grant, 'status')))
}

function canCaptureOriginatorOfferOrGrant(exportPackage = {}) {
  return exportPackage.destinationKey === BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY &&
    [
      BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator,
      BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded,
    ].includes(exportPackage.status)
}

function redactOriginatorDocumentRequestForBuyer(request = {}) {
  const publicRequest = clone(request) || {}
  delete publicRequest.internalNote
  delete publicRequest.metadata?.internal_note
  delete publicRequest.metadata?.raw_originator_context
  return publicRequest
}

function normalizeOriginatorDocumentRequestStatus(status) {
  return Object.values(BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES).includes(status)
    ? status
    : BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.sent
}

function normalizeOriginatorDocumentRequestPriority(priority) {
  return Object.values(BOND_ORIGINATOR_DOCUMENT_REQUEST_PRIORITIES).includes(priority)
    ? priority
    : BOND_ORIGINATOR_DOCUMENT_REQUEST_PRIORITIES.normal
}

function isOpenOriginatorDocumentRequestStatus(status) {
  return [
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.sent,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.viewed,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.inProgress,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.awaitingReview,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.rejected,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.needsMoreInformation,
  ].includes(status)
}

function normalizeOriginatorDocumentRequest(rawRequest = {}) {
  if (!rawRequest || typeof rawRequest !== 'object') return null
  const id = rawRequest.id || rawRequest.requestId || rawRequest.request_id || null
  const exportPackageId = rawRequest.exportPackageId || rawRequest.export_package_id || null
  if (!id && !exportPackageId) return null
  return {
    id,
    exportPackageId,
    transactionId: rawRequest.transactionId || rawRequest.transaction_id || null,
    bondApplicationId: rawRequest.bondApplicationId || rawRequest.bond_application_id || null,
    submissionId: rawRequest.submissionId || rawRequest.submission_id || null,
    sourceSnapshotHash: rawRequest.sourceSnapshotHash || rawRequest.source_snapshot_hash || null,
    destinationKey: rawRequest.destinationKey || rawRequest.destination_key || BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY,
    requestType: normalizeOriginatorDocumentRequestType(rawRequest.requestType || rawRequest.request_type),
    status: normalizeOriginatorDocumentRequestStatus(rawRequest.status),
    priority: normalizeOriginatorDocumentRequestPriority(rawRequest.priority || rawRequest.requestPriority || rawRequest.request_priority),
    targetScope: rawRequest.targetScope || rawRequest.target_scope || 'participant_documents',
    participantId: rawRequest.participantId || rawRequest.participant_id || null,
    participantKey: rawRequest.participantKey || rawRequest.participant_key || null,
    participantRole: rawRequest.participantRole || rawRequest.participant_role || null,
    requirementKey: rawRequest.requirementKey || rawRequest.requirement_key || null,
    canonicalDocumentType: rawRequest.canonicalDocumentType || rawRequest.canonical_document_type || null,
    transactionRequiredDocumentId: rawRequest.transactionRequiredDocumentId || rawRequest.transaction_required_document_id || null,
    linkedDocumentId: rawRequest.linkedDocumentId || rawRequest.linked_document_id || null,
    title: normalizeText(rawRequest.title),
    buyerInstruction: normalizeText(rawRequest.buyerInstruction || rawRequest.buyer_instruction),
    internalNote: normalizeText(rawRequest.internalNote || rawRequest.internal_note),
    buyerSafeFeedback: normalizeText(rawRequest.buyerSafeFeedback || rawRequest.buyer_safe_feedback),
    dueAt: rawRequest.dueAt || rawRequest.due_at || null,
    requestedBy: rawRequest.requestedBy || rawRequest.requested_by || null,
    sentAt: rawRequest.sentAt || rawRequest.sent_at || rawRequest.createdAt || rawRequest.created_at || null,
    firstViewedAt: rawRequest.firstViewedAt || rawRequest.first_viewed_at || null,
    uploadedBy: rawRequest.uploadedBy || rawRequest.uploaded_by || null,
    uploadedAt: rawRequest.uploadedAt || rawRequest.uploaded_at || null,
    submittedForReviewAt: rawRequest.submittedForReviewAt || rawRequest.submitted_for_review_at || null,
    reviewedBy: rawRequest.reviewedBy || rawRequest.reviewed_by || null,
    reviewedAt: rawRequest.reviewedAt || rawRequest.reviewed_at || null,
    resolvedAt: rawRequest.resolvedAt || rawRequest.resolved_at || null,
    withdrawnAt: rawRequest.withdrawnAt || rawRequest.withdrawn_at || null,
    idempotencyKey: rawRequest.idempotencyKey || rawRequest.idempotency_key || null,
    uploadIdempotencyKey: rawRequest.uploadIdempotencyKey || rawRequest.upload_idempotency_key || null,
    requiresNewSubmission: false,
    bankWorkflowUnchanged: rawRequest.bankWorkflowUnchanged !== false && rawRequest.bank_workflow_unchanged !== false,
    createdAt: rawRequest.createdAt || rawRequest.created_at || null,
    updatedAt: rawRequest.updatedAt || rawRequest.updated_at || null,
    metadata: clone(rawRequest.metadata || {}) || {},
  }
}

function originatorDocumentRequestStatusLabel(status) {
  const labels = {
    draft: 'Draft',
    sent: 'Waiting for buyer',
    viewed: 'Viewed by buyer',
    in_progress: 'Buyer working on it',
    awaiting_review: 'Ready for originator review',
    accepted: 'Accepted',
    rejected: 'Rejected',
    needs_more_information: 'Needs more information',
    withdrawn: 'Withdrawn',
    cancelled: 'Cancelled',
  }
  return labels[status] || 'Waiting for buyer'
}

function originatorDocumentRequestGroup(status) {
  if (status === BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.awaitingReview) return 'awaiting_originator_review'
  if ([
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.sent,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.viewed,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.inProgress,
  ].includes(status)) return 'waiting_for_buyer'
  if ([
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.rejected,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.needsMoreInformation,
  ].includes(status)) return 'needs_buyer_action'
  if (status === BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.accepted) return 'resolved'
  return 'closed'
}

function isOriginatorDocumentRequestVisibleToParticipant(request = {}, viewerRole = '', viewerParticipantKey = null) {
  if (request.targetScope === 'application_documents' || !request.participantKey) return true
  if (viewerParticipantKey) return request.participantKey === viewerParticipantKey
  return request.participantRole === normalizeText(viewerRole)
}

export function buildBondOriginatorDocumentRequestViewModel({
  request = {},
  viewer = 'originator',
  viewerRole = '',
  viewerParticipantKey = null,
  internal = false,
} = {}) {
  const normalizedRequest = normalizeOriginatorDocumentRequest(request)
  if (!normalizedRequest) return null
  const viewerKey = normalizeText(viewer) || 'originator'
  const participantViewer = ['buyer', 'participant', 'primary_applicant', 'co_applicant', 'surety'].includes(viewerKey)
  if (!internal && participantViewer && !isOriginatorDocumentRequestVisibleToParticipant(
    normalizedRequest,
    viewerRole || viewerKey,
    viewerParticipantKey,
  )) {
    return null
  }
  const status = normalizedRequest.status
  const base = {
    workspaceVersion: BOND_ORIGINATOR_DOCUMENT_REQUEST_WORKSPACE_VERSION,
    id: normalizedRequest.id,
    exportPackageId: normalizedRequest.exportPackageId,
    transactionId: normalizedRequest.transactionId,
    status,
    statusLabel: originatorDocumentRequestStatusLabel(status),
    group: originatorDocumentRequestGroup(status),
    requestType: normalizedRequest.requestType,
    priority: normalizedRequest.priority,
    targetScope: normalizedRequest.targetScope,
    participantKey: normalizedRequest.participantKey,
    participantRole: normalizedRequest.participantRole,
    requirementKey: normalizedRequest.requirementKey,
    canonicalDocumentType: normalizedRequest.canonicalDocumentType,
    title: normalizedRequest.title,
    buyerInstruction: normalizedRequest.buyerInstruction,
    buyerSafeFeedback: normalizedRequest.buyerSafeFeedback,
    dueAt: normalizedRequest.dueAt,
    sentAt: normalizedRequest.sentAt,
    firstViewedAt: normalizedRequest.firstViewedAt,
    uploadedAt: normalizedRequest.uploadedAt,
    submittedForReviewAt: normalizedRequest.submittedForReviewAt,
    reviewedAt: normalizedRequest.reviewedAt,
    resolvedAt: normalizedRequest.resolvedAt,
    linkedDocumentId: normalizedRequest.linkedDocumentId,
    requiresNewSubmission: false,
    supplementalOnly: true,
    bankWorkflowUnchanged: true,
    actions: {
      canUpload: participantViewer && isOpenOriginatorDocumentRequestStatus(status),
      canMarkViewed: participantViewer && status === BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.sent,
      canReview: viewerKey === 'originator' && status === BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.awaitingReview,
      canAccept: viewerKey === 'originator' && status === BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.awaitingReview && Boolean(normalizedRequest.linkedDocumentId),
      canRequestMoreInformation: viewerKey === 'originator' && status === BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.awaitingReview,
      canWithdraw: viewerKey === 'originator' && isOpenOriginatorDocumentRequestStatus(status),
      canCreateNewSubmission: false,
      canMutateBankWorkflow: false,
    },
    privacy: {
      internalNoteIncluded: Boolean(internal || viewerKey === 'originator'),
      sensitivePayloadIncluded: false,
      tokensExcluded: true,
      publicDocumentUrlsExcluded: true,
    },
  }
  if (internal || viewerKey === 'originator') {
    return {
      ...base,
      requestedBy: normalizedRequest.requestedBy,
      reviewedBy: normalizedRequest.reviewedBy,
      internalNote: normalizedRequest.internalNote,
      transactionRequiredDocumentId: normalizedRequest.transactionRequiredDocumentId,
    }
  }
  return base
}

export function buildBondOriginatorDocumentRequestQueueViewModel({
  exportPackage = {},
  requests = [],
  viewer = 'originator',
  viewerRole = '',
  viewerParticipantKey = null,
  internal = false,
  generatedAt = new Date().toISOString(),
} = {}) {
  const visibleRequests = (Array.isArray(requests) ? requests : [])
    .map((request) => buildBondOriginatorDocumentRequestViewModel({
      request,
      viewer,
      viewerRole,
      viewerParticipantKey,
      internal,
    }))
    .filter(Boolean)
    .sort((left, right) => {
      const prioritySort = left.priority === BOND_ORIGINATOR_DOCUMENT_REQUEST_PRIORITIES.urgent ? -1 : 0
      const otherPrioritySort = right.priority === BOND_ORIGINATOR_DOCUMENT_REQUEST_PRIORITIES.urgent ? -1 : 0
      if (prioritySort !== otherPrioritySort) return prioritySort - otherPrioritySort
      return String(left.dueAt || left.sentAt || '').localeCompare(String(right.dueAt || right.sentAt || ''))
    })
  const summary = buildBondOriginatorDocumentRequestSummary(visibleRequests)
  const grouped = visibleRequests.reduce((accumulator, item) => {
    accumulator[item.group] = accumulator[item.group] || []
    accumulator[item.group].push(item)
    return accumulator
  }, {})
  return {
    available: true,
    workspaceVersion: BOND_ORIGINATOR_DOCUMENT_REQUEST_WORKSPACE_VERSION,
    generatedAt,
    exportPackageId: exportPackage.id || null,
    transactionId: exportPackage.transactionId || null,
    status: summary.open > 0 ? 'open_requests' : 'no_open_requests',
    summary,
    groups: {
      waitingForBuyer: grouped.waiting_for_buyer || [],
      needsBuyerAction: grouped.needs_buyer_action || [],
      awaitingOriginatorReview: grouped.awaiting_originator_review || [],
      resolved: grouped.resolved || [],
      closed: grouped.closed || [],
    },
    requests: visibleRequests,
    emptyState: visibleRequests.length ? null : 'No document requests are visible for this view.',
    actions: {
      canCreateRequest: viewer === 'originator' && canRequestOriginatorDocuments(exportPackage),
      canReviewRequests: viewer === 'originator' && visibleRequests.some((request) => request.actions.canReview),
      canUploadDocuments: viewer !== 'originator' && visibleRequests.some((request) => request.actions.canUpload),
      canCreateNewSubmission: false,
      canMutateBankWorkflow: false,
    },
    workflowBoundary: {
      supplementalOnly: true,
      signedSnapshotUnchanged: true,
      noNewSubmissionVersion: true,
      noAutomaticBankSubmission: true,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
    },
  }
}

export function buildBondOriginatorDocumentRequestTargetOptions({
  exportPackage = {},
  documentManifest = null,
} = {}) {
  const bundle = documentManifest || exportPackage.documentBundleManifest || buildOriginatorDocumentBundleManifest(exportPackage.canonicalExport || {})
  const supportingDocuments = Array.isArray(bundle.supportingDocuments) ? bundle.supportingDocuments : []
  const options = supportingDocuments.map((document) => ({
    key: document.requirementKey || document.canonicalDocumentType || document.matchedDocumentId || document.documentId || null,
    targetScope: document.participantKey || document.participantRole ? 'participant_documents' : 'application_documents',
    participantKey: document.participantKey || null,
    participantRole: document.participantRole || null,
    requirementKey: document.requirementKey || null,
    canonicalDocumentType: document.canonicalDocumentType || document.documentType || null,
    label: document.requirementKey || document.canonicalDocumentType || 'Supporting document',
  })).filter((option) => option.key)
  const unique = new Map(options.map((option) => [option.key, option]))
  return {
    workspaceVersion: BOND_ORIGINATOR_DOCUMENT_REQUEST_WORKSPACE_VERSION,
    exportPackageId: exportPackage.id || null,
    options: [...unique.values()],
    payloadsExcluded: true,
    tokensExcluded: true,
    publicDocumentUrlsExcluded: true,
  }
}

export function buildBondOriginatorDocumentRequestSummary(requests = []) {
  const items = Array.isArray(requests) ? requests : []
  const activeStatuses = new Set([
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.sent,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.viewed,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.inProgress,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.awaitingReview,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.rejected,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.needsMoreInformation,
  ])
  return items.reduce((summary, request) => {
    const status = request.status || BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.sent
    summary.total += 1
    if (activeStatuses.has(status)) summary.open += 1
    if (status === BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.awaitingReview) summary.awaitingReview += 1
    if (status === BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.accepted) summary.accepted += 1
    if (status === BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.rejected) summary.rejected += 1
    if (status === BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.needsMoreInformation) summary.needsMoreInformation += 1
    return summary
  }, {
    total: 0,
    open: 0,
    awaitingReview: 0,
    accepted: 0,
    rejected: 0,
    needsMoreInformation: 0,
  })
}

export function createBondOriginatorDocumentRequest({
  exportPackage = {},
  id = null,
  requestType = BOND_ORIGINATOR_DOCUMENT_REQUEST_TYPES.supplemental,
  participantKey = null,
  participantRole = null,
  participantId = null,
  requirementKey = '',
  canonicalDocumentType = '',
  transactionRequiredDocumentId = null,
  title = '',
  buyerInstruction = '',
  internalNote = '',
  priority = BOND_ORIGINATOR_DOCUMENT_REQUEST_PRIORITIES.normal,
  dueAt = null,
  requestedBy = null,
  idempotencyKey = null,
  existingRequest = null,
  createdAt = new Date().toISOString(),
} = {}) {
  if (existingRequest?.idempotencyKey && idempotencyKey && existingRequest.idempotencyKey === idempotencyKey) {
    return { ok: true, request: clone(existingRequest), idempotent: true }
  }
  if (!canRequestOriginatorDocuments(exportPackage)) {
    return { ok: false, reason: 'originator_package_not_accepted', request: null }
  }
  const safeTitle = normalizeText(title)
  const safeInstruction = normalizeText(buyerInstruction)
  const safeDocumentType = normalizeText(canonicalDocumentType)
  const safeRequirementKey = normalizeText(requirementKey)
  if (!safeTitle || !safeInstruction) {
    return { ok: false, reason: 'buyer_instruction_required', request: null }
  }
  if (!safeDocumentType && !safeRequirementKey) {
    return { ok: false, reason: 'document_target_required', request: null }
  }
  const sharedRequest = !participantKey && !participantRole && !participantId
  const targetScope = sharedRequest ? 'application_documents' : 'participant_documents'
  return {
    ok: true,
    request: {
      id,
      exportPackageId: exportPackage.id || null,
      transactionId: exportPackage.transactionId || null,
      bondApplicationId: exportPackage.bondApplicationId || null,
      submissionId: exportPackage.submissionId || null,
      sourceSnapshotHash: exportPackage.sourceSnapshotHash || null,
      destinationKey: BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY,
      requestType: normalizeOriginatorDocumentRequestType(requestType),
      status: BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.sent,
      priority: normalizeOriginatorDocumentRequestPriority(priority),
      targetScope,
      participantId: participantId || null,
      participantKey: participantKey || null,
      participantRole: participantRole || null,
      requirementKey: safeRequirementKey || null,
      canonicalDocumentType: safeDocumentType || null,
      transactionRequiredDocumentId: transactionRequiredDocumentId || null,
      linkedDocumentId: null,
      title: safeTitle,
      buyerInstruction: safeInstruction,
      internalNote: normalizeText(internalNote),
      buyerSafeFeedback: '',
      dueAt: dueAt || null,
      requestedBy,
      sentAt: createdAt,
      firstViewedAt: null,
      uploadedAt: null,
      submittedForReviewAt: null,
      reviewedAt: null,
      reviewedBy: null,
      idempotencyKey: idempotencyKey || null,
      requiresNewSubmission: false,
      supplementalOnly: true,
      bankWorkflowUnchanged: true,
      createdAt,
      updatedAt: createdAt,
      metadata: {
        source_submission_id: exportPackage.submissionId || null,
        source_snapshot_hash: exportPackage.sourceSnapshotHash || null,
        supplemental_only: true,
        document_request_workspace_version: BOND_ORIGINATOR_DOCUMENT_REQUEST_WORKSPACE_VERSION,
      },
    },
    event: {
      eventType: 'bond_originator_document_request_sent',
      exportPackageId: exportPackage.id || null,
      transactionId: exportPackage.transactionId || null,
      actorId: requestedBy,
      occurredAt: createdAt,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

export function markBondOriginatorDocumentRequestViewed({
  request = {},
  viewedAt = new Date().toISOString(),
} = {}) {
  if (!request.id && !request.exportPackageId) return { ok: false, reason: 'request_required', request }
  if ([
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.accepted,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.withdrawn,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.cancelled,
  ].includes(request.status)) {
    return { ok: true, request, idempotent: true }
  }
  return {
    ok: true,
    request: {
      ...request,
      status: request.status === BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.sent
        ? BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.viewed
        : request.status,
      firstViewedAt: request.firstViewedAt || viewedAt,
      updatedAt: viewedAt,
    },
  }
}

export function recordBondOriginatorRequestedDocumentUpload({
  request = {},
  documentId = null,
  uploadedBy = null,
  uploadedAt = new Date().toISOString(),
  idempotencyKey = null,
} = {}) {
  if (!documentId) return { ok: false, reason: 'document_id_required', request }
  if ([
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.accepted,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.withdrawn,
    BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.cancelled,
  ].includes(request.status)) {
    return { ok: false, reason: 'request_not_open_for_upload', request }
  }
  if (request.linkedDocumentId === documentId && request.uploadIdempotencyKey && request.uploadIdempotencyKey === idempotencyKey) {
    return { ok: true, request, idempotent: true }
  }
  return {
    ok: true,
    request: {
      ...request,
      status: BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.awaitingReview,
      linkedDocumentId: documentId,
      uploadedBy,
      uploadedAt,
      submittedForReviewAt: uploadedAt,
      uploadIdempotencyKey: idempotencyKey || null,
      updatedAt: uploadedAt,
    },
    event: {
      eventType: 'bond_originator_document_uploaded_for_review',
      exportPackageId: request.exportPackageId || null,
      transactionId: request.transactionId || null,
      actorId: uploadedBy,
      occurredAt: uploadedAt,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

export function reviewBondOriginatorRequestedDocument({
  request = {},
  action = '',
  reviewedBy = null,
  reviewedAt = new Date().toISOString(),
  buyerSafeFeedback = '',
  internalNote = '',
} = {}) {
  const statusByAction = {
    accept: BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.accepted,
    reject: BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.rejected,
    more_information: BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.needsMoreInformation,
    withdraw: BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.withdrawn,
  }
  const status = statusByAction[action]
  if (!status) return { ok: false, reason: 'unsupported_review_action', request }
  if (status === BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.accepted && !request.linkedDocumentId) {
    return { ok: false, reason: 'document_required_before_acceptance', request }
  }
  return {
    ok: true,
    request: {
      ...request,
      status,
      buyerSafeFeedback: normalizeText(buyerSafeFeedback) || request.buyerSafeFeedback || '',
      internalNote: normalizeText(internalNote) || request.internalNote || '',
      reviewedAt,
      reviewedBy,
      updatedAt: reviewedAt,
      requiresNewSubmission: false,
      bankWorkflowUnchanged: true,
    },
    event: {
      eventType: status === BOND_ORIGINATOR_DOCUMENT_REQUEST_STATUSES.accepted
        ? 'bond_originator_document_request_accepted'
        : 'bond_originator_document_request_reviewed',
      exportPackageId: request.exportPackageId || null,
      transactionId: request.transactionId || null,
      actorId: reviewedBy,
      occurredAt: reviewedAt,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

export function filterBondOriginatorDocumentRequestsForViewer({
  requests = [],
  viewerRole = '',
  viewerParticipantKey = null,
  internal = false,
} = {}) {
  const items = Array.isArray(requests) ? requests : []
  if (internal) return clone(items)
  const role = normalizeText(viewerRole)
  return items
    .filter((request) => {
      if (request.targetScope === 'application_documents' || !request.participantKey) return true
      if (viewerParticipantKey) return request.participantKey === viewerParticipantKey
      return request.participantRole === role
    })
    .map(redactOriginatorDocumentRequestForBuyer)
}

function buildOriginatorProgressEvent({
  exportPackage = {},
  eventType = BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.originatorUpdate,
  status = BOND_ORIGINATOR_PROGRESS_STATUSES.inProgress,
  title = '',
  summary = '',
  internalNote = '',
  occurredAt = new Date().toISOString(),
  recordedBy = null,
  idempotencyKey = null,
  visibility = {},
  source = 'originator',
  metadata = {},
} = {}) {
  const safeTitle = normalizeText(title)
  const safeSummary = normalizeText(summary)
  return {
    id: null,
    exportPackageId: exportPackage.id || null,
    transactionId: exportPackage.transactionId || null,
    bondApplicationId: exportPackage.bondApplicationId || null,
    submissionId: exportPackage.submissionId || null,
    destinationKey: BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY,
    eventType: normalizeOriginatorProgressEventType(eventType),
    status: normalizeOriginatorProgressStatus(status),
    title: safeTitle,
    summary: safeSummary,
    internalNote: normalizeText(internalNote),
    occurredAt,
    recordedBy,
    idempotencyKey: idempotencyKey || null,
    source,
    visibility: progressVisibility(visibility),
    bankWorkflowUnchanged: true,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    metadata: {
      ...clone(metadata || {}),
      supplemental_tracking_only: true,
    },
  }
}

export function recordBondOriginatorProgressUpdate({
  exportPackage = {},
  eventType = BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.originatorUpdate,
  status = BOND_ORIGINATOR_PROGRESS_STATUSES.inProgress,
  title = '',
  summary = '',
  internalNote = '',
  occurredAt = new Date().toISOString(),
  recordedBy = null,
  idempotencyKey = null,
  existingEvent = null,
  visibility = {},
  metadata = {},
} = {}) {
  if (existingEvent?.idempotencyKey && idempotencyKey && existingEvent.idempotencyKey === idempotencyKey) {
    return { ok: true, progressEvent: clone(existingEvent), idempotent: true }
  }
  if (!canRecordOriginatorProgress(exportPackage)) {
    return { ok: false, reason: 'originator_package_not_ready_for_progress', progressEvent: null }
  }
  if (!normalizeText(title) || !normalizeText(summary)) {
    return { ok: false, reason: 'progress_summary_required', progressEvent: null }
  }
  return {
    ok: true,
    progressEvent: buildOriginatorProgressEvent({
      exportPackage,
      eventType,
      status,
      title,
      summary,
      internalNote,
      occurredAt,
      recordedBy,
      idempotencyKey,
      visibility,
      metadata,
    }),
    event: {
      eventType: 'bond_originator_progress_updated',
      exportPackageId: exportPackage.id || null,
      transactionId: exportPackage.transactionId || null,
      actorId: recordedBy,
      occurredAt,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

function systemProgressEventsFromPackage(exportPackage = {}) {
  const events = []
  if (exportPackage.packageReadyAt || exportPackage.createdAt) {
    events.push(buildOriginatorProgressEvent({
      exportPackage,
      eventType: BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.packageReady,
      status: BOND_ORIGINATOR_PROGRESS_STATUSES.completed,
      title: 'Package ready',
      summary: 'The signed application package is ready for the bond originator.',
      occurredAt: exportPackage.packageReadyAt || exportPackage.createdAt,
      recordedBy: null,
      source: 'system',
      visibility: { visibleToBuyer: false, visibleToAgent: true, visibleToOriginator: true },
    }))
  }
  if (exportPackage.acceptedAt) {
    events.push(buildOriginatorProgressEvent({
      exportPackage,
      eventType: BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.packageAccepted,
      status: BOND_ORIGINATOR_PROGRESS_STATUSES.completed,
      title: 'Package accepted',
      summary: 'The bond originator accepted the application package.',
      occurredAt: exportPackage.acceptedAt,
      recordedBy: exportPackage.acceptedBy || null,
      source: 'system',
    }))
  }
  if (exportPackage.lastDownloadedAt) {
    events.push(buildOriginatorProgressEvent({
      exportPackage,
      eventType: BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.packageDownloaded,
      status: BOND_ORIGINATOR_PROGRESS_STATUSES.completed,
      title: 'Documents downloaded',
      summary: 'The bond originator downloaded the signed application and supporting documents.',
      occurredAt: exportPackage.lastDownloadedAt,
      recordedBy: exportPackage.lastDownloadedBy || null,
      source: 'system',
    }))
  }
  return events
}

function systemProgressEventsFromDocumentRequests({ exportPackage = {}, documentRequests = [] } = {}) {
  const summary = buildBondOriginatorDocumentRequestSummary(documentRequests)
  if (!summary.total) return []
  const latest = documentRequests
    .map((request) => request.updatedAt || request.reviewedAt || request.submittedForReviewAt || request.createdAt || request.sentAt)
    .filter(Boolean)
    .sort()
    .at(-1) || new Date().toISOString()
  const status = summary.open > 0
    ? summary.awaitingReview > 0
      ? BOND_ORIGINATOR_PROGRESS_STATUSES.awaitingOriginatorReview
      : BOND_ORIGINATOR_PROGRESS_STATUSES.waitingForBuyer
    : BOND_ORIGINATOR_PROGRESS_STATUSES.completed
  const summaryText = summary.open > 0
    ? `${summary.open} requested document${summary.open === 1 ? '' : 's'} still open.`
    : 'Requested documents have been accepted.'
  return [buildOriginatorProgressEvent({
    exportPackage,
    eventType: summary.open > 0
      ? BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.documentsRequested
      : BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.documentsAccepted,
    status,
    title: summary.open > 0 ? 'Documents requested' : 'Requested documents complete',
    summary: summaryText,
    occurredAt: latest,
    source: 'system',
  })]
}

export function buildBondOriginatorProgressTimeline({
  exportPackage = {},
  progressEvents = exportPackage.progressEvents || [],
  documentRequests = exportPackage.documentRequests || [],
} = {}) {
  const events = [
    ...systemProgressEventsFromPackage(exportPackage),
    ...systemProgressEventsFromDocumentRequests({ exportPackage, documentRequests }),
    ...(Array.isArray(progressEvents) ? progressEvents : []),
  ]
    .filter(Boolean)
    .map((event) => ({
      ...event,
      eventType: normalizeOriginatorProgressEventType(event.eventType || event.event_type),
      status: normalizeOriginatorProgressStatus(event.status),
      title: normalizeText(event.title) || 'Progress update',
      summary: normalizeText(event.summary),
      internalNote: normalizeText(event.internalNote || event.internal_note),
      occurredAt: event.occurredAt || event.occurred_at || event.createdAt || event.created_at || null,
      visibility: progressVisibility(event.visibility || {
        visibleToBuyer: event.visible_to_buyer !== false,
        visibleToAgent: event.visible_to_agent !== false,
        visibleToOriginator: event.visible_to_originator !== false,
      }),
      bankWorkflowUnchanged: true,
    }))
    .sort((left, right) => String(left.occurredAt || '').localeCompare(String(right.occurredAt || '')))
  const latest = events.at(-1) || null
  return {
    events,
    summary: {
      totalEvents: events.length,
      currentStatus: latest?.status || BOND_ORIGINATOR_PROGRESS_STATUSES.pending,
      currentLabel: latest?.title || 'Originator progress pending',
      currentSummary: latest?.summary || '',
      lastUpdatedAt: latest?.occurredAt || null,
      bankWorkflowUnchanged: true,
    },
  }
}

export function filterBondOriginatorProgressForViewer({
  timeline = {},
  viewer = 'agent',
  internal = false,
} = {}) {
  const viewerKey = normalizeText(viewer) || 'agent'
  const sourceEvents = Array.isArray(timeline.events) ? timeline.events : []
  if (internal) return clone(timeline) || { events: [], summary: {} }
  const events = sourceEvents
    .filter((event) => {
      if (viewerKey === 'originator') return event.visibility?.visibleToOriginator !== false
      if (viewerKey === 'buyer') return event.visibility?.visibleToBuyer !== false
      return event.visibility?.visibleToAgent !== false
    })
    .map((event) => {
      const publicEvent = clone(event) || {}
      delete publicEvent.internalNote
      delete publicEvent.idempotencyKey
      delete publicEvent.metadata?.internal_note
      return publicEvent
    })
  const latest = events.at(-1) || null
  return {
    events,
    summary: {
      totalEvents: events.length,
      currentStatus: latest?.status || BOND_ORIGINATOR_PROGRESS_STATUSES.pending,
      currentLabel: latest?.title || 'Originator progress pending',
      currentSummary: latest?.summary || '',
      lastUpdatedAt: latest?.occurredAt || null,
      bankWorkflowUnchanged: true,
    },
  }
}

function normalizeOriginatorProgressEvent(rawEvent = {}) {
  if (!rawEvent || typeof rawEvent !== 'object') return null
  return {
    id: rawEvent.id || null,
    exportPackageId: rawEvent.exportPackageId || rawEvent.export_package_id || null,
    transactionId: rawEvent.transactionId || rawEvent.transaction_id || null,
    bondApplicationId: rawEvent.bondApplicationId || rawEvent.bond_application_id || null,
    submissionId: rawEvent.submissionId || rawEvent.submission_id || null,
    destinationKey: rawEvent.destinationKey || rawEvent.destination_key || BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY,
    eventType: normalizeOriginatorProgressEventType(rawEvent.eventType || rawEvent.event_type),
    status: normalizeOriginatorProgressStatus(rawEvent.status),
    title: normalizeText(rawEvent.title) || originatorProgressEventTypeLabel(rawEvent.eventType || rawEvent.event_type),
    summary: normalizeText(rawEvent.summary),
    internalNote: normalizeText(rawEvent.internalNote || rawEvent.internal_note),
    occurredAt: rawEvent.occurredAt || rawEvent.occurred_at || rawEvent.createdAt || rawEvent.created_at || null,
    recordedBy: rawEvent.recordedBy || rawEvent.recorded_by || null,
    idempotencyKey: rawEvent.idempotencyKey || rawEvent.idempotency_key || null,
    source: rawEvent.source || 'originator',
    visibility: progressVisibility(rawEvent.visibility || {
      visibleToBuyer: rawEvent.visible_to_buyer !== false,
      visibleToAgent: rawEvent.visible_to_agent !== false,
      visibleToOriginator: rawEvent.visible_to_originator !== false,
    }),
    bankWorkflowUnchanged: rawEvent.bankWorkflowUnchanged !== false && rawEvent.bank_workflow_unchanged !== false,
    offerWorkflowUnchanged: rawEvent.offerWorkflowUnchanged !== false && rawEvent.offer_workflow_unchanged !== false,
    grantWorkflowUnchanged: rawEvent.grantWorkflowUnchanged !== false && rawEvent.grant_workflow_unchanged !== false,
    metadata: clone(rawEvent.metadata || {}) || {},
  }
}

export function buildBondOriginatorProgressEventViewModel({
  event = {},
  viewer = BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.agent,
  internal = false,
} = {}) {
  const normalizedEvent = normalizeOriginatorProgressEvent(event)
  if (!normalizedEvent) return null
  const viewerKey = normalizeText(viewer) || BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.agent
  if (!internal) {
    if (viewerKey === BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.buyer && normalizedEvent.visibility.visibleToBuyer === false) return null
    if (viewerKey === BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.agent && normalizedEvent.visibility.visibleToAgent === false) return null
    if (viewerKey === BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.originator && normalizedEvent.visibility.visibleToOriginator === false) return null
  }
  const view = {
    workspaceVersion: BOND_ORIGINATOR_PROGRESS_WORKSPACE_VERSION,
    id: normalizedEvent.id,
    exportPackageId: normalizedEvent.exportPackageId,
    transactionId: normalizedEvent.transactionId,
    eventType: normalizedEvent.eventType,
    eventTypeLabel: originatorProgressEventTypeLabel(normalizedEvent.eventType),
    status: normalizedEvent.status,
    statusLabel: originatorProgressStatusLabel(normalizedEvent.status),
    title: normalizedEvent.title,
    summary: normalizedEvent.summary,
    occurredAt: normalizedEvent.occurredAt,
    source: normalizedEvent.source,
    visibility: normalizedEvent.visibility,
    bankWorkflowUnchanged: true,
    offerWorkflowUnchanged: true,
    grantWorkflowUnchanged: true,
    trackingOnly: true,
    sensitivePayloadIncluded: false,
  }
  if (internal || viewerKey === BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.originator) {
    return {
      ...view,
      recordedBy: normalizedEvent.recordedBy,
      internalNote: normalizedEvent.internalNote,
    }
  }
  return view
}

export function buildBondOriginatorProgressMilestones({
  exportPackage = {},
  progressEvents = exportPackage.progressEvents || [],
  documentRequests = exportPackage.documentRequests || [],
  offerCaptures = exportPackage.offerCaptures || [],
  grantCaptures = exportPackage.grantCaptures || [],
} = {}) {
  const timeline = buildBondOriginatorProgressTimeline({ exportPackage, progressEvents, documentRequests })
  const events = timeline.events || []
  const hasEventType = (eventType) => events.some((event) => event.eventType === eventType)
  const documentSummary = buildBondOriginatorDocumentRequestSummary(documentRequests)
  const offerGrantSummary = buildBondOriginatorOfferGrantSummary({ offerCaptures, grantCaptures })
  const milestones = [
    {
      key: 'package_ready',
      label: 'Package ready',
      status: hasEventType(BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.packageReady) ? 'complete' : 'pending',
      completedAt: events.find((event) => event.eventType === BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.packageReady)?.occurredAt || null,
    },
    {
      key: 'package_accepted',
      label: 'Package accepted',
      status: hasEventType(BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.packageAccepted) ? 'complete' : 'pending',
      completedAt: exportPackage.acceptedAt || null,
    },
    {
      key: 'documents_downloaded',
      label: 'Documents downloaded',
      status: hasEventType(BOND_ORIGINATOR_PROGRESS_EVENT_TYPES.packageDownloaded) ? 'complete' : 'pending',
      completedAt: exportPackage.lastDownloadedAt || null,
    },
    {
      key: 'document_requests',
      label: 'Document requests',
      status: documentSummary.open > 0
        ? documentSummary.awaitingReview > 0 ? 'awaiting_originator_review' : 'waiting_for_buyer'
        : documentSummary.total > 0 ? 'complete' : 'not_started',
      count: documentSummary.total,
      open: documentSummary.open,
    },
    {
      key: 'offers',
      label: 'Offers captured',
      status: offerGrantSummary.offerCount > 0 ? 'in_progress' : 'not_started',
      count: offerGrantSummary.offerCount,
      published: offerGrantSummary.publishedOfferCount,
      accepted: offerGrantSummary.acceptedOfferCount,
    },
    {
      key: 'grants',
      label: 'Grants captured',
      status: offerGrantSummary.grantCount > 0 ? 'in_progress' : 'not_started',
      count: offerGrantSummary.grantCount,
      published: offerGrantSummary.publishedGrantCount,
      signed: offerGrantSummary.signedGrantCount,
    },
  ]
  return {
    workspaceVersion: BOND_ORIGINATOR_PROGRESS_WORKSPACE_VERSION,
    milestones,
    current: {
      status: timeline.summary.currentStatus,
      statusLabel: originatorProgressStatusLabel(timeline.summary.currentStatus),
      label: timeline.summary.currentLabel,
      summary: timeline.summary.currentSummary,
      lastUpdatedAt: timeline.summary.lastUpdatedAt,
    },
    trackingOnly: true,
    bankWorkflowUnchanged: true,
    offerWorkflowUnchanged: true,
    grantWorkflowUnchanged: true,
  }
}

export function buildBondOriginatorProgressWorkspaceViewModel({
  exportPackage = {},
  progressEvents = exportPackage.progressEvents || [],
  documentRequests = exportPackage.documentRequests || [],
  offerCaptures = exportPackage.offerCaptures || [],
  grantCaptures = exportPackage.grantCaptures || [],
  viewer = BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.originator,
  internal = false,
  generatedAt = new Date().toISOString(),
} = {}) {
  const timeline = buildBondOriginatorProgressTimeline({ exportPackage, progressEvents, documentRequests })
  const events = (timeline.events || [])
    .map((event) => buildBondOriginatorProgressEventViewModel({ event, viewer, internal }))
    .filter(Boolean)
  const latest = events.at(-1) || null
  const milestones = buildBondOriginatorProgressMilestones({
    exportPackage,
    progressEvents,
    documentRequests,
    offerCaptures,
    grantCaptures,
  })
  const nextActions = []
  if (!exportPackage.acceptedAt) nextActions.push('Originator package acceptance is still outstanding.')
  if (exportPackage.acceptedAt && !exportPackage.lastDownloadedAt) nextActions.push('Download the signed application and supporting documents.')
  const documentSummary = buildBondOriginatorDocumentRequestSummary(documentRequests)
  if (documentSummary.open > 0) nextActions.push('Continue resolving open document requests.')
  if (documentSummary.awaitingReview > 0) nextActions.push('Review uploaded requested documents.')
  if (!nextActions.length) nextActions.push('Record safe progress updates as the originator processes the application externally.')
  return {
    available: true,
    workspaceVersion: BOND_ORIGINATOR_PROGRESS_WORKSPACE_VERSION,
    generatedAt,
    exportPackageId: exportPackage.id || null,
    transactionId: exportPackage.transactionId || null,
    status: latest?.status || BOND_ORIGINATOR_PROGRESS_STATUSES.pending,
    statusLabel: latest?.statusLabel || 'Pending',
    headline: latest?.title || 'Originator progress pending',
    summary: latest?.summary || 'No visible originator progress update has been recorded yet.',
    lastUpdatedAt: latest?.occurredAt || null,
    milestones: milestones.milestones,
    events,
    nextActions,
    actions: {
      canRecordProgress: viewer === BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.originator && canRecordOriginatorProgress(exportPackage),
      canMarkComplete: viewer === BOND_ORIGINATOR_PROGRESS_VISIBILITY_KEYS.originator && canRecordOriginatorProgress(exportPackage),
      canMutateBankWorkflow: false,
      canCreateOffer: false,
      canCreateGrant: false,
      canLiveDeliver: false,
    },
    trackingOnly: true,
    workflowBoundary: {
      originatorProcessesExternally: true,
      progressIsNotBankDecision: true,
      noAutomaticBankSubmission: true,
      liveDeliveryEnabled: false,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
    },
  }
}

export function createBondOriginatorBankOfferCapture({
  exportPackage = {},
  id = null,
  bankName = '',
  offeredAmount = null,
  interestRate = null,
  interestRateType = '',
  interestRateDisplay = '',
  monthlyRepayment = null,
  termMonths = null,
  validUntil = null,
  quoteDocumentId = null,
  conditionsSummary = '',
  capturedBy = null,
  idempotencyKey = null,
  existingOfferCapture = null,
  capturedAt = new Date().toISOString(),
} = {}) {
  if (existingOfferCapture?.idempotencyKey && idempotencyKey && existingOfferCapture.idempotencyKey === idempotencyKey) {
    return { ok: true, offerCapture: clone(existingOfferCapture), idempotent: true }
  }
  if (!canCaptureOriginatorOfferOrGrant(exportPackage)) {
    return { ok: false, reason: 'originator_package_not_accepted', offerCapture: null }
  }
  const safeBankName = normalizeText(bankName)
  if (!safeBankName) return { ok: false, reason: 'bank_name_required', offerCapture: null }
  const offerCapture = {
    id,
    exportPackageId: exportPackage.id || null,
    transactionId: exportPackage.transactionId || null,
    bondApplicationId: exportPackage.bondApplicationId || null,
    submissionId: exportPackage.submissionId || null,
    sourceSnapshotHash: exportPackage.sourceSnapshotHash || null,
    destinationKey: BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY,
    bankName: safeBankName,
    offeredAmount: normalizeNumberString(offeredAmount),
    interestRate: normalizeNumberString(interestRate),
    interestRateType: normalizeText(interestRateType) || null,
    interestRateDisplay: normalizeText(interestRateDisplay) || null,
    monthlyRepayment: normalizeNumberString(monthlyRepayment),
    termMonths: normalizeInteger(termMonths),
    validUntil: validUntil || null,
    quoteDocumentId: quoteDocumentId || null,
    conditionsSummary: normalizeText(conditionsSummary),
    status: BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.captured,
    capturedBy,
    capturedAt,
    publishedAt: null,
    publishedBy: null,
    buyerDecision: null,
    buyerDecisionAt: null,
    linkedBondQuoteId: null,
    idempotencyKey: idempotencyKey || null,
    createsBankApplication: false,
    workflowMutationRequired: false,
    bankWorkflowUnchanged: true,
    offerWorkflowUnchanged: true,
    grantWorkflowUnchanged: true,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    metadata: {
      source_submission_id: exportPackage.submissionId || null,
      source_snapshot_hash: exportPackage.sourceSnapshotHash || null,
      originator_supplied: true,
    },
  }
  return {
    ok: true,
    offerCapture,
    quoteWriteProposal: {
      action: 'create_transaction_bond_quote',
      requiresAuthorizedOriginatorReview: true,
      automaticWrite: false,
      payload: {
        transactionId: offerCapture.transactionId,
        bankName: offerCapture.bankName,
        quotedAmount: offerCapture.offeredAmount,
        interestRate: offerCapture.interestRate,
        interestRateType: offerCapture.interestRateType,
        interestRateDisplay: offerCapture.interestRateDisplay,
        monthlyRepayment: offerCapture.monthlyRepayment,
        termMonths: offerCapture.termMonths,
        validUntil: offerCapture.validUntil,
        quoteDocumentId: offerCapture.quoteDocumentId,
        notes: offerCapture.conditionsSummary,
      },
    },
    event: {
      eventType: 'bond_originator_bank_offer_captured',
      exportPackageId: exportPackage.id || null,
      transactionId: exportPackage.transactionId || null,
      actorId: capturedBy,
      occurredAt: capturedAt,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

export function publishBondOriginatorBankOfferToBuyer({
  offerCapture = {},
  publishedBy = null,
  publishedAt = new Date().toISOString(),
  linkedBondQuoteId = null,
} = {}) {
  if (!offerCapture.id && !offerCapture.exportPackageId) return { ok: false, reason: 'offer_capture_required', offerCapture }
  if (offerCapture.status === BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.publishedToBuyer) {
    return { ok: true, offerCapture, idempotent: true }
  }
  if (![BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.captured, BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.draft].includes(offerCapture.status)) {
    return { ok: false, reason: 'offer_capture_not_publishable', offerCapture }
  }
  return {
    ok: true,
    offerCapture: {
      ...offerCapture,
      status: BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.publishedToBuyer,
      publishedBy,
      publishedAt,
      linkedBondQuoteId: linkedBondQuoteId || offerCapture.linkedBondQuoteId || null,
      updatedAt: publishedAt,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
    },
    event: {
      eventType: 'bond_originator_bank_offer_published_to_buyer',
      exportPackageId: offerCapture.exportPackageId || null,
      transactionId: offerCapture.transactionId || null,
      actorId: publishedBy,
      occurredAt: publishedAt,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

export function recordBondOriginatorOfferBuyerDecision({
  offerCapture = {},
  decision = '',
  decidedBy = null,
  decidedAt = new Date().toISOString(),
} = {}) {
  const normalizedDecision = normalizeText(decision).toLowerCase()
  if (!['accepted', 'declined'].includes(normalizedDecision)) {
    return { ok: false, reason: 'unsupported_offer_decision', offerCapture }
  }
  if (offerCapture.status !== BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.publishedToBuyer) {
    return { ok: false, reason: 'offer_not_published_to_buyer', offerCapture }
  }
  return {
    ok: true,
    offerCapture: {
      ...offerCapture,
      status: normalizedDecision === 'accepted'
        ? BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.acceptedByBuyer
        : BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.declinedByBuyer,
      buyerDecision: normalizedDecision,
      buyerDecisionAt: decidedAt,
      buyerDecisionBy: decidedBy,
      updatedAt: decidedAt,
      bankWorkflowUnchanged: true,
    },
    offerDecisionProposal: {
      action: 'record_bond_offer_decision',
      requiresBuyerAuthority: true,
      automaticWrite: false,
      linkedBondQuoteId: offerCapture.linkedBondQuoteId || null,
      decision: normalizedDecision,
    },
    event: {
      eventType: normalizedDecision === 'accepted'
        ? 'bond_originator_bank_offer_accepted_by_buyer'
        : 'bond_originator_bank_offer_declined_by_buyer',
      exportPackageId: offerCapture.exportPackageId || null,
      transactionId: offerCapture.transactionId || null,
      actorId: decidedBy,
      occurredAt: decidedAt,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

export function buildBondOriginatorBuyerOfferDecision({
  offerCapture = {},
  decision = '',
  decidedBy = null,
  decidedAt = new Date().toISOString(),
} = {}) {
  const normalizedDecision = normalizeText(decision).toLowerCase()
  if (!Object.values(BOND_BUYER_OFFER_DECISION_STATUSES).includes(normalizedDecision)) {
    return { ok: false, reason: 'unsupported_offer_decision', offerCapture }
  }
  if (!isBuyerVisibleOriginatorOffer(offerCapture)) {
    return { ok: false, reason: 'offer_not_visible_to_buyer', offerCapture }
  }
  const publishedOffer = {
    ...offerCapture,
    status: BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.publishedToBuyer,
  }
  return recordBondOriginatorOfferBuyerDecision({
    offerCapture: publishedOffer,
    decision: normalizedDecision,
    decidedBy,
    decidedAt,
  })
}

export function createBondOriginatorGrantCapture({
  exportPackage = {},
  id = null,
  offerCaptureId = null,
  linkedBondQuoteId = null,
  bankName = '',
  approvedAmount = null,
  grantDocumentId = null,
  signedGrantDocumentId = null,
  grantReference = '',
  conditionsSummary = '',
  capturedBy = null,
  idempotencyKey = null,
  existingGrantCapture = null,
  capturedAt = new Date().toISOString(),
} = {}) {
  if (existingGrantCapture?.idempotencyKey && idempotencyKey && existingGrantCapture.idempotencyKey === idempotencyKey) {
    return { ok: true, grantCapture: clone(existingGrantCapture), idempotent: true }
  }
  if (!canCaptureOriginatorOfferOrGrant(exportPackage)) {
    return { ok: false, reason: 'originator_package_not_accepted', grantCapture: null }
  }
  const safeBankName = normalizeText(bankName)
  if (!safeBankName) return { ok: false, reason: 'bank_name_required', grantCapture: null }
  if (!grantDocumentId) return { ok: false, reason: 'grant_document_required', grantCapture: null }
  const grantCapture = {
    id,
    exportPackageId: exportPackage.id || null,
    transactionId: exportPackage.transactionId || null,
    bondApplicationId: exportPackage.bondApplicationId || null,
    submissionId: exportPackage.submissionId || null,
    sourceSnapshotHash: exportPackage.sourceSnapshotHash || null,
    destinationKey: BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY,
    offerCaptureId: offerCaptureId || null,
    linkedBondQuoteId: linkedBondQuoteId || null,
    bankName: safeBankName,
    approvedAmount: normalizeNumberString(approvedAmount),
    grantDocumentId,
    signedGrantDocumentId: signedGrantDocumentId || null,
    grantReference: normalizeText(grantReference) || null,
    conditionsSummary: normalizeText(conditionsSummary),
    status: signedGrantDocumentId
      ? BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.buyerSigned
      : BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.received,
    capturedBy,
    capturedAt,
    publishedAt: null,
    publishedBy: null,
    idempotencyKey: idempotencyKey || null,
    createsBankApplication: false,
    bankWorkflowUnchanged: true,
    offerWorkflowUnchanged: true,
    grantWorkflowUnchanged: true,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    metadata: {
      source_submission_id: exportPackage.submissionId || null,
      source_snapshot_hash: exportPackage.sourceSnapshotHash || null,
      originator_supplied: true,
    },
  }
  return {
    ok: true,
    grantCapture,
    grantMilestoneProposal: {
      action: signedGrantDocumentId ? 'record_grant_signed' : 'record_grant_received',
      requiresAuthorizedOriginatorReview: true,
      automaticWrite: false,
      payload: {
        transactionId: grantCapture.transactionId,
        acceptedBondOfferId: grantCapture.linkedBondQuoteId,
        grantDocumentId: grantCapture.grantDocumentId,
        signedGrantDocumentId: grantCapture.signedGrantDocumentId,
        notes: grantCapture.conditionsSummary,
      },
    },
    event: {
      eventType: 'bond_originator_grant_captured',
      exportPackageId: exportPackage.id || null,
      transactionId: exportPackage.transactionId || null,
      actorId: capturedBy,
      occurredAt: capturedAt,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

export function publishBondOriginatorGrantToBuyer({
  grantCapture = {},
  publishedBy = null,
  publishedAt = new Date().toISOString(),
} = {}) {
  if (!grantCapture.id && !grantCapture.exportPackageId) return { ok: false, reason: 'grant_capture_required', grantCapture }
  if (grantCapture.status === BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.publishedToBuyer) {
    return { ok: true, grantCapture, idempotent: true }
  }
  if (![BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.received, BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.buyerSigned].includes(grantCapture.status)) {
    return { ok: false, reason: 'grant_capture_not_publishable', grantCapture }
  }
  return {
    ok: true,
    grantCapture: {
      ...grantCapture,
      status: BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.publishedToBuyer,
      publishedBy,
      publishedAt,
      updatedAt: publishedAt,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
    },
    event: {
      eventType: 'bond_originator_grant_published_to_buyer',
      exportPackageId: grantCapture.exportPackageId || null,
      transactionId: grantCapture.transactionId || null,
      actorId: publishedBy,
      occurredAt: publishedAt,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

export function buildBondOriginatorBuyerGrantAcknowledgement({
  grantCapture = {},
  acknowledgedBy = null,
  acknowledgedAt = new Date().toISOString(),
  signedGrantDocumentId = null,
} = {}) {
  if (!isBuyerVisibleOriginatorGrant(grantCapture)) {
    return { ok: false, reason: 'grant_not_visible_to_buyer', grantCapture }
  }
  const acknowledgementStatus = signedGrantDocumentId
    ? BOND_BUYER_GRANT_ACKNOWLEDGEMENT_STATUSES.signed
    : BOND_BUYER_GRANT_ACKNOWLEDGEMENT_STATUSES.acknowledged
  return {
    ok: true,
    grantAcknowledgement: {
      id: null,
      exportPackageId: grantCapture.exportPackageId || null,
      transactionId: grantCapture.transactionId || null,
      bondApplicationId: grantCapture.bondApplicationId || null,
      submissionId: grantCapture.submissionId || null,
      grantCaptureId: grantCapture.id || null,
      linkedBondQuoteId: grantCapture.linkedBondQuoteId || null,
      bankName: grantCapture.bankName || null,
      acknowledgedBy,
      acknowledgedAt,
      signedGrantDocumentId: signedGrantDocumentId || grantCapture.signedGrantDocumentId || null,
      status: acknowledgementStatus,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
      createdAt: acknowledgedAt,
      updatedAt: acknowledgedAt,
    },
    grantMilestoneProposal: {
      action: signedGrantDocumentId ? 'record_grant_signed' : 'record_grant_acknowledged',
      requiresBuyerAuthority: true,
      automaticWrite: false,
      linkedBondQuoteId: grantCapture.linkedBondQuoteId || null,
      grantCaptureId: grantCapture.id || null,
      signedGrantDocumentId: signedGrantDocumentId || null,
    },
    event: {
      eventType: signedGrantDocumentId
        ? 'bond_originator_grant_signed_by_buyer'
        : 'bond_originator_grant_acknowledged_by_buyer',
      exportPackageId: grantCapture.exportPackageId || null,
      transactionId: grantCapture.transactionId || null,
      actorId: acknowledgedBy,
      occurredAt: acknowledgedAt,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

export function buildBondOriginatorOfferGrantSummary({
  offerCaptures = [],
  grantCaptures = [],
} = {}) {
  const offers = Array.isArray(offerCaptures) ? offerCaptures : []
  const grants = Array.isArray(grantCaptures) ? grantCaptures : []
  return {
    offerCount: offers.length,
    publishedOfferCount: offers.filter((offer) => offer.status === BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.publishedToBuyer).length,
    acceptedOfferCount: offers.filter((offer) => offer.status === BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.acceptedByBuyer).length,
    grantCount: grants.length,
    publishedGrantCount: grants.filter((grant) => grant.status === BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.publishedToBuyer).length,
    signedGrantCount: grants.filter((grant) => [
      BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.buyerSigned,
      BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.submittedForInstruction,
    ].includes(grant.status)).length,
    bankWorkflowUnchanged: true,
  }
}

export function buildBondOriginatorBuyerOfferGrantViewModel({
  exportPackage = {},
  offerCaptures = null,
  grantCaptures = null,
  documents = [],
  acceptedOfferId = '',
  declinedOfferIds = [],
  signedOfferDocumentId = '',
} = {}) {
  const packageOffers = Array.isArray(offerCaptures)
    ? offerCaptures
    : Array.isArray(exportPackage.offerCaptures)
      ? exportPackage.offerCaptures
      : Array.isArray(exportPackage.offer_captures)
        ? exportPackage.offer_captures
        : Array.isArray(exportPackage.transaction_bond_originator_bank_offer_captures)
          ? exportPackage.transaction_bond_originator_bank_offer_captures
          : []
  const packageGrants = Array.isArray(grantCaptures)
    ? grantCaptures
    : Array.isArray(exportPackage.grantCaptures)
      ? exportPackage.grantCaptures
      : Array.isArray(exportPackage.grant_captures)
        ? exportPackage.grant_captures
        : Array.isArray(exportPackage.transaction_bond_originator_grant_captures)
          ? exportPackage.transaction_bond_originator_grant_captures
          : []
  const documentLookup = buildDocumentLookup(documents)
  const declinedSet = new Set(
    (Array.isArray(declinedOfferIds) ? declinedOfferIds : [])
      .map((value) => normalizeText(value))
      .filter(Boolean),
  )
  const acceptedId = normalizeText(acceptedOfferId)

  const offers = packageOffers
    .filter(isBuyerVisibleOriginatorOffer)
    .map((offer) => {
      const id = normalizeText(readCaptureValue(offer, 'id'))
      const sourceStatus = normalizeText(readCaptureValue(offer, 'status'))
      const buyerDecision = normalizeText(readCaptureValue(offer, 'buyerDecision', 'buyer_decision'))
      const isAccepted = Boolean(acceptedId && id === acceptedId) ||
        buyerDecision === BOND_BUYER_OFFER_DECISION_STATUSES.accepted ||
        sourceStatus === BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.acceptedByBuyer
      const isDeclined = declinedSet.has(id) ||
        buyerDecision === BOND_BUYER_OFFER_DECISION_STATUSES.declined ||
        sourceStatus === BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.declinedByBuyer
      return {
        id,
        source: 'originator_capture',
        bankName: normalizeText(readCaptureValue(offer, 'bankName', 'bank_name')) || 'Bank',
        offeredAmount: normalizeNumberString(readCaptureValue(offer, 'offeredAmount', 'offered_amount')),
        interestRate: normalizeNumberString(readCaptureValue(offer, 'interestRate', 'interest_rate')),
        interestRateType: normalizeText(readCaptureValue(offer, 'interestRateType', 'interest_rate_type')),
        interestRateDisplay: normalizeText(readCaptureValue(offer, 'interestRateDisplay', 'interest_rate_display')),
        monthlyRepayment: normalizeNumberString(readCaptureValue(offer, 'monthlyRepayment', 'monthly_repayment')),
        termMonths: normalizeInteger(readCaptureValue(offer, 'termMonths', 'term_months')),
        validUntil: readCaptureValue(offer, 'validUntil', 'valid_until'),
        conditionsSummary: normalizeText(readCaptureValue(offer, 'conditionsSummary', 'conditions_summary')),
        quoteDocumentId: normalizeText(readCaptureValue(offer, 'quoteDocumentId', 'quote_document_id')),
        quoteDocument: buildBuyerDocumentReference(readCaptureValue(offer, 'quoteDocumentId', 'quote_document_id'), documentLookup),
        linkedBondQuoteId: normalizeText(readCaptureValue(offer, 'linkedBondQuoteId', 'linked_bond_quote_id')),
        publishedAt: readCaptureValue(offer, 'publishedAt', 'published_at'),
        capturedAt: readCaptureValue(offer, 'capturedAt', 'captured_at') || readCaptureValue(offer, 'createdAt', 'created_at'),
        status: isAccepted
          ? BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.acceptedByBuyer
          : isDeclined
            ? BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.declinedByBuyer
            : sourceStatus,
        buyerDecision: isAccepted
          ? BOND_BUYER_OFFER_DECISION_STATUSES.accepted
          : isDeclined
            ? BOND_BUYER_OFFER_DECISION_STATUSES.declined
            : null,
        canAccept: !isAccepted,
        canDecline: !isDeclined,
      }
    })

  const grants = packageGrants
    .filter(isBuyerVisibleOriginatorGrant)
    .map((grant) => ({
      id: normalizeText(readCaptureValue(grant, 'id')),
      source: 'originator_capture',
      bankName: normalizeText(readCaptureValue(grant, 'bankName', 'bank_name')) || 'Bank',
      approvedAmount: normalizeNumberString(readCaptureValue(grant, 'approvedAmount', 'approved_amount')),
      grantReference: normalizeText(readCaptureValue(grant, 'grantReference', 'grant_reference')),
      conditionsSummary: normalizeText(readCaptureValue(grant, 'conditionsSummary', 'conditions_summary')),
      grantDocumentId: normalizeText(readCaptureValue(grant, 'grantDocumentId', 'grant_document_id')),
      signedGrantDocumentId: normalizeText(readCaptureValue(grant, 'signedGrantDocumentId', 'signed_grant_document_id')),
      grantDocument: buildBuyerDocumentReference(readCaptureValue(grant, 'grantDocumentId', 'grant_document_id'), documentLookup),
      signedGrantDocument: buildBuyerDocumentReference(readCaptureValue(grant, 'signedGrantDocumentId', 'signed_grant_document_id'), documentLookup),
      linkedBondQuoteId: normalizeText(readCaptureValue(grant, 'linkedBondQuoteId', 'linked_bond_quote_id')),
      offerCaptureId: normalizeText(readCaptureValue(grant, 'offerCaptureId', 'offer_capture_id')),
      publishedAt: readCaptureValue(grant, 'publishedAt', 'published_at'),
      capturedAt: readCaptureValue(grant, 'capturedAt', 'captured_at') || readCaptureValue(grant, 'createdAt', 'created_at'),
      status: normalizeText(readCaptureValue(grant, 'status')),
    }))

  return {
    offers,
    grants,
    acceptedOffer: offers.find((offer) => offer.buyerDecision === BOND_BUYER_OFFER_DECISION_STATUSES.accepted) || null,
    signedOfferDocument: buildBuyerDocumentReference(signedOfferDocumentId, documentLookup),
    summary: {
      offerCount: offers.length,
      grantCount: grants.length,
      acceptedOfferCount: offers.filter((offer) => offer.buyerDecision === BOND_BUYER_OFFER_DECISION_STATUSES.accepted).length,
      declinedOfferCount: offers.filter((offer) => offer.buyerDecision === BOND_BUYER_OFFER_DECISION_STATUSES.declined).length,
      bankWorkflowUnchanged: true,
      offerWorkflowMutationDeferred: true,
      grantWorkflowMutationDeferred: true,
    },
  }
}

export function buildBondOriginatorOfferCaptureViewModel({
  offerCapture = {},
  documents = [],
  viewer = 'originator',
} = {}) {
  const status = normalizeText(readCaptureValue(offerCapture, 'status')) || BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.draft
  if (viewer === 'buyer' && !isBuyerVisibleOriginatorOffer(offerCapture)) return null
  const documentLookup = buildDocumentLookup(documents)
  const quoteDocumentId = normalizeText(readCaptureValue(offerCapture, 'quoteDocumentId', 'quote_document_id'))
  const buyerDecision = normalizeText(readCaptureValue(offerCapture, 'buyerDecision', 'buyer_decision')) || null
  return {
    workspaceVersion: BOND_ORIGINATOR_OFFER_GRANT_WORKSPACE_VERSION,
    id: normalizeText(readCaptureValue(offerCapture, 'id')),
    exportPackageId: normalizeText(readCaptureValue(offerCapture, 'exportPackageId', 'export_package_id')),
    transactionId: normalizeText(readCaptureValue(offerCapture, 'transactionId', 'transaction_id')),
    submissionId: normalizeText(readCaptureValue(offerCapture, 'submissionId', 'submission_id')),
    source: 'originator_supplied',
    type: 'bank_offer',
    bankName: normalizeText(readCaptureValue(offerCapture, 'bankName', 'bank_name')) || 'Bank',
    offeredAmount: normalizeNumberString(readCaptureValue(offerCapture, 'offeredAmount', 'offered_amount')),
    interestRate: normalizeNumberString(readCaptureValue(offerCapture, 'interestRate', 'interest_rate')),
    interestRateType: normalizeText(readCaptureValue(offerCapture, 'interestRateType', 'interest_rate_type')),
    interestRateDisplay: normalizeText(readCaptureValue(offerCapture, 'interestRateDisplay', 'interest_rate_display')),
    monthlyRepayment: normalizeNumberString(readCaptureValue(offerCapture, 'monthlyRepayment', 'monthly_repayment')),
    termMonths: normalizeInteger(readCaptureValue(offerCapture, 'termMonths', 'term_months')),
    validUntil: readCaptureValue(offerCapture, 'validUntil', 'valid_until'),
    conditionsSummary: normalizeText(readCaptureValue(offerCapture, 'conditionsSummary', 'conditions_summary')),
    quoteDocumentId,
    quoteDocument: buildOriginatorOfferGrantDocumentReference(quoteDocumentId, documentLookup),
    status,
    buyerDecision,
    publishedAt: readCaptureValue(offerCapture, 'publishedAt', 'published_at'),
    capturedAt: readCaptureValue(offerCapture, 'capturedAt', 'captured_at') || readCaptureValue(offerCapture, 'createdAt', 'created_at'),
    buyerDecisionAt: readCaptureValue(offerCapture, 'buyerDecisionAt', 'buyer_decision_at'),
    linkedBondQuoteId: normalizeText(readCaptureValue(offerCapture, 'linkedBondQuoteId', 'linked_bond_quote_id')),
    actions: {
      canPublishToBuyer: viewer === 'originator' && [
        BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.captured,
        BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.draft,
      ].includes(status),
      canRecordBuyerDecision: viewer === 'buyer' && isBuyerVisibleOriginatorOffer(offerCapture),
      canCreateBankApplication: false,
      canAutoSubmitToBank: false,
      canMutateBankWorkflow: false,
      canMutateOfferWorkflow: false,
      canMutateGrantWorkflow: false,
    },
    workflowBoundary: {
      originatorSuppliedOnly: true,
      noAutomaticBankSubmission: true,
      liveDeliveryEnabled: false,
      createsBankApplication: false,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
    },
  }
}

export function buildBondOriginatorGrantCaptureViewModel({
  grantCapture = {},
  documents = [],
  viewer = 'originator',
} = {}) {
  const status = normalizeText(readCaptureValue(grantCapture, 'status')) || BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.draft
  if (viewer === 'buyer' && !isBuyerVisibleOriginatorGrant(grantCapture)) return null
  const documentLookup = buildDocumentLookup(documents)
  const grantDocumentId = normalizeText(readCaptureValue(grantCapture, 'grantDocumentId', 'grant_document_id'))
  const signedGrantDocumentId = normalizeText(readCaptureValue(grantCapture, 'signedGrantDocumentId', 'signed_grant_document_id'))
  return {
    workspaceVersion: BOND_ORIGINATOR_OFFER_GRANT_WORKSPACE_VERSION,
    id: normalizeText(readCaptureValue(grantCapture, 'id')),
    exportPackageId: normalizeText(readCaptureValue(grantCapture, 'exportPackageId', 'export_package_id')),
    transactionId: normalizeText(readCaptureValue(grantCapture, 'transactionId', 'transaction_id')),
    submissionId: normalizeText(readCaptureValue(grantCapture, 'submissionId', 'submission_id')),
    source: 'originator_supplied',
    type: 'bond_grant',
    bankName: normalizeText(readCaptureValue(grantCapture, 'bankName', 'bank_name')) || 'Bank',
    approvedAmount: normalizeNumberString(readCaptureValue(grantCapture, 'approvedAmount', 'approved_amount')),
    grantReference: normalizeText(readCaptureValue(grantCapture, 'grantReference', 'grant_reference')),
    conditionsSummary: normalizeText(readCaptureValue(grantCapture, 'conditionsSummary', 'conditions_summary')),
    grantDocumentId,
    signedGrantDocumentId,
    grantDocument: buildOriginatorOfferGrantDocumentReference(grantDocumentId, documentLookup),
    signedGrantDocument: buildOriginatorOfferGrantDocumentReference(signedGrantDocumentId, documentLookup),
    linkedBondQuoteId: normalizeText(readCaptureValue(grantCapture, 'linkedBondQuoteId', 'linked_bond_quote_id')),
    offerCaptureId: normalizeText(readCaptureValue(grantCapture, 'offerCaptureId', 'offer_capture_id')),
    status,
    publishedAt: readCaptureValue(grantCapture, 'publishedAt', 'published_at'),
    capturedAt: readCaptureValue(grantCapture, 'capturedAt', 'captured_at') || readCaptureValue(grantCapture, 'createdAt', 'created_at'),
    actions: {
      canPublishToBuyer: viewer === 'originator' && [
        BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.received,
        BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.buyerSigned,
      ].includes(status),
      canAcknowledgeGrant: viewer === 'buyer' && isBuyerVisibleOriginatorGrant(grantCapture),
      canCreateBankApplication: false,
      canAutoSubmitToBank: false,
      canMutateBankWorkflow: false,
      canMutateOfferWorkflow: false,
      canMutateGrantWorkflow: false,
    },
    workflowBoundary: {
      originatorSuppliedOnly: true,
      noAutomaticBankSubmission: true,
      liveDeliveryEnabled: false,
      createsBankApplication: false,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
    },
  }
}

export function buildBondOriginatorOfferGrantCaptureWorkspaceViewModel({
  exportPackage = {},
  offerCaptures = null,
  grantCaptures = null,
  documents = [],
  viewer = 'originator',
} = {}) {
  const normalizedPackage = normalizeOriginatorWorkspacePackage(exportPackage) || exportPackage
  const packageOffers = Array.isArray(offerCaptures)
    ? offerCaptures
    : Array.isArray(normalizedPackage.offerCaptures)
      ? normalizedPackage.offerCaptures
      : Array.isArray(normalizedPackage.offer_captures)
        ? normalizedPackage.offer_captures
        : Array.isArray(normalizedPackage.transaction_bond_originator_bank_offer_captures)
          ? normalizedPackage.transaction_bond_originator_bank_offer_captures
          : []
  const packageGrants = Array.isArray(grantCaptures)
    ? grantCaptures
    : Array.isArray(normalizedPackage.grantCaptures)
      ? normalizedPackage.grantCaptures
      : Array.isArray(normalizedPackage.grant_captures)
        ? normalizedPackage.grant_captures
        : Array.isArray(normalizedPackage.transaction_bond_originator_grant_captures)
          ? normalizedPackage.transaction_bond_originator_grant_captures
          : []
  const offers = packageOffers
    .map((offerCapture) => buildBondOriginatorOfferCaptureViewModel({ offerCapture, documents, viewer }))
    .filter(Boolean)
  const grants = packageGrants
    .map((grantCapture) => buildBondOriginatorGrantCaptureViewModel({ grantCapture, documents, viewer }))
    .filter(Boolean)
  const latestAt = [
    ...offers.map((offer) => offer.buyerDecisionAt || offer.publishedAt || offer.capturedAt),
    ...grants.map((grant) => grant.publishedAt || grant.capturedAt),
  ].filter(Boolean).sort().at(-1) || null
  const canCapture = viewer === 'originator' && canCaptureOriginatorOfferOrGrant(normalizedPackage)
  const summary = {
    offerCount: offers.length,
    capturedOfferCount: offers.filter((offer) => [
      BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.captured,
      BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.draft,
    ].includes(offer.status)).length,
    publishedOfferCount: offers.filter((offer) => offer.status === BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.publishedToBuyer).length,
    acceptedOfferCount: offers.filter((offer) => offer.status === BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.acceptedByBuyer ||
      offer.buyerDecision === BOND_BUYER_OFFER_DECISION_STATUSES.accepted).length,
    grantCount: grants.length,
    publishedGrantCount: grants.filter((grant) => grant.status === BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.publishedToBuyer).length,
    signedGrantCount: grants.filter((grant) => [
      BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.buyerSigned,
      BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.submittedForInstruction,
    ].includes(grant.status) || Boolean(grant.signedGrantDocumentId)).length,
    latestAt,
    bankWorkflowUnchanged: true,
    offerWorkflowMutationDeferred: true,
    grantWorkflowMutationDeferred: true,
  }
  const nextActions = []
  if (canCapture && offers.length === 0) nextActions.push('Capture bank offers returned by the bond originator process.')
  if (offers.some((offer) => offer.actions.canPublishToBuyer)) nextActions.push('Publish reviewed offers to the buyer when ready.')
  if (summary.acceptedOfferCount > 0 && grants.length === 0) nextActions.push('Capture the formal bond grant when the originator receives it.')
  if (grants.some((grant) => grant.actions.canPublishToBuyer)) nextActions.push('Publish reviewed grant evidence to the buyer when ready.')
  if (!nextActions.length) nextActions.push('Continue external originator processing and keep Arch9 updated.')
  return {
    available: Boolean(normalizedPackage.id || normalizedPackage.exportPackageId || offers.length || grants.length),
    workspaceVersion: BOND_ORIGINATOR_OFFER_GRANT_WORKSPACE_VERSION,
    exportPackageId: normalizedPackage.id || normalizedPackage.exportPackageId || normalizedPackage.export_package_id || null,
    transactionId: normalizedPackage.transactionId || normalizedPackage.transaction_id || null,
    status: offers.length || grants.length ? 'capture_started' : 'waiting_for_originator_capture',
    statusLabel: offers.length || grants.length ? 'Offers and grants captured' : 'Waiting for offers',
    headline: offers.length || grants.length
      ? 'Originator-captured offers and grants'
      : 'Capture externally obtained bank outcomes',
    summary,
    offers,
    grants,
    nextActions,
    actions: {
      canCaptureOffer: canCapture,
      canCaptureGrant: canCapture,
      canPublishToBuyer: viewer === 'originator' && [...offers, ...grants].some((item) => item.actions.canPublishToBuyer),
      canCreateBankApplication: false,
      canAutoSubmitToBank: false,
      canMutateBankWorkflow: false,
      canMutateOfferWorkflow: false,
      canMutateGrantWorkflow: false,
      canLiveDeliver: false,
    },
    workflowBoundary: {
      arch9FacilitatesOnly: true,
      originatorProcessesExternally: true,
      originatorSuppliedOnly: true,
      noAutomaticBankSubmission: true,
      liveDeliveryEnabled: false,
      createsBankApplication: false,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
    },
  }
}

function isAttorneyVisibleOriginatorGrant(grant = {}) {
  return [
    BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.publishedToBuyer,
    BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.buyerSigned,
    BOND_ORIGINATOR_GRANT_CAPTURE_STATUSES.submittedForInstruction,
  ].includes(normalizeText(readCaptureValue(grant, 'status')))
}

function normalizeAttorneyHandoffPackage(rawPackage = {}) {
  if (!rawPackage || typeof rawPackage !== 'object') return null
  const grantCaptures =
    rawPackage.grantCaptures ||
    rawPackage.grant_captures ||
    rawPackage.transaction_bond_originator_grant_captures ||
    []
  const offerCaptures =
    rawPackage.offerCaptures ||
    rawPackage.offer_captures ||
    rawPackage.transaction_bond_originator_bank_offer_captures ||
    []
  const hasSignal = Boolean(
    rawPackage.id ||
    rawPackage.transactionId ||
    rawPackage.transaction_id ||
    rawPackage.status ||
    rawPackage.packageReadyAt ||
    rawPackage.package_ready_at ||
    grantCaptures.length ||
    offerCaptures.length,
  )
  if (!hasSignal) return null
  return {
    id: rawPackage.id || null,
    transactionId: rawPackage.transactionId || rawPackage.transaction_id || null,
    submissionId: rawPackage.submissionId || rawPackage.submission_id || null,
    status: rawPackage.status || BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.draft,
    originatorRecipientName:
      rawPackage.originatorRecipient?.name ||
      rawPackage.originator_recipient_name ||
      rawPackage.originatorRecipientName ||
      'Bond originator',
    packageReadyAt: rawPackage.packageReadyAt || rawPackage.package_ready_at || rawPackage.createdAt || rawPackage.created_at || null,
    acceptedAt: rawPackage.acceptedAt || rawPackage.accepted_at || null,
    lastDownloadedAt: rawPackage.lastDownloadedAt || rawPackage.last_downloaded_at || null,
    offerCaptures: Array.isArray(offerCaptures) ? offerCaptures : [],
    grantCaptures: Array.isArray(grantCaptures) ? grantCaptures : [],
    bankWorkflowUnchanged: rawPackage.bankWorkflowUnchanged !== false && rawPackage.bank_workflow_unchanged !== false,
    offerWorkflowMutationDeferred: rawPackage.offerWorkflowMutationDeferred !== false,
    grantWorkflowMutationDeferred: rawPackage.grantWorkflowMutationDeferred !== false,
  }
}

function getRoleplayerName(rolePlayers = [], roleType = '') {
  const target = normalizeText(roleType)
  if (!target) return ''
  const match = (Array.isArray(rolePlayers) ? rolePlayers : []).find((item) => {
    const itemRole = normalizeText(item?.roleType || item?.role_type)
    const itemLegalRole = normalizeText(item?.legalRole || item?.legal_role)
    const status = normalizeText(item?.assignmentStatus || item?.assignment_status || item?.status).toLowerCase()
    if (['removed', 'declined', 'rejected'].includes(status)) return false
    return itemRole === target || itemLegalRole === target
  })
  return normalizeText(
    match?.participantName ||
    match?.participant_name ||
    match?.companyName ||
    match?.company_name ||
    match?.partnerName ||
    match?.partner_name ||
    match?.emailAddress ||
    match?.email_address,
  )
}

export function buildBondOriginatorAttorneyHandoffViewModel({
  handoffPackage = {},
  documents = [],
  rolePlayers = [],
  transaction = {},
} = {}) {
  const normalizedPackage = normalizeAttorneyHandoffPackage(handoffPackage)
  const documentLookup = buildDocumentLookup(documents)
  if (!normalizedPackage) {
    return {
      available: false,
      status: 'waiting_for_originator_package',
      statusLabel: 'No attorney handoff yet',
      headline: 'Bond grant handoff is not available yet',
      summary: 'The bond originator has not captured a grant package for attorney handoff in Arch9 yet.',
      grants: [],
      cards: [],
      nextActions: ['Wait for the bond originator to capture and publish the bond grant evidence.'],
      assignments: {
        bondAttorney: getRoleplayerName(rolePlayers, 'bond_attorney') || normalizeText(transaction?.bond_attorney || transaction?.assigned_bond_attorney_email),
        cancellationAttorney: getRoleplayerName(rolePlayers, 'cancellation_attorney') || normalizeText(transaction?.cancellation_attorney || transaction?.assigned_cancellation_attorney_email),
      },
      attorneyHandoffOnly: true,
      bankWorkflowUnchanged: true,
      offerWorkflowMutationDeferred: true,
      grantWorkflowMutationDeferred: true,
    }
  }

  const grants = normalizedPackage.grantCaptures
    .filter(isAttorneyVisibleOriginatorGrant)
    .map((grant) => {
      const grantDocumentId = normalizeText(readCaptureValue(grant, 'grantDocumentId', 'grant_document_id'))
      const signedGrantDocumentId = normalizeText(readCaptureValue(grant, 'signedGrantDocumentId', 'signed_grant_document_id'))
      return {
        id: normalizeText(readCaptureValue(grant, 'id')),
        bankName: normalizeText(readCaptureValue(grant, 'bankName', 'bank_name')) || 'Bank',
        approvedAmount: normalizeNumberString(readCaptureValue(grant, 'approvedAmount', 'approved_amount')),
        grantReference: normalizeText(readCaptureValue(grant, 'grantReference', 'grant_reference')),
        conditionsSummary: normalizeText(readCaptureValue(grant, 'conditionsSummary', 'conditions_summary')),
        status: normalizeText(readCaptureValue(grant, 'status')),
        capturedAt: readCaptureValue(grant, 'capturedAt', 'captured_at') || readCaptureValue(grant, 'createdAt', 'created_at'),
        publishedAt: readCaptureValue(grant, 'publishedAt', 'published_at'),
        grantDocumentId,
        signedGrantDocumentId,
        grantDocument: buildBuyerDocumentReference(grantDocumentId, documentLookup),
        signedGrantDocument: buildBuyerDocumentReference(signedGrantDocumentId, documentLookup),
        linkedBondQuoteId: normalizeText(readCaptureValue(grant, 'linkedBondQuoteId', 'linked_bond_quote_id')),
      }
    })
  const signedGrantCount = grants.filter((grant) => Boolean(grant.signedGrantDocumentId || grant.signedGrantDocument?.id)).length
  const grantDocumentCount = grants.filter((grant) => Boolean(grant.grantDocumentId || grant.grantDocument?.id)).length
  const acceptedOfferCount = normalizedPackage.offerCaptures.filter((offer) =>
    normalizeText(readCaptureValue(offer, 'status')) === BOND_ORIGINATOR_BANK_OFFER_CAPTURE_STATUSES.acceptedByBuyer ||
    normalizeText(readCaptureValue(offer, 'buyerDecision', 'buyer_decision')) === BOND_BUYER_OFFER_DECISION_STATUSES.accepted,
  ).length
  const assignments = {
    bondAttorney: getRoleplayerName(rolePlayers, 'bond_attorney') || normalizeText(transaction?.bond_attorney || transaction?.assigned_bond_attorney_email),
    cancellationAttorney: getRoleplayerName(rolePlayers, 'cancellation_attorney') || normalizeText(transaction?.cancellation_attorney || transaction?.assigned_cancellation_attorney_email),
  }
  const nextActions = []
  if (signedGrantCount > 0) {
    nextActions.push('Download the signed bond grant evidence and continue the bond attorney workflow.')
  } else if (grantDocumentCount > 0) {
    nextActions.push('Review the captured bond grant and wait for signed grant evidence where required.')
  } else {
    nextActions.push('Wait for the bond originator to capture the formal bond grant document.')
  }
  if (!assignments.bondAttorney) nextActions.push('Assign a bond attorney through the existing Roleplayers workflow where required.')
  if (!assignments.cancellationAttorney) nextActions.push('Assign a cancellation attorney through the existing Roleplayers workflow where required.')

  return {
    available: true,
    id: normalizedPackage.id,
    transactionId: normalizedPackage.transactionId,
    status: signedGrantCount ? 'signed_grant_available' : grantDocumentCount ? 'grant_available' : 'waiting_for_grant',
    statusLabel: signedGrantCount ? 'Signed grant available' : grantDocumentCount ? 'Grant available' : 'Awaiting grant',
    headline: signedGrantCount ? 'Bond grant ready for attorney handoff' : 'Bond grant handoff in progress',
    summary: signedGrantCount
      ? 'The originator-captured signed grant evidence is available for the attorney workflow.'
      : grantDocumentCount
        ? 'The formal grant has been captured. Signed grant evidence can be tracked when available.'
        : 'The originator package exists, but no attorney-ready grant document has been captured yet.',
    recipientName: normalizedPackage.originatorRecipientName,
    lastUpdatedAt: grants.map((grant) => grant.publishedAt || grant.capturedAt).filter(Boolean).sort().at(-1) ||
      normalizedPackage.lastDownloadedAt ||
      normalizedPackage.acceptedAt ||
      normalizedPackage.packageReadyAt ||
      null,
    grants,
    assignments,
    cards: [
      { key: 'accepted_offers', label: 'Accepted offers', value: String(acceptedOfferCount), detail: acceptedOfferCount ? 'Buyer accepted offer captured' : 'No accepted offer captured' },
      { key: 'grant_documents', label: 'Grant documents', value: String(grantDocumentCount), detail: grantDocumentCount ? 'Formal grant available' : 'Waiting for formal grant' },
      { key: 'signed_grants', label: 'Signed grants', value: String(signedGrantCount), detail: signedGrantCount ? 'Signed evidence available' : 'No signed grant evidence yet' },
      { key: 'roleplayers', label: 'Attorney allocation', value: assignments.bondAttorney || assignments.cancellationAttorney ? 'Started' : 'Pending', detail: assignments.bondAttorney ? 'Bond attorney assigned' : 'Bond attorney not assigned' },
    ],
    nextActions,
    attorneyHandoffOnly: true,
    bankWorkflowUnchanged: true,
    offerWorkflowMutationDeferred: true,
    grantWorkflowMutationDeferred: true,
  }
}

export function listBondApplicationRecipientFormatProfiles() {
  return Object.values(RECIPIENT_FORMAT_PROFILES).map((profile) => clone(profile))
}

export function getBondApplicationRecipientFormatProfile(
  profileKey = BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.arch9OriginatorManual,
) {
  const normalized = normalizeText(profileKey).toLowerCase()
  return clone(RECIPIENT_FORMAT_PROFILES[normalized] || {
    profileKey: normalized || 'unknown',
    label: normalized || 'Unknown recipient format',
    recipientType: 'unknown',
    profileVersion: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_VERSION,
    supported: false,
    officialPayload: false,
    manualDownloadOnly: false,
    liveDeliveryEnabled: false,
    formatKeys: [],
    blockedFormats: [],
    blockers: [{
      code: 'recipient_format_profile_not_registered',
      severity: 'blocker',
      message: 'Recipient format profile is not registered.',
    }],
  })
}

export function validateBondApplicationRecipientFormatProfile(profile = {}) {
  const issues = []
  if (!normalizeText(profile.profileKey)) {
    issues.push({ code: 'recipient_profile_key_missing', severity: 'blocker', message: 'Recipient format profile key is required.' })
  }
  if (profile.profileVersion !== BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_VERSION) {
    issues.push({ code: 'recipient_profile_version_unsupported', severity: 'blocker', message: 'Recipient format profile version is unsupported.' })
  }
  if (profile.supported !== true) {
    issues.push(...(Array.isArray(profile.blockers) ? profile.blockers : [{
      code: 'recipient_format_profile_disabled',
      severity: 'blocker',
      message: 'Recipient format profile is disabled.',
    }]))
  }
  if (profile.liveDeliveryEnabled === true) {
    issues.push({ code: 'recipient_format_live_delivery_disabled', severity: 'blocker', message: 'Phase 8H recipient formats are manual/download only.' })
  }
  return {
    valid: !hasBlockingIssue(issues),
    issues,
  }
}

function buildOriginatorRecipientJson({ exportPackage = {}, profile = {}, generatedAt = new Date().toISOString() } = {}) {
  return {
    schemaVersion: BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_VERSION,
    formatKey: BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.originatorJson,
    recipientProfileKey: profile.profileKey,
    recipientType: profile.recipientType,
    generatedAt,
    source: {
      exportPackageId: exportPackage.id || null,
      transactionId: exportPackage.transactionId || null,
      bondApplicationId: exportPackage.bondApplicationId || null,
      submissionId: exportPackage.submissionId || null,
      sourceSnapshotHash: exportPackage.sourceSnapshotHash || null,
      canonicalHash: exportPackage.canonicalHash || null,
    },
    package: {
      destinationKey: exportPackage.destinationKey || null,
      status: exportPackage.status || null,
      packageReadyAt: exportPackage.packageReadyAt || exportPackage.createdAt || null,
      acceptedAt: exportPackage.acceptedAt || null,
      lastDownloadedAt: exportPackage.lastDownloadedAt || null,
      participantSummary: exportPackage.participantSummary || countParticipantsByRole(exportPackage.canonicalExport || {}),
      documentBundleManifest: exportPackage.documentBundleManifest || buildOriginatorDocumentBundleManifest(exportPackage.canonicalExport || {}),
    },
    canonicalApplication: exportPackage.canonicalExport || null,
    controls: {
      manualDownloadOnly: true,
      liveDeliveryEnabled: false,
      noAutomaticBankSubmission: true,
      bankWorkflowUnchanged: true,
      offerWorkflowMutationDeferred: true,
      grantWorkflowMutationDeferred: true,
    },
  }
}

function buildOriginatorSummaryCsv(canonicalExport = {}) {
  const rows = [
    ['section', 'role', 'participant_key', 'field', 'value'],
    ['source', '', '', 'transaction_id', canonicalExport.source?.transactionId || ''],
    ['source', '', '', 'submission_id', canonicalExport.source?.submissionId || ''],
    ['source', '', '', 'submission_version', canonicalExport.source?.submissionVersion || ''],
    ['source', '', '', 'snapshot_hash', canonicalExport.source?.snapshotHash || ''],
    ['property', '', '', 'display_address', canonicalExport.application?.property?.displayAddress || canonicalExport.application?.property?.display_address || canonicalExport.application?.property?.address || ''],
    ['property', '', '', 'development_name', canonicalExport.application?.property?.developmentName || canonicalExport.application?.property?.development_name || ''],
    ['property', '', '', 'unit_number', canonicalExport.application?.property?.unitNumber || canonicalExport.application?.property?.unit_number || ''],
    ['finance', '', '', 'purchase_price', canonicalExport.application?.finance?.purchasePrice?.amount || ''],
    ['finance', '', '', 'deposit_amount', canonicalExport.application?.finance?.depositAmount?.amount || ''],
    ['finance', '', '', 'requested_bond_amount', canonicalExport.application?.finance?.requestedBondAmount?.amount || ''],
    ['application', '', '', 'selected_bank_count', canonicalExport.application?.selectedBanks?.length || 0],
  ]
  ;(canonicalExport.participants || []).forEach((participant) => {
    rows.push(['participant', participant.role || '', participant.participantKey || '', 'display_name', participant.displayName || ''])
    rows.push(['participant', participant.role || '', participant.participantKey || '', 'status', participant.status || ''])
    rows.push(['participant', participant.role || '', participant.participantKey || '', 'document_count', participant.documents?.length || 0])
    rows.push(['participant', participant.role || '', participant.participantKey || '', 'declaration_count', participant.declarations?.length || 0])
  })
  return `${csvRows(rows)}\n`
}

function buildDocumentManifestCsv(canonicalExport = {}) {
  const sharedDocuments = normalizeDocumentManifestItems(canonicalExport.documents).shared
  const packageDocuments = normalizeDocumentManifestItems(canonicalExport.documents).packageDocuments
  const participantDocuments = (canonicalExport.participants || []).flatMap((participant) =>
    (participant.documents || []).map((document) => ({
      ...document,
      participantKey: document.participantKey || participant.participantKey,
      participantRole: document.participantRole || participant.role,
    })),
  )
  const rows = [
    ['scope', 'participant_role', 'participant_key', 'requirement_key', 'canonical_document_type', 'document_role', 'matched_document_id', 'status', 'required_before'],
    ...sharedDocuments.map((document) => [
      'shared',
      '',
      '',
      document.requirementKey || '',
      document.canonicalDocumentType || '',
      document.documentRole || '',
      document.matchedDocumentId || '',
      document.status || '',
      document.requiredBefore || '',
    ]),
    ...participantDocuments.map((document) => [
      'participant',
      document.participantRole || '',
      document.participantKey || '',
      document.requirementKey || '',
      document.canonicalDocumentType || '',
      document.documentRole || '',
      document.matchedDocumentId || '',
      document.status || '',
      document.requiredBefore || '',
    ]),
    ...packageDocuments.map((document) => [
      'signed_package',
      document.participantRole || '',
      document.participantKey || '',
      document.requirementKey || '',
      document.canonicalDocumentType || '',
      document.documentRole || '',
      document.matchedDocumentId || '',
      document.status || '',
      document.requiredBefore || '',
    ]),
  ]
  return `${csvRows(rows)}\n`
}

function buildBlockedRecipientFormatArtifact({ formatKey = '', profile = {} } = {}) {
  const label = formatKey === BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.oobaOfficialPayload
    ? 'OOBA official payload'
    : 'Bank official payload'
  return {
    formatKey,
    fileName: null,
    contentType: null,
    body: null,
    status: 'blocked',
    bodyHash: null,
    issues: recipientFormatBlockers(label),
    manualDownloadOnly: profile.manualDownloadOnly !== false,
    liveDeliveryEnabled: false,
  }
}

async function buildRecipientFormatArtifact({ formatKey = '', exportPackage = {}, profile = {}, generatedAt } = {}) {
  const canonicalExport = exportPackage.canonicalExport || {}
  const baseName = fileSafeText(`${profile.profileKey}-${exportPackage.transactionId || canonicalExport.source?.transactionId || 'transaction'}`)
  if (formatKey === BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.originatorJson) {
    const body = JSON.stringify(buildOriginatorRecipientJson({ exportPackage, profile, generatedAt }), null, 2)
    return {
      formatKey,
      fileName: `${baseName}.json`,
      contentType: 'application/vnd.arch9.bond-originator-intake+json;version=1',
      body,
      status: 'ready_for_download',
      bodyHash: await hashCanonicalBondApplicationExport({ formatKey, body }),
      issues: [],
      manualDownloadOnly: true,
      liveDeliveryEnabled: false,
    }
  }
  if (formatKey === BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.originatorSummaryCsv) {
    const body = buildOriginatorSummaryCsv(canonicalExport)
    return {
      formatKey,
      fileName: `${baseName}-summary.csv`,
      contentType: 'text/csv; charset=utf-8',
      body,
      status: 'ready_for_download',
      bodyHash: await hashCanonicalBondApplicationExport({ formatKey, body }),
      issues: [],
      manualDownloadOnly: true,
      liveDeliveryEnabled: false,
    }
  }
  if (formatKey === BOND_APPLICATION_RECIPIENT_FORMAT_KEYS.documentManifestCsv) {
    const body = buildDocumentManifestCsv(canonicalExport)
    return {
      formatKey,
      fileName: `${baseName}-documents.csv`,
      contentType: 'text/csv; charset=utf-8',
      body,
      status: 'ready_for_download',
      bodyHash: await hashCanonicalBondApplicationExport({ formatKey, body }),
      issues: [],
      manualDownloadOnly: true,
      liveDeliveryEnabled: false,
    }
  }
  return buildBlockedRecipientFormatArtifact({ formatKey, profile })
}

export async function buildBondApplicationRecipientFormatPackage({
  exportPackage = {},
  recipientProfileKey = BOND_APPLICATION_RECIPIENT_FORMAT_PROFILE_KEYS.arch9OriginatorManual,
  id = null,
  requestedBy = null,
  idempotencyKey = null,
  existingFormatPackage = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (existingFormatPackage?.idempotencyKey && idempotencyKey && existingFormatPackage.idempotencyKey === idempotencyKey) {
    return { ok: true, formatPackage: clone(existingFormatPackage), idempotent: true }
  }
  if (exportPackage.destinationKey !== BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY) {
    return { ok: false, reason: 'originator_intake_package_required', formatPackage: null }
  }
  if (!exportPackage.canonicalExport) {
    return { ok: false, reason: 'canonical_export_required', formatPackage: null }
  }
  const profile = getBondApplicationRecipientFormatProfile(recipientProfileKey)
  const profileValidation = validateBondApplicationRecipientFormatProfile(profile)
  const artifacts = profileValidation.valid
    ? await Promise.all(profile.formatKeys.map((formatKey) => buildRecipientFormatArtifact({
      formatKey,
      exportPackage,
      profile,
      generatedAt,
    })))
    : []
  const blockedArtifacts = (profile.blockedFormats || []).map((formatKey) =>
    buildBlockedRecipientFormatArtifact({ formatKey, profile }),
  )
  const issues = [
    ...profileValidation.issues,
    ...(profile.supported ? [] : profile.blockers || []),
    ...blockedArtifacts.flatMap((artifact) => artifact.issues || []),
  ]
  const blockingIssues = profileValidation.valid ? [] : issues.filter((issue) => issue.severity === 'blocker')
  const status = blockingIssues.length
    ? 'blocked'
    : 'ready_for_download'
  return {
    ok: status === 'ready_for_download',
    formatPackage: {
      id,
      exportPackageId: exportPackage.id || null,
      transactionId: exportPackage.transactionId || null,
      bondApplicationId: exportPackage.bondApplicationId || null,
      submissionId: exportPackage.submissionId || null,
      sourceSnapshotHash: exportPackage.sourceSnapshotHash || null,
      canonicalHash: exportPackage.canonicalHash || null,
      recipientProfileKey: profile.profileKey,
      recipientType: profile.recipientType,
      profileVersion: profile.profileVersion,
      status,
      artifacts,
      blockedArtifacts,
      blockerSummary: issues.filter((issue) => issue.severity === 'blocker'),
      manualDownloadOnly: true,
      liveDeliveryEnabled: false,
      noAutomaticBankSubmission: true,
      bankWorkflowUnchanged: true,
      offerWorkflowMutationDeferred: true,
      grantWorkflowMutationDeferred: true,
      requestedBy,
      idempotencyKey: idempotencyKey || null,
      generatedAt,
      metadata: {
        profile_label: profile.label,
        notes: profile.notes || [],
        official_payload_generation_enabled: false,
      },
    },
  }
}

export function buildBondApplicationRecipientFormatViewModel({ formatPackage = {} } = {}) {
  if (!formatPackage || !formatPackage.recipientProfileKey) {
    return {
      available: false,
      status: 'not_prepared',
      statusLabel: 'Recipient formats not prepared',
      artifacts: [],
      blockedFormats: [],
      actions: { canDownload: false, canLiveDeliver: false },
      bankWorkflowUnchanged: true,
    }
  }
  const artifacts = (formatPackage.artifacts || []).map((artifact) => ({
    formatKey: artifact.formatKey,
    fileName: artifact.fileName,
    contentType: artifact.contentType,
    status: artifact.status,
    bodyHash: artifact.bodyHash,
    canDownload: artifact.status === 'ready_for_download',
  }))
  const blockedFormats = (formatPackage.blockedArtifacts || []).map((artifact) => ({
    formatKey: artifact.formatKey,
    status: artifact.status,
    issues: artifact.issues || [],
  }))
  return {
    available: formatPackage.status === 'ready_for_download',
    id: formatPackage.id || null,
    exportPackageId: formatPackage.exportPackageId || null,
    transactionId: formatPackage.transactionId || null,
    submissionId: formatPackage.submissionId || null,
    recipientProfileKey: formatPackage.recipientProfileKey,
    recipientType: formatPackage.recipientType,
    profileVersion: formatPackage.profileVersion,
    status: formatPackage.status,
    statusLabel: formatPackage.status === 'ready_for_download'
      ? 'Recipient formats ready'
      : 'Recipient format blocked',
    generatedAt: formatPackage.generatedAt || null,
    artifacts,
    blockedFormats,
    blockerSummary: formatPackage.blockerSummary || [],
    actions: {
      canDownload: formatPackage.status === 'ready_for_download' && artifacts.some((artifact) => artifact.canDownload),
      canLiveDeliver: false,
    },
    manualDownloadOnly: true,
    liveDeliveryEnabled: false,
    noAutomaticBankSubmission: true,
    bankWorkflowUnchanged: true,
    offerWorkflowMutationDeferred: true,
    grantWorkflowMutationDeferred: true,
  }
}

function normalizeList(value) {
  return Array.isArray(value) ? value : []
}

function issueKey(issue = {}) {
  return `${issue.code || 'unknown'}:${issue.message || ''}:${issue.severity || ''}`
}

function uniqueIssues(issues = []) {
  const seen = new Set()
  return normalizeList(issues).filter((issue) => {
    const key = issueKey(issue)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function collectRecipientFormatIssues(formatPackages = []) {
  return normalizeList(formatPackages).flatMap((formatPackage) => [
    ...normalizeList(formatPackage.blockerSummary),
    ...normalizeList(formatPackage.blockedArtifacts).flatMap((artifact) => normalizeList(artifact.issues)),
  ])
}

function hasUnsafeTruthy(value) {
  return value === true || value === 'true'
}

function summarizeGovernanceControls({ exportPackage = {}, recipientFormatPackages = [] } = {}) {
  const formats = normalizeList(recipientFormatPackages)
  return {
    noAutomaticBankSubmission: exportPackage.operationalContext?.noAutomaticBankSubmission !== false &&
      formats.every((formatPackage) => formatPackage.noAutomaticBankSubmission !== false),
    bankWorkflowUnchanged: exportPackage.operationalContext?.bankWorkflowUpdateDeferred !== false &&
      exportPackage.bankWorkflowUnchanged !== false &&
      formats.every((formatPackage) => formatPackage.bankWorkflowUnchanged !== false),
    offerWorkflowMutationDeferred: formats.every((formatPackage) => formatPackage.offerWorkflowMutationDeferred !== false),
    grantWorkflowMutationDeferred: formats.every((formatPackage) => formatPackage.grantWorkflowMutationDeferred !== false),
    liveDeliveryEnabled: hasUnsafeTruthy(exportPackage.operationalContext?.liveDeliveryEnabled) ||
      formats.some((formatPackage) => hasUnsafeTruthy(formatPackage.liveDeliveryEnabled)),
    manualDownloadOnly: formats.every((formatPackage) => formatPackage.manualDownloadOnly !== false),
    officialPayloadGenerated: Boolean(exportPackage.destinationPayload || exportPackage.serializedPayload) &&
      exportPackage.destinationKey !== BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY,
  }
}

function governanceFindingsFromControls(controls = {}) {
  const findings = []
  if (controls.liveDeliveryEnabled) {
    findings.push({
      code: 'live_delivery_enabled',
      severity: 'blocker',
      message: 'Live OOBA or bank delivery is not permitted by the current Phase 8 governance boundary.',
    })
  }
  if (controls.officialPayloadGenerated) {
    findings.push({
      code: 'official_payload_generated_without_approval',
      severity: 'blocker',
      message: 'Official OOBA or bank payload generation requires approved schemas and contracts.',
    })
  }
  if (!controls.noAutomaticBankSubmission) {
    findings.push({
      code: 'automatic_bank_submission_not_allowed',
      severity: 'blocker',
      message: 'Automatic bank submission is outside the approved Phase 8 scope.',
    })
  }
  if (!controls.bankWorkflowUnchanged) {
    findings.push({
      code: 'bank_workflow_mutation_detected',
      severity: 'blocker',
      message: 'Governance reports must preserve the existing bank workflow boundary.',
    })
  }
  if (!controls.offerWorkflowMutationDeferred) {
    findings.push({
      code: 'offer_workflow_mutation_detected',
      severity: 'blocker',
      message: 'Offer workflow changes must remain deferred to existing authorized workflows.',
    })
  }
  if (!controls.grantWorkflowMutationDeferred) {
    findings.push({
      code: 'grant_workflow_mutation_detected',
      severity: 'blocker',
      message: 'Grant workflow changes must remain deferred to existing authorized workflows.',
    })
  }
  return findings
}

function reportStatusFromIssues(issues = []) {
  if (issues.some((issue) => issue.severity === 'blocker')) {
    return BOND_APPLICATION_GOVERNANCE_REPORT_STATUSES.blocked
  }
  if (issues.some((issue) => issue.severity === 'warning')) {
    return BOND_APPLICATION_GOVERNANCE_REPORT_STATUSES.attentionRequired
  }
  return BOND_APPLICATION_GOVERNANCE_REPORT_STATUSES.clear
}

export function buildBondApplicationGovernanceReport({
  exportPackage = {},
  recipientFormatPackages = [],
  deliveryAttempts = [],
  externalEvents = [],
  documentRequests = exportPackage.documentRequests || [],
  progressEvents = exportPackage.progressEvents || [],
  offerCaptures = exportPackage.offerCaptures || [],
  grantCaptures = exportPackage.grantCaptures || [],
  generatedBy = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const formats = normalizeList(recipientFormatPackages)
  const controls = summarizeGovernanceControls({ exportPackage, recipientFormatPackages: formats })
  const documentRequestSummary = buildBondOriginatorDocumentRequestSummary(documentRequests)
  const progressTimeline = buildBondOriginatorProgressTimeline({ exportPackage, progressEvents, documentRequests })
  const offerGrantSummary = buildBondOriginatorOfferGrantSummary({ offerCaptures, grantCaptures })
  const validationIssues = normalizeList(exportPackage.validationIssues)
  const formatIssues = collectRecipientFormatIssues(formats)
  const controlFindings = governanceFindingsFromControls(controls)
  const issues = uniqueIssues([...validationIssues, ...formatIssues, ...controlFindings])
  const status = reportStatusFromIssues(issues)
  const readyFormatCount = formats.filter((formatPackage) => formatPackage.status === 'ready_for_download').length
  const blockedFormatCount = formats.filter((formatPackage) => formatPackage.status === 'blocked' || normalizeList(formatPackage.blockerSummary).length).length
  return {
    reportVersion: BOND_APPLICATION_GOVERNANCE_REPORT_VERSION,
    status,
    generatedAt,
    generatedBy,
    scope: {
      transactionId: exportPackage.transactionId || null,
      bondApplicationId: exportPackage.bondApplicationId || null,
      submissionId: exportPackage.submissionId || null,
      exportPackageId: exportPackage.id || null,
      destinationKey: exportPackage.destinationKey || null,
      destinationType: exportPackage.destinationType || null,
      sourceSnapshotHash: exportPackage.sourceSnapshotHash || null,
      canonicalHash: exportPackage.canonicalHash || null,
    },
    decisionBoundary: {
      arch9FacilitatesOnly: true,
      originatorProcessesExternally: true,
      lenderDecisionExternal: true,
      automaticBankSubmission: false,
      automaticOobaDelivery: false,
      bankWorkflowMutation: false,
      offerWorkflowMutation: false,
      grantWorkflowMutation: false,
    },
    controls,
    packageSummary: {
      status: exportPackage.status || BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.draft,
      recipientName: exportPackage.originatorRecipient?.name || exportPackage.originatorRecipientName || 'Bond originator',
      packageReadyAt: exportPackage.packageReadyAt || exportPackage.createdAt || null,
      acceptedAt: exportPackage.acceptedAt || null,
      lastDownloadedAt: exportPackage.lastDownloadedAt || null,
      downloadCount: Number(exportPackage.downloadCount || 0),
      participantSummary: exportPackage.participantSummary || countParticipantsByRole(exportPackage.canonicalExport || {}),
      documentCounts: buildBondOriginatorIntakePackageViewModel({ exportPackage }).documentCounts,
    },
    recipientFormatSummary: {
      total: formats.length,
      readyForDownload: readyFormatCount,
      blocked: blockedFormatCount,
      profiles: formats.map((formatPackage) => ({
        recipientProfileKey: formatPackage.recipientProfileKey,
        recipientType: formatPackage.recipientType,
        status: formatPackage.status,
        artifactCount: normalizeList(formatPackage.artifacts).length,
        blockedArtifactCount: normalizeList(formatPackage.blockedArtifacts).length,
        liveDeliveryEnabled: formatPackage.liveDeliveryEnabled === true,
      })),
    },
    operationalSummary: {
      documentRequests: documentRequestSummary,
      progress: progressTimeline.summary,
      offersAndGrants: offerGrantSummary,
      deliveryAttemptCount: normalizeList(deliveryAttempts).length,
      externalEventCount: normalizeList(externalEvents).length,
    },
    blockerSummary: issues.filter((issue) => issue.severity === 'blocker'),
    warningSummary: issues.filter((issue) => issue.severity === 'warning'),
    issues,
    reportingOnly: true,
    sensitivePayloadIncluded: false,
  }
}

export function buildBondApplicationGovernanceReportViewModel({ report = {} } = {}) {
  if (!report || report.reportVersion !== BOND_APPLICATION_GOVERNANCE_REPORT_VERSION) {
    return {
      available: false,
      status: 'not_prepared',
      statusLabel: 'Governance report not prepared',
      cards: [],
      issues: [],
      reportingOnly: true,
      bankWorkflowUnchanged: true,
    }
  }
  const statusLabels = {
    [BOND_APPLICATION_GOVERNANCE_REPORT_STATUSES.clear]: 'Governance clear',
    [BOND_APPLICATION_GOVERNANCE_REPORT_STATUSES.attentionRequired]: 'Attention required',
    [BOND_APPLICATION_GOVERNANCE_REPORT_STATUSES.blocked]: 'Blocked',
  }
  return {
    available: true,
    status: report.status,
    statusLabel: statusLabels[report.status] || 'Governance report',
    generatedAt: report.generatedAt || null,
    scope: report.scope || {},
    decisionBoundary: report.decisionBoundary || {},
    cards: [
      {
        key: 'originator_package',
        label: 'Originator package',
        value: report.packageSummary?.status || 'draft',
        detail: report.packageSummary?.recipientName || 'Bond originator',
      },
      {
        key: 'recipient_formats',
        label: 'Recipient formats',
        value: `${report.recipientFormatSummary?.readyForDownload || 0} ready`,
        detail: `${report.recipientFormatSummary?.blocked || 0} blocked official format${report.recipientFormatSummary?.blocked === 1 ? '' : 's'}`,
      },
      {
        key: 'document_requests',
        label: 'Document requests',
        value: `${report.operationalSummary?.documentRequests?.open || 0} open`,
        detail: `${report.operationalSummary?.documentRequests?.accepted || 0} accepted`,
      },
      {
        key: 'offers_grants',
        label: 'Offers and grants',
        value: `${report.operationalSummary?.offersAndGrants?.acceptedOfferCount || 0} accepted offer${report.operationalSummary?.offersAndGrants?.acceptedOfferCount === 1 ? '' : 's'}`,
        detail: `${report.operationalSummary?.offersAndGrants?.signedGrantCount || 0} signed grant record${report.operationalSummary?.offersAndGrants?.signedGrantCount === 1 ? '' : 's'}`,
      },
      {
        key: 'workflow_safety',
        label: 'Workflow safety',
        value: report.controls?.bankWorkflowUnchanged ? 'Unchanged' : 'Review',
        detail: report.controls?.liveDeliveryEnabled ? 'Live delivery detected' : 'No live delivery',
      },
    ],
    issues: normalizeList(report.issues).map((issue) => ({
      code: issue.code || 'unknown',
      severity: issue.severity || 'info',
      message: issue.message || '',
    })),
    actions: {
      canDownloadReport: true,
      canLiveDeliver: false,
      canMutateBankWorkflow: false,
    },
    reportingOnly: true,
    sensitivePayloadIncluded: false,
    noAutomaticBankSubmission: true,
    bankWorkflowUnchanged: report.controls?.bankWorkflowUnchanged !== false,
    offerWorkflowMutationDeferred: report.controls?.offerWorkflowMutationDeferred !== false,
    grantWorkflowMutationDeferred: report.controls?.grantWorkflowMutationDeferred !== false,
  }
}

export function buildBondApplicationGovernanceReportCsv(report = {}) {
  const rows = [
    ['section', 'metric', 'value'],
    ['scope', 'transaction_id', report.scope?.transactionId || ''],
    ['scope', 'submission_id', report.scope?.submissionId || ''],
    ['scope', 'export_package_id', report.scope?.exportPackageId || ''],
    ['governance', 'status', report.status || ''],
    ['governance', 'arch9_facilitates_only', report.decisionBoundary?.arch9FacilitatesOnly === true ? 'true' : 'false'],
    ['governance', 'originator_processes_externally', report.decisionBoundary?.originatorProcessesExternally === true ? 'true' : 'false'],
    ['governance', 'automatic_bank_submission', report.decisionBoundary?.automaticBankSubmission === true ? 'true' : 'false'],
    ['controls', 'live_delivery_enabled', report.controls?.liveDeliveryEnabled === true ? 'true' : 'false'],
    ['controls', 'bank_workflow_unchanged', report.controls?.bankWorkflowUnchanged === true ? 'true' : 'false'],
    ['recipient_formats', 'ready_for_download', report.recipientFormatSummary?.readyForDownload || 0],
    ['recipient_formats', 'blocked', report.recipientFormatSummary?.blocked || 0],
    ['document_requests', 'open', report.operationalSummary?.documentRequests?.open || 0],
    ['document_requests', 'accepted', report.operationalSummary?.documentRequests?.accepted || 0],
    ['offers', 'accepted', report.operationalSummary?.offersAndGrants?.acceptedOfferCount || 0],
    ['grants', 'signed', report.operationalSummary?.offersAndGrants?.signedGrantCount || 0],
    ['issues', 'blockers', normalizeList(report.blockerSummary).length],
    ['issues', 'warnings', normalizeList(report.warningSummary).length],
  ]
  return `${csvRows(rows)}\n`
}

const R1_REQUIRED_MIGRATION_KEYS = [
  'phase5_submissions',
  'phase6_participants',
  'phase7_sureties_revisions',
  'phase8_external_exports',
  'phase8a_originator_intake',
  'phase8b_originator_document_requests',
  'phase8c_originator_progress_tracking',
  'phase8d_offers_grants',
  'phase8e_buyer_offer_grant_experience',
  'phase8f_agent_progress_view',
  'phase8g_attorney_handoff',
  'phase8h_recipient_specific_formats',
  'phase8i_governance_reporting',
]

const R1_REQUIRED_REGRESSION_KEYS = [
  'phase8_targeted_tests',
  'targeted_lint',
  'production_build',
]

function allKeysTrue(source = {}, keys = []) {
  return keys.every((key) => source?.[key] === true)
}

function readinessCheck({ key = '', label = '', passed = false, required = true, evidence = null, message = '' } = {}) {
  return {
    key,
    label,
    status: passed ? 'passed' : required ? 'blocked' : 'attention_required',
    required,
    evidence,
    message: passed ? message || 'Ready.' : message || 'Evidence is required before originator rollout.',
  }
}

function readinessStatusFromChecks(checks = []) {
  if (checks.some((check) => check.status === 'blocked')) return BOND_ORIGINATOR_INTERNAL_READINESS_STATUSES.blocked
  if (checks.some((check) => check.status === 'attention_required')) return BOND_ORIGINATOR_INTERNAL_READINESS_STATUSES.attentionRequired
  return BOND_ORIGINATOR_INTERNAL_READINESS_STATUSES.ready
}

function readinessIssuesFromChecks(checks = []) {
  return normalizeList(checks)
    .filter((check) => check.status !== 'passed')
    .map((check) => ({
      code: check.key,
      severity: check.status === 'blocked' ? 'blocker' : 'warning',
      message: check.message,
    }))
}

function flagsDefaultOff(featureFlags = {}) {
  return [
    'guided_bond_application_v2',
    'guided_bond_application_participants_v1',
    'guided_bond_application_sureties_v1',
    'guided_bond_application_change_requests_v1',
    'bond_application_exports_v1',
    'bond_application_ooba_adapter_v1',
    'bond_application_bank_adapters_v1',
    'bond_application_live_delivery_v1',
    'bond_application_external_status_sync_v1',
  ].every((key) => featureFlags?.defaults?.[key] !== true)
}

export function buildBondOriginatorInternalReadinessReport({
  exportPackage = {},
  governanceReport = null,
  recipientFormatPackages = [],
  migrationsApplied = {},
  featureFlags = {},
  regressionChecks = {},
  stagingChecks = {},
  operationalControls = {},
  generatedBy = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const packageReady = [
    BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.readyForOriginator,
    BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator,
    BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded,
  ].includes(exportPackage.status)
  const governanceReady = governanceReport?.reportVersion === BOND_APPLICATION_GOVERNANCE_REPORT_VERSION &&
    governanceReport.reportingOnly === true &&
    governanceReport.sensitivePayloadIncluded === false &&
    governanceReport.decisionBoundary?.arch9FacilitatesOnly === true
  const controls = governanceReport?.controls || summarizeGovernanceControls({
    exportPackage,
    recipientFormatPackages,
  })
  const formatReady = normalizeList(recipientFormatPackages)
    .some((formatPackage) => formatPackage.status === 'ready_for_download' && formatPackage.manualDownloadOnly !== false)
  const manualReleaseAuthorityDefined = Boolean(
    operationalControls.manualReleaseAuthorityDefined ||
    operationalControls.releaseApproverRole ||
    operationalControls.releaseApproverId,
  )
  const checks = [
    readinessCheck({
      key: 'migrations_applied',
      label: 'Required migrations applied',
      passed: allKeysTrue(migrationsApplied, R1_REQUIRED_MIGRATION_KEYS),
      evidence: { required: R1_REQUIRED_MIGRATION_KEYS, applied: Object.keys(migrationsApplied).filter((key) => migrationsApplied[key] === true) },
      message: 'All Phase 5 through Phase 8I migrations must be applied in the target staging environment.',
    }),
    readinessCheck({
      key: 'feature_flags_default_off',
      label: 'Feature flags default off',
      passed: flagsDefaultOff(featureFlags),
      evidence: { defaults: featureFlags.defaults || {} },
      message: 'Originator rollout flags must default off and be enabled only for approved cohorts.',
    }),
    readinessCheck({
      key: 'no_public_override',
      label: 'No public flag override',
      passed: featureFlags.publicOverrideEnabled !== true,
      evidence: { publicOverrideEnabled: featureFlags.publicOverrideEnabled === true },
      message: 'Public query-string or buyer-controlled activation must remain disabled.',
    }),
    readinessCheck({
      key: 'submitted_application_package_ready',
      label: 'Signed application package ready',
      passed: packageReady,
      evidence: { status: exportPackage.status || null, packageReadyAt: exportPackage.packageReadyAt || null },
      message: 'A signed submitted application package must be ready for internal inspection.',
    }),
    readinessCheck({
      key: 'document_manifest_ready',
      label: 'Document manifest ready',
      passed: Number(buildBondOriginatorIntakePackageViewModel({ exportPackage }).documentCounts?.total || 0) > 0,
      evidence: buildBondOriginatorIntakePackageViewModel({ exportPackage }).documentCounts,
      message: 'The package must include signed application evidence and supporting-document manifest counts.',
    }),
    readinessCheck({
      key: 'recipient_format_ready',
      label: 'Manual originator format ready',
      passed: formatReady,
      evidence: normalizeList(recipientFormatPackages).map((formatPackage) => ({
        recipientProfileKey: formatPackage.recipientProfileKey,
        status: formatPackage.status,
        manualDownloadOnly: formatPackage.manualDownloadOnly !== false,
      })),
      message: 'At least one manual originator recipient format must be ready for secure download.',
    }),
    readinessCheck({
      key: 'governance_report_generated',
      label: 'Governance report generated',
      passed: governanceReady,
      evidence: {
        reportVersion: governanceReport?.reportVersion || null,
        status: governanceReport?.status || null,
        reportingOnly: governanceReport?.reportingOnly === true,
      },
      message: 'A Phase 8I governance report must exist and confirm Arch9 is facilitating only.',
    }),
    readinessCheck({
      key: 'manual_release_authority_defined',
      label: 'Manual release authority defined',
      passed: manualReleaseAuthorityDefined,
      evidence: {
        releaseApproverRole: operationalControls.releaseApproverRole || null,
        releaseApproverId: operationalControls.releaseApproverId || null,
      },
      message: 'Define who may release an originator package before introducing originators.',
    }),
    readinessCheck({
      key: 'staging_buyer_submission_verified',
      label: 'Staging buyer submission verified',
      passed: stagingChecks.buyerSubmission === true,
      evidence: { buyerSubmission: stagingChecks.buyerSubmission === true },
      message: 'Verify a buyer can submit a bond application in staging.',
    }),
    readinessCheck({
      key: 'staging_originator_package_verified',
      label: 'Staging originator package verified',
      passed: stagingChecks.originatorPackageGeneration === true,
      evidence: { originatorPackageGeneration: stagingChecks.originatorPackageGeneration === true },
      message: 'Verify an internal user can prepare and inspect the originator intake package in staging.',
    }),
    readinessCheck({
      key: 'staging_document_manifest_verified',
      label: 'Staging document manifest verified',
      passed: stagingChecks.documentManifestAndSignedDocs === true,
      evidence: { documentManifestAndSignedDocs: stagingChecks.documentManifestAndSignedDocs === true },
      message: 'Verify signed application evidence and supporting documents appear correctly in staging.',
    }),
    readinessCheck({
      key: 'regression_checks_passed',
      label: 'Regression checks passed',
      passed: allKeysTrue(regressionChecks, R1_REQUIRED_REGRESSION_KEYS),
      evidence: { required: R1_REQUIRED_REGRESSION_KEYS, passed: Object.keys(regressionChecks).filter((key) => regressionChecks[key] === true) },
      message: 'Run the Phase 8 targeted suite, targeted lint and production build before rollout.',
    }),
    readinessCheck({
      key: 'no_live_delivery',
      label: 'No live delivery enabled',
      passed: controls.liveDeliveryEnabled !== true,
      evidence: { liveDeliveryEnabled: controls.liveDeliveryEnabled === true },
      message: 'Live OOBA or bank delivery must remain disabled for R1.',
    }),
    readinessCheck({
      key: 'no_bank_workflow_mutation',
      label: 'No bank workflow mutation',
      passed: controls.noAutomaticBankSubmission === true &&
        controls.bankWorkflowUnchanged === true &&
        controls.offerWorkflowMutationDeferred === true &&
        controls.grantWorkflowMutationDeferred === true,
      evidence: controls,
      message: 'R1 must not submit to banks, mutate bank workflow, change offers or change grants automatically.',
    }),
  ]
  const issues = readinessIssuesFromChecks(checks)
  const status = readinessStatusFromChecks(checks)
  return {
    reportVersion: BOND_ORIGINATOR_INTERNAL_READINESS_REPORT_VERSION,
    status,
    generatedAt,
    generatedBy,
    scope: {
      transactionId: exportPackage.transactionId || governanceReport?.scope?.transactionId || null,
      bondApplicationId: exportPackage.bondApplicationId || governanceReport?.scope?.bondApplicationId || null,
      submissionId: exportPackage.submissionId || governanceReport?.scope?.submissionId || null,
      exportPackageId: exportPackage.id || governanceReport?.scope?.exportPackageId || null,
    },
    rolloutBoundary: {
      phase: 'R1',
      purpose: 'Internal readiness before introducing bond originators.',
      arch9FacilitatesOnly: true,
      originatorProcessesExternally: true,
      lenderDecisionExternal: true,
      automaticBankSubmission: false,
      liveOobaDelivery: false,
      bankWorkflowMutation: false,
      offerWorkflowMutation: false,
      grantWorkflowMutation: false,
    },
    checklist: checks,
    summary: {
      totalChecks: checks.length,
      passed: checks.filter((check) => check.status === 'passed').length,
      blocked: checks.filter((check) => check.status === 'blocked').length,
      attentionRequired: checks.filter((check) => check.status === 'attention_required').length,
      requiredMigrations: R1_REQUIRED_MIGRATION_KEYS,
      requiredRegressionChecks: R1_REQUIRED_REGRESSION_KEYS,
    },
    issues,
    nextActions: issues.length
      ? issues.map((issue) => issue.message)
      : ['Internal readiness is clear for a controlled originator workspace MVP build or pilot preparation.'],
    reportingOnly: true,
    sensitivePayloadIncluded: false,
    noAutomaticBankSubmission: true,
    liveDeliveryEnabled: false,
    bankWorkflowUnchanged: true,
    offerWorkflowMutationDeferred: true,
    grantWorkflowMutationDeferred: true,
  }
}

export function buildBondOriginatorInternalReadinessViewModel({ report = {} } = {}) {
  if (!report || report.reportVersion !== BOND_ORIGINATOR_INTERNAL_READINESS_REPORT_VERSION) {
    return {
      available: false,
      status: 'not_prepared',
      statusLabel: 'Internal readiness not prepared',
      cards: [],
      checklist: [],
      nextActions: ['Prepare the Phase R1 internal readiness report before engaging bond originators.'],
      reportingOnly: true,
      bankWorkflowUnchanged: true,
    }
  }
  const labels = {
    [BOND_ORIGINATOR_INTERNAL_READINESS_STATUSES.ready]: 'Ready for internal rollout',
    [BOND_ORIGINATOR_INTERNAL_READINESS_STATUSES.attentionRequired]: 'Attention required',
    [BOND_ORIGINATOR_INTERNAL_READINESS_STATUSES.blocked]: 'Blocked',
  }
  return {
    available: true,
    status: report.status,
    statusLabel: labels[report.status] || 'Internal readiness',
    generatedAt: report.generatedAt || null,
    scope: report.scope || {},
    cards: [
      { key: 'checks', label: 'Readiness checks', value: `${report.summary?.passed || 0}/${report.summary?.totalChecks || 0}`, detail: `${report.summary?.blocked || 0} blocked` },
      { key: 'migrations', label: 'Migrations', value: `${report.summary?.requiredMigrations?.length || 0} required`, detail: 'Phase 5 through Phase 8I' },
      { key: 'flags', label: 'Feature flags', value: report.checklist?.find((check) => check.key === 'feature_flags_default_off')?.status === 'passed' ? 'Default off' : 'Review', detail: 'Controlled activation only' },
      { key: 'workflow', label: 'Workflow boundary', value: report.bankWorkflowUnchanged ? 'Unchanged' : 'Review', detail: 'No automatic bank submission' },
    ],
    checklist: normalizeList(report.checklist).map((check) => ({
      key: check.key,
      label: check.label,
      status: check.status,
      required: check.required,
      message: check.message,
    })),
    nextActions: normalizeList(report.nextActions),
    actions: {
      canDownloadReport: true,
      canIntroduceOriginators: report.status === BOND_ORIGINATOR_INTERNAL_READINESS_STATUSES.ready,
      canLiveDeliver: false,
      canMutateBankWorkflow: false,
    },
    reportingOnly: true,
    sensitivePayloadIncluded: false,
    noAutomaticBankSubmission: true,
    liveDeliveryEnabled: false,
    bankWorkflowUnchanged: true,
    offerWorkflowMutationDeferred: true,
    grantWorkflowMutationDeferred: true,
  }
}

export function buildBondOriginatorInternalReadinessCsv(report = {}) {
  const rows = [
    ['section', 'metric', 'value'],
    ['scope', 'transaction_id', report.scope?.transactionId || ''],
    ['scope', 'submission_id', report.scope?.submissionId || ''],
    ['scope', 'export_package_id', report.scope?.exportPackageId || ''],
    ['readiness', 'status', report.status || ''],
    ['readiness', 'passed_checks', report.summary?.passed || 0],
    ['readiness', 'blocked_checks', report.summary?.blocked || 0],
    ['boundary', 'arch9_facilitates_only', report.rolloutBoundary?.arch9FacilitatesOnly === true ? 'true' : 'false'],
    ['boundary', 'originator_processes_externally', report.rolloutBoundary?.originatorProcessesExternally === true ? 'true' : 'false'],
    ['boundary', 'automatic_bank_submission', report.rolloutBoundary?.automaticBankSubmission === true ? 'true' : 'false'],
    ['boundary', 'live_ooba_delivery', report.rolloutBoundary?.liveOobaDelivery === true ? 'true' : 'false'],
    ['boundary', 'bank_workflow_mutation', report.rolloutBoundary?.bankWorkflowMutation === true ? 'true' : 'false'],
  ]
  normalizeList(report.checklist).forEach((check) => {
    rows.push(['check', check.key, check.status])
  })
  return `${csvRows(rows)}\n`
}

function getPilotOriginatorIdentity(originatorRecipient = {}) {
  const id = normalizeText(originatorRecipient.id || originatorRecipient.profileId || originatorRecipient.profile_id)
  const emailReference = normalizeText(
    originatorRecipient.emailReference ||
    originatorRecipient.email ||
    originatorRecipient.email_reference ||
    originatorRecipient.assigned_to_email_reference,
  )
  const name = normalizeText(originatorRecipient.name || originatorRecipient.displayName || originatorRecipient.display_name) || 'Bond originator'
  return {
    id,
    name,
    emailReference,
    key: id || emailReference,
  }
}

function packageAssignedOriginatorKey(exportPackage = {}) {
  const normalizedPackage = normalizeOriginatorWorkspacePackage(exportPackage) || exportPackage
  return normalizeText(
    normalizedPackage.assignment?.assignedToProfileId ||
    normalizedPackage.assignedToProfileId ||
    normalizedPackage.assigned_to_profile_id ||
    normalizedPackage.originatorRecipient?.id ||
    normalizedPackage.originatorRecipientId ||
    normalizedPackage.originator_recipient_id ||
    normalizedPackage.originatorRecipient?.emailReference ||
    normalizedPackage.assigned_to_email_reference,
  )
}

function buildPilotCheck({ key = '', label = '', passed = false, evidence = null, message = '' } = {}) {
  return {
    key,
    label,
    status: passed ? 'passed' : 'blocked',
    evidence,
    message: passed ? message || 'Ready.' : message || 'Resolve this before starting the one-originator pilot.',
  }
}

export function buildBondOriginatorOneOriginatorPilotReport({
  readinessReport = null,
  originatorRecipient = {},
  packages = [],
  pilotControls = {},
  generatedBy = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const originator = getPilotOriginatorIdentity(originatorRecipient)
  const normalizedPackages = normalizeList(packages)
    .map(normalizeOriginatorWorkspacePackage)
    .filter(Boolean)
  const distinctPackageOriginatorKeys = [...new Set(
    normalizedPackages
      .map(packageAssignedOriginatorKey)
      .filter(Boolean),
  )]
  const allowedStatuses = [
    BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.readyForOriginator,
    BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator,
    BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded,
  ]
  const maxPilotPackages = Math.max(1, normalizeInteger(pilotControls.maxPilotPackages || pilotControls.max_pilot_packages || 5) || 5)
  const checks = [
    buildPilotCheck({
      key: 'r1_readiness_ready',
      label: 'Internal readiness is ready',
      passed: readinessReport?.reportVersion === BOND_ORIGINATOR_INTERNAL_READINESS_REPORT_VERSION &&
        readinessReport.status === BOND_ORIGINATOR_INTERNAL_READINESS_STATUSES.ready,
      evidence: {
        reportVersion: readinessReport?.reportVersion || null,
        status: readinessReport?.status || null,
      },
      message: 'Complete Phase R1 readiness before starting a bond originator pilot.',
    }),
    buildPilotCheck({
      key: 'single_originator_selected',
      label: 'Exactly one pilot originator selected',
      passed: Boolean(originator.key),
      evidence: { originatorId: originator.id || null, emailReference: originator.emailReference || null },
      message: 'Select one named bond originator user or secure email reference for the pilot.',
    }),
    buildPilotCheck({
      key: 'no_second_originator',
      label: 'No second originator in scope',
      passed: distinctPackageOriginatorKeys.length <= 1 &&
        (!distinctPackageOriginatorKeys.length || distinctPackageOriginatorKeys[0] === originator.key),
      evidence: { assignedOriginatorKeys: distinctPackageOriginatorKeys },
      message: 'The R6 pilot supports one bond originator only.',
    }),
    buildPilotCheck({
      key: 'pilot_package_limit',
      label: 'Pilot package limit respected',
      passed: normalizedPackages.length > 0 && normalizedPackages.length <= maxPilotPackages,
      evidence: { packageCount: normalizedPackages.length, maxPilotPackages },
      message: 'Choose a small controlled set of ready packages for the pilot.',
    }),
    buildPilotCheck({
      key: 'packages_ready_for_originator',
      label: 'Packages ready for originator workspace',
      passed: normalizedPackages.length > 0 && normalizedPackages.every((item) =>
        item.destinationKey === BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY &&
        allowedStatuses.includes(item.status),
      ),
      evidence: normalizedPackages.map((item) => ({ id: item.id, status: item.status, destinationKey: item.destinationKey })),
      message: 'Every pilot package must be a ready bond originator intake package.',
    }),
    buildPilotCheck({
      key: 'manual_processing_boundary',
      label: 'Manual processing boundary confirmed',
      passed: pilotControls.liveDeliveryEnabled !== true &&
        pilotControls.automaticBankSubmission !== true &&
        pilotControls.bankWorkflowMutation !== true,
      evidence: {
        liveDeliveryEnabled: pilotControls.liveDeliveryEnabled === true,
        automaticBankSubmission: pilotControls.automaticBankSubmission === true,
        bankWorkflowMutation: pilotControls.bankWorkflowMutation === true,
      },
      message: 'The pilot must remain manual/download-only with no automatic bank submission.',
    }),
    buildPilotCheck({
      key: 'support_and_rollback_owner_defined',
      label: 'Support and rollback owner defined',
      passed: Boolean(pilotControls.supportOwner || pilotControls.support_owner) &&
        Boolean(pilotControls.rollbackOwner || pilotControls.rollback_owner),
      evidence: {
        supportOwner: pilotControls.supportOwner || pilotControls.support_owner || null,
        rollbackOwner: pilotControls.rollbackOwner || pilotControls.rollback_owner || null,
      },
      message: 'Name who supports the pilot and who can pause or roll it back.',
    }),
  ]
  const issues = readinessIssuesFromChecks(checks)
  const status = issues.length
    ? BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.blocked
    : BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.ready
  return {
    pilotVersion: BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_VERSION,
    status,
    generatedAt,
    generatedBy,
    originator,
    scope: {
      originatorCount: originator.key ? 1 : 0,
      maxActiveOriginators: 1,
      packageIds: normalizedPackages.map((item) => item.id).filter(Boolean),
      transactionIds: normalizedPackages.map((item) => item.transactionId).filter(Boolean),
      readinessReportVersion: readinessReport?.reportVersion || null,
    },
    checklist: checks,
    summary: {
      totalChecks: checks.length,
      passed: checks.filter((check) => check.status === 'passed').length,
      blocked: checks.filter((check) => check.status === 'blocked').length,
      pilotPackageCount: normalizedPackages.length,
      maxPilotPackages,
    },
    issues,
    nextActions: issues.length
      ? issues.map((issue) => issue.message)
      : ['Start the one-originator pilot with manual package assignment and daily monitoring.'],
    rolloutBoundary: {
      phase: 'R6',
      arch9FacilitatesOnly: true,
      originatorProcessesExternally: true,
      maximumActiveOriginators: 1,
      automaticBankSubmission: false,
      liveOobaDelivery: false,
      liveBankDelivery: false,
      bankWorkflowMutation: false,
      offerWorkflowMutation: false,
      grantWorkflowMutation: false,
    },
    sensitivePayloadIncluded: false,
    noAutomaticBankSubmission: true,
    liveDeliveryEnabled: false,
    bankWorkflowUnchanged: true,
    offerWorkflowMutationDeferred: true,
    grantWorkflowMutationDeferred: true,
  }
}

export function buildBondOriginatorOneOriginatorPilotLaunchPlan({
  pilotReport = {},
  packages = [],
  launchedBy = null,
  launchedAt = new Date().toISOString(),
} = {}) {
  if (pilotReport?.pilotVersion !== BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_VERSION) {
    return { ok: false, reason: 'pilot_report_required', launchPlan: null }
  }
  if (pilotReport.status !== BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.ready) {
    return { ok: false, reason: 'pilot_not_ready', launchPlan: null, issues: normalizeList(pilotReport.issues) }
  }
  const normalizedPackages = normalizeList(packages).map(normalizeOriginatorWorkspacePackage).filter(Boolean)
  return {
    ok: true,
    launchPlan: {
      pilotVersion: BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_VERSION,
      status: BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.active,
      launchedAt,
      launchedBy,
      originator: pilotReport.originator,
      packageAssignments: normalizedPackages.map((item) => ({
        exportPackageId: item.id,
        transactionId: item.transactionId,
        assignedOriginatorKey: pilotReport.originator?.key || null,
        assignmentMode: 'manual_controlled_pilot',
        canAcceptPackage: item.status === BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.readyForOriginator,
        canDownloadPackage: [
          BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator,
          BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded,
        ].includes(item.status),
      })),
      monitoringCadence: 'daily',
      rollback: {
        canPausePilot: true,
        canRevokeFutureAssignments: true,
        preserveAuditHistory: true,
      },
      actions: {
        canAssignSecondOriginator: false,
        canLiveDeliver: false,
        canAutoSubmitToBank: false,
        canMutateBankWorkflow: false,
      },
      workflowBoundary: pilotReport.rolloutBoundary,
    },
    event: {
      eventType: 'bond_originator_one_originator_pilot_started',
      actorId: launchedBy,
      occurredAt: launchedAt,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

export function buildBondOriginatorOneOriginatorPilotViewModel({
  pilotReport = null,
  launchPlan = null,
  packages = [],
  progressEvents = [],
  documentRequests = [],
  offerCaptures = [],
  grantCaptures = [],
} = {}) {
  const report = pilotReport?.pilotVersion === BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_VERSION ? pilotReport : null
  const status = launchPlan?.status || report?.status || BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.draft
  const normalizedPackages = normalizeList(packages).map(normalizeOriginatorWorkspacePackage).filter(Boolean)
  const progressTimeline = buildBondOriginatorProgressTimeline({ progressEvents, documentRequests })
  const documentRequestSummary = buildBondOriginatorDocumentRequestSummary(documentRequests)
  const offerGrantSummary = buildBondOriginatorOfferGrantSummary({ offerCaptures, grantCaptures })
  return {
    available: Boolean(report),
    pilotVersion: BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_VERSION,
    status,
    statusLabel: {
      [BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.draft]: 'Pilot not started',
      [BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.ready]: 'Ready for pilot',
      [BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.active]: 'Pilot active',
      [BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.paused]: 'Pilot paused',
      [BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.completed]: 'Pilot completed',
      [BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.blocked]: 'Pilot blocked',
    }[status] || 'Pilot status',
    originator: report?.originator || null,
    cards: [
      { key: 'originators', label: 'Pilot originators', value: report?.scope?.originatorCount ? '1/1' : '0/1', detail: report?.originator?.name || 'No originator selected' },
      { key: 'packages', label: 'Pilot packages', value: String(normalizedPackages.length || report?.summary?.pilotPackageCount || 0), detail: `${report?.summary?.maxPilotPackages || 5} maximum for this pilot` },
      { key: 'document_requests', label: 'Document requests', value: `${documentRequestSummary.open || 0} open`, detail: `${documentRequestSummary.awaitingReview || 0} awaiting review` },
      { key: 'offers_grants', label: 'Offers and grants', value: `${offerGrantSummary.offerCount || 0} offers`, detail: `${offerGrantSummary.grantCount || 0} grants` },
      { key: 'progress', label: 'Latest progress', value: progressTimeline.summary?.currentLabel || 'No update', detail: progressTimeline.summary?.currentStatus || 'pending' },
    ],
    packages: normalizedPackages.map((item) => buildBondOriginatorWorkspacePackageSummary({ exportPackage: item })),
    checklist: normalizeList(report?.checklist).map((check) => ({
      key: check.key,
      label: check.label,
      status: check.status,
      message: check.message,
    })),
    nextActions: status === BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.active
      ? ['Monitor the pilot daily, collect feedback, and keep package handling manual.']
      : normalizeList(report?.nextActions),
    actions: {
      canStartPilot: report?.status === BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.ready && !launchPlan,
      canPausePilot: status === BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.active,
      canAddSecondOriginator: false,
      canLiveDeliver: false,
      canAutoSubmitToBank: false,
      canMutateBankWorkflow: false,
    },
    workflowBoundary: {
      arch9FacilitatesOnly: true,
      originatorProcessesExternally: true,
      maximumActiveOriginators: 1,
      noAutomaticBankSubmission: true,
      liveDeliveryEnabled: false,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
    },
    payloadsExcluded: true,
    tokensExcluded: true,
    publicDocumentUrlsExcluded: true,
  }
}

function normalizeOperationalIncident(rawIncident = {}) {
  const severity = normalizeText(rawIncident.severity).toLowerCase()
  const normalizedSeverity = Object.values(BOND_ORIGINATOR_OPERATIONAL_INCIDENT_SEVERITIES).includes(severity)
    ? severity
    : BOND_ORIGINATOR_OPERATIONAL_INCIDENT_SEVERITIES.low
  return {
    id: normalizeText(rawIncident.id) || null,
    severity: normalizedSeverity,
    status: normalizeText(rawIncident.status || (rawIncident.resolvedAt || rawIncident.resolved_at ? 'resolved' : 'open')) || 'open',
    title: normalizeText(rawIncident.title) || 'Operational incident',
    summary: normalizeText(rawIncident.summary),
    relatedPackageId: normalizeText(rawIncident.relatedPackageId || rawIncident.related_package_id) || null,
    detectedAt: rawIncident.detectedAt || rawIncident.detected_at || rawIncident.occurredAt || rawIncident.occurred_at || null,
    resolvedAt: rawIncident.resolvedAt || rawIncident.resolved_at || null,
    sensitivePayloadIncluded: rawIncident.sensitivePayloadIncluded === true || rawIncident.sensitive_payload_included === true,
  }
}

function latestOperationalTimestamp(...collections) {
  return collections
    .flatMap((collection) => normalizeList(collection))
    .map((item) =>
      item.occurredAt ||
      item.occurred_at ||
      item.updatedAt ||
      item.updated_at ||
      item.publishedAt ||
      item.published_at ||
      item.capturedAt ||
      item.captured_at ||
      item.createdAt ||
      item.created_at ||
      item.lastDownloadedAt ||
      item.last_downloaded_at ||
      null,
    )
    .filter(Boolean)
    .sort()
    .at(-1) || null
}

function hoursBetween(later, earlier) {
  const laterMs = Date.parse(later)
  const earlierMs = Date.parse(earlier)
  if (!Number.isFinite(laterMs) || !Number.isFinite(earlierMs)) return null
  return Math.max(0, (laterMs - earlierMs) / 36e5)
}

function buildHardeningCheck({ key = '', label = '', passed = false, required = true, evidence = null, message = '' } = {}) {
  return {
    key,
    label,
    status: passed ? 'passed' : required ? 'blocked' : 'attention_required',
    required,
    evidence,
    message: passed ? message || 'Healthy.' : message || 'Operational hardening evidence is required.',
  }
}

function hardeningStatusFromChecks(checks = []) {
  if (checks.some((check) => check.status === 'blocked')) return BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.blocked
  if (checks.some((check) => check.status === 'attention_required')) return BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.attentionRequired
  return BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.healthy
}

export function recordBondOriginatorOperationalIncident({
  id = null,
  severity = BOND_ORIGINATOR_OPERATIONAL_INCIDENT_SEVERITIES.low,
  title = '',
  summary = '',
  relatedPackageId = null,
  detectedBy = null,
  detectedAt = new Date().toISOString(),
  resolvedAt = null,
} = {}) {
  const incident = normalizeOperationalIncident({
    id,
    severity,
    title,
    summary,
    relatedPackageId,
    detectedAt,
    resolvedAt,
  })
  if (!incident.title || !incident.summary) {
    return { ok: false, reason: 'incident_title_and_summary_required', incident: null }
  }
  return {
    ok: true,
    incident: {
      ...incident,
      detectedBy,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
    },
    event: {
      eventType: 'bond_originator_operational_incident_recorded',
      actorId: detectedBy,
      occurredAt: detectedAt,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

export function buildBondOriginatorOperationalHardeningReport({
  pilotReport = null,
  launchPlan = null,
  packages = [],
  progressEvents = [],
  documentRequests = [],
  offerCaptures = [],
  grantCaptures = [],
  incidents = [],
  operationalControls = {},
  generatedBy = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const pilotStatus = launchPlan?.status || pilotReport?.status || null
  const normalizedPackages = normalizeList(packages).map(normalizeOriginatorWorkspacePackage).filter(Boolean)
  const normalizedIncidents = normalizeList(incidents).map(normalizeOperationalIncident)
  const latestActivityAt = latestOperationalTimestamp(progressEvents)
  const staleThresholdHours = normalizeInteger(operationalControls.staleActivityThresholdHours || operationalControls.stale_activity_threshold_hours || 48) || 48
  const staleHours = latestActivityAt ? hoursBetween(generatedAt, latestActivityAt) : null
  const openCriticalIncidents = normalizedIncidents.filter((incident) =>
    ['open', 'investigating'].includes(incident.status) &&
    [
      BOND_ORIGINATOR_OPERATIONAL_INCIDENT_SEVERITIES.high,
      BOND_ORIGINATOR_OPERATIONAL_INCIDENT_SEVERITIES.critical,
    ].includes(incident.severity),
  )
  const documentRequestSummary = buildBondOriginatorDocumentRequestSummary(documentRequests)
  const progressTimeline = buildBondOriginatorProgressTimeline({ progressEvents, documentRequests })
  const offerGrantSummary = buildBondOriginatorOfferGrantSummary({ offerCaptures, grantCaptures })
  const automationDisabled = operationalControls.liveDeliveryEnabled !== true &&
    operationalControls.automaticBankSubmission !== true &&
    operationalControls.bankWorkflowMutation !== true &&
    operationalControls.offerWorkflowMutation !== true &&
    operationalControls.grantWorkflowMutation !== true
  const checks = [
    buildHardeningCheck({
      key: 'r6_pilot_active',
      label: 'R6 pilot is active or ready',
      passed: pilotReport?.pilotVersion === BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_VERSION &&
        [
          BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.ready,
          BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.active,
          BOND_ORIGINATOR_ONE_ORIGINATOR_PILOT_STATUSES.completed,
        ].includes(pilotStatus),
      evidence: { pilotVersion: pilotReport?.pilotVersion || null, pilotStatus },
      message: 'Operational hardening requires a prepared R6 one-originator pilot.',
    }),
    buildHardeningCheck({
      key: 'single_originator_still_enforced',
      label: 'Single originator still enforced',
      passed: pilotReport?.scope?.maxActiveOriginators === 1 &&
        pilotReport?.rolloutBoundary?.maximumActiveOriginators === 1,
      evidence: {
        maxActiveOriginators: pilotReport?.scope?.maxActiveOriginators || null,
        boundaryMaximum: pilotReport?.rolloutBoundary?.maximumActiveOriginators || null,
      },
      message: 'R7 hardening does not expand beyond one pilot originator.',
    }),
    buildHardeningCheck({
      key: 'support_coverage_defined',
      label: 'Support coverage defined',
      passed: Boolean(operationalControls.supportOwner || operationalControls.support_owner) &&
        Boolean(operationalControls.escalationOwner || operationalControls.escalation_owner) &&
        Boolean(operationalControls.rollbackOwner || operationalControls.rollback_owner),
      evidence: {
        supportOwner: operationalControls.supportOwner || operationalControls.support_owner || null,
        escalationOwner: operationalControls.escalationOwner || operationalControls.escalation_owner || null,
        rollbackOwner: operationalControls.rollbackOwner || operationalControls.rollback_owner || null,
      },
      message: 'Support, escalation and rollback owners must be named before hardening is healthy.',
    }),
    buildHardeningCheck({
      key: 'runbook_ready',
      label: 'Runbook and rollback ready',
      passed: operationalControls.runbookAvailable === true &&
        operationalControls.rollbackRunbookAvailable === true &&
        operationalControls.pausePilotTested === true,
      evidence: {
        runbookAvailable: operationalControls.runbookAvailable === true,
        rollbackRunbookAvailable: operationalControls.rollbackRunbookAvailable === true,
        pausePilotTested: operationalControls.pausePilotTested === true,
      },
      message: 'Document the support runbook, rollback runbook and tested pause path.',
    }),
    buildHardeningCheck({
      key: 'monitoring_cadence_active',
      label: 'Monitoring cadence active',
      passed: Boolean(operationalControls.monitoringCadence || operationalControls.monitoring_cadence || launchPlan?.monitoringCadence),
      evidence: {
        monitoringCadence: operationalControls.monitoringCadence || operationalControls.monitoring_cadence || launchPlan?.monitoringCadence || null,
      },
      message: 'Define a monitoring cadence for the pilot.',
    }),
    buildHardeningCheck({
      key: 'recent_activity_present',
      label: 'Recent pilot activity present',
      passed: latestActivityAt ? staleHours <= staleThresholdHours : false,
      required: false,
      evidence: { latestActivityAt, staleHours, staleThresholdHours },
      message: 'Pilot activity has gone stale; review the originator queue and progress updates.',
    }),
    buildHardeningCheck({
      key: 'document_request_backlog_reviewed',
      label: 'Document request backlog reviewed',
      passed: documentRequestSummary.awaitingReview <= (normalizeInteger(operationalControls.maxAwaitingReviewDocumentRequests || 5) || 5),
      required: false,
      evidence: {
        awaitingReview: documentRequestSummary.awaitingReview,
        open: documentRequestSummary.open,
      },
      message: 'Requested documents are building up and need operational review.',
    }),
    buildHardeningCheck({
      key: 'no_open_critical_incidents',
      label: 'No open critical incidents',
      passed: openCriticalIncidents.length === 0,
      evidence: { openCriticalIncidentCount: openCriticalIncidents.length },
      message: 'Pause or contain the pilot before continuing while high-severity incidents remain open.',
    }),
    buildHardeningCheck({
      key: 'sensitive_payloads_excluded',
      label: 'Sensitive payloads excluded from operations',
      passed: normalizedIncidents.every((incident) => incident.sensitivePayloadIncluded !== true),
      evidence: { incidentCount: normalizedIncidents.length },
      message: 'Operational incidents and reports must not include raw payloads, tokens or applicant financial values.',
    }),
    buildHardeningCheck({
      key: 'automation_boundary_intact',
      label: 'Automation boundary intact',
      passed: automationDisabled,
      evidence: {
        liveDeliveryEnabled: operationalControls.liveDeliveryEnabled === true,
        automaticBankSubmission: operationalControls.automaticBankSubmission === true,
        bankWorkflowMutation: operationalControls.bankWorkflowMutation === true,
        offerWorkflowMutation: operationalControls.offerWorkflowMutation === true,
        grantWorkflowMutation: operationalControls.grantWorkflowMutation === true,
      },
      message: 'Operational hardening must not introduce live delivery or bank workflow mutation.',
    }),
  ]
  const status = hardeningStatusFromChecks(checks)
  const issues = readinessIssuesFromChecks(checks)
  return {
    hardeningVersion: BOND_ORIGINATOR_OPERATIONAL_HARDENING_VERSION,
    status,
    generatedAt,
    generatedBy,
    scope: {
      pilotVersion: pilotReport?.pilotVersion || null,
      pilotStatus,
      pilotOriginatorKey: pilotReport?.originator?.key || null,
      packageCount: normalizedPackages.length,
      maximumActiveOriginators: 1,
    },
    summary: {
      totalChecks: checks.length,
      passed: checks.filter((check) => check.status === 'passed').length,
      attentionRequired: checks.filter((check) => check.status === 'attention_required').length,
      blocked: checks.filter((check) => check.status === 'blocked').length,
      openDocumentRequests: documentRequestSummary.open,
      awaitingDocumentReview: documentRequestSummary.awaitingReview,
      progressStatus: progressTimeline.summary?.currentStatus || 'pending',
      offerCount: offerGrantSummary.offerCount,
      grantCount: offerGrantSummary.grantCount,
      incidentCount: normalizedIncidents.length,
      openCriticalIncidentCount: openCriticalIncidents.length,
      latestActivityAt,
    },
    checklist: checks,
    incidents: normalizedIncidents.map((incident) => ({
      id: incident.id,
      severity: incident.severity,
      status: incident.status,
      title: incident.title,
      relatedPackageId: incident.relatedPackageId,
      detectedAt: incident.detectedAt,
      resolvedAt: incident.resolvedAt,
    })),
    nextActions: issues.length
      ? issues.map((issue) => issue.message)
      : ['Continue the pilot with daily monitoring and keep the pause path available.'],
    workflowBoundary: {
      arch9FacilitatesOnly: true,
      originatorProcessesExternally: true,
      maximumActiveOriginators: 1,
      noAutomaticBankSubmission: true,
      liveDeliveryEnabled: false,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
    },
    sensitivePayloadIncluded: false,
    noAutomaticBankSubmission: true,
    liveDeliveryEnabled: false,
    bankWorkflowUnchanged: true,
    offerWorkflowMutationDeferred: true,
    grantWorkflowMutationDeferred: true,
  }
}

export function buildBondOriginatorOperationalHardeningViewModel({ report = {} } = {}) {
  if (!report || report.hardeningVersion !== BOND_ORIGINATOR_OPERATIONAL_HARDENING_VERSION) {
    return {
      available: false,
      status: 'not_prepared',
      statusLabel: 'Operational hardening not prepared',
      cards: [],
      nextActions: ['Prepare the R7 operational hardening report before expanding originator operations.'],
      actions: {
        canContinuePilot: false,
        canExpandOriginators: false,
        canLiveDeliver: false,
        canMutateBankWorkflow: false,
      },
      bankWorkflowUnchanged: true,
    }
  }
  const labels = {
    [BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.healthy]: 'Operationally healthy',
    [BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.attentionRequired]: 'Attention required',
    [BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.blocked]: 'Pilot blocked',
  }
  return {
    available: true,
    hardeningVersion: BOND_ORIGINATOR_OPERATIONAL_HARDENING_VERSION,
    status: report.status,
    statusLabel: labels[report.status] || 'Operational hardening',
    generatedAt: report.generatedAt || null,
    cards: [
      { key: 'health', label: 'Health checks', value: `${report.summary?.passed || 0}/${report.summary?.totalChecks || 0}`, detail: `${report.summary?.blocked || 0} blocked` },
      { key: 'activity', label: 'Latest activity', value: report.summary?.latestActivityAt || 'No activity', detail: report.summary?.progressStatus || 'pending' },
      { key: 'documents', label: 'Documents', value: `${report.summary?.openDocumentRequests || 0} open`, detail: `${report.summary?.awaitingDocumentReview || 0} awaiting review` },
      { key: 'incidents', label: 'Incidents', value: String(report.summary?.incidentCount || 0), detail: `${report.summary?.openCriticalIncidentCount || 0} critical open` },
      { key: 'originators', label: 'Originators', value: '1/1', detail: 'No expansion in R7' },
    ],
    checklist: normalizeList(report.checklist).map((check) => ({
      key: check.key,
      label: check.label,
      status: check.status,
      required: check.required,
      message: check.message,
    })),
    incidents: normalizeList(report.incidents),
    nextActions: normalizeList(report.nextActions),
    actions: {
      canContinuePilot: report.status !== BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.blocked,
      canPausePilot: report.status !== BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.healthy,
      canExpandOriginators: false,
      canLiveDeliver: false,
      canAutoSubmitToBank: false,
      canMutateBankWorkflow: false,
    },
    workflowBoundary: report.workflowBoundary,
    payloadsExcluded: true,
    tokensExcluded: true,
    publicDocumentUrlsExcluded: true,
  }
}

export function buildBondOriginatorOperationalHardeningRunbook({
  report = {},
  supportContact = '',
  escalationContact = '',
  rollbackContact = '',
} = {}) {
  return {
    hardeningVersion: BOND_ORIGINATOR_OPERATIONAL_HARDENING_VERSION,
    reportStatus: report.status || null,
    contacts: {
      support: normalizeText(supportContact),
      escalation: normalizeText(escalationContact),
      rollback: normalizeText(rollbackContact),
    },
    steps: [
      { key: 'monitor_daily', label: 'Review pilot health daily', owner: 'support', sensitivePayloadRequired: false },
      { key: 'review_document_backlog', label: 'Review open and awaiting-review document requests', owner: 'support', sensitivePayloadRequired: false },
      { key: 'check_progress_freshness', label: 'Confirm originator progress updates are current', owner: 'support', sensitivePayloadRequired: false },
      { key: 'triage_incidents', label: 'Triage high-severity incidents and decide whether to pause', owner: 'escalation', sensitivePayloadRequired: false },
      { key: 'pause_pilot', label: 'Pause the pilot through the trusted pause operation when required', owner: 'rollback', sensitivePayloadRequired: false },
    ],
    rollback: {
      preserveAuditHistory: true,
      revokeFutureAssignmentsOnly: true,
      doNotDeletePackages: true,
      doNotDeleteDocuments: true,
      doNotMutateBankWorkflow: true,
    },
    boundaries: {
      noRawTokens: true,
      noPublicDocumentUrls: true,
      noSensitivePayloads: true,
      noAutomaticBankSubmission: true,
      liveDeliveryEnabled: false,
      bankWorkflowUnchanged: true,
    },
  }
}

function normalizeRolloutOriginators(originatorRecipients = []) {
  const seen = new Set()
  return normalizeList(originatorRecipients)
    .map(getPilotOriginatorIdentity)
    .filter((originator) => Boolean(originator.key))
    .filter((originator) => {
      if (seen.has(originator.key)) return false
      seen.add(originator.key)
      return true
    })
}

function buildRolloutCheck({ key = '', label = '', passed = false, evidence = null, message = '' } = {}) {
  return {
    key,
    label,
    status: passed ? 'passed' : 'blocked',
    evidence,
    message: passed ? message || 'Ready.' : message || 'Resolve this before starting the multi-originator rollout.',
  }
}

export function buildBondOriginatorMultiOriginatorRolloutReport({
  hardeningReport = null,
  originatorRecipients = [],
  packages = [],
  rolloutControls = {},
  generatedBy = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const originators = normalizeRolloutOriginators(originatorRecipients)
  const originatorKeys = originators.map((originator) => originator.key)
  const maxActiveOriginators = Math.min(
    5,
    Math.max(2, normalizeInteger(rolloutControls.maxActiveOriginators || rolloutControls.max_active_originators || 3) || 3),
  )
  const maxPackagesPerOriginator = Math.max(1, normalizeInteger(rolloutControls.maxPackagesPerOriginator || rolloutControls.max_packages_per_originator || 5) || 5)
  const normalizedPackages = normalizeList(packages)
    .map(normalizeOriginatorWorkspacePackage)
    .filter(Boolean)
  const allowedStatuses = [
    BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.readyForOriginator,
    BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator,
    BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded,
  ]
  const assignedOriginatorKeys = normalizedPackages
    .map(packageAssignedOriginatorKey)
    .filter(Boolean)
  const unassignedPackages = normalizedPackages.filter((item) => !packageAssignedOriginatorKey(item))
  const packagesAssignedOutsideCohort = normalizedPackages.filter((item) => {
    const assignedKey = packageAssignedOriginatorKey(item)
    return assignedKey && !originatorKeys.includes(assignedKey)
  })
  const packageCountsByOriginator = originatorKeys.reduce((acc, key) => ({ ...acc, [key]: 0 }), {})
  assignedOriginatorKeys.forEach((key) => {
    packageCountsByOriginator[key] = (packageCountsByOriginator[key] || 0) + 1
  })
  const overCapacityOriginators = Object.entries(packageCountsByOriginator)
    .filter(([, count]) => count > maxPackagesPerOriginator)
    .map(([key, count]) => ({ key, count }))
  const automationDisabled = rolloutControls.liveDeliveryEnabled !== true &&
    rolloutControls.automaticBankSubmission !== true &&
    rolloutControls.bankWorkflowMutation !== true &&
    rolloutControls.offerWorkflowMutation !== true &&
    rolloutControls.grantWorkflowMutation !== true
  const checks = [
    buildRolloutCheck({
      key: 'r7_hardening_healthy',
      label: 'Operational hardening is healthy',
      passed: hardeningReport?.hardeningVersion === BOND_ORIGINATOR_OPERATIONAL_HARDENING_VERSION &&
        hardeningReport.status === BOND_ORIGINATOR_OPERATIONAL_HARDENING_STATUSES.healthy,
      evidence: {
        hardeningVersion: hardeningReport?.hardeningVersion || null,
        status: hardeningReport?.status || null,
      },
      message: 'Complete a healthy Phase R7 operational hardening report before expanding originator access.',
    }),
    buildRolloutCheck({
      key: 'approved_originator_cohort',
      label: 'Approved originator cohort selected',
      passed: originators.length >= 2,
      evidence: { originatorCount: originators.length, originatorKeys },
      message: 'Select at least two approved bond originators for the R8 rollout cohort.',
    }),
    buildRolloutCheck({
      key: 'rollout_originator_limit',
      label: 'Rollout originator limit respected',
      passed: originators.length >= 2 && originators.length <= maxActiveOriginators,
      evidence: { originatorCount: originators.length, maxActiveOriginators },
      message: 'Keep the R8 rollout within the centrally approved active-originator limit.',
    }),
    buildRolloutCheck({
      key: 'packages_ready_for_rollout',
      label: 'Packages ready for manual originator processing',
      passed: normalizedPackages.length > 0 && normalizedPackages.every((item) =>
        item.destinationKey === BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY &&
        allowedStatuses.includes(item.status),
      ),
      evidence: normalizedPackages.map((item) => ({ id: item.id, status: item.status, destinationKey: item.destinationKey })),
      message: 'Every rollout package must be a ready manual bond-originator intake package.',
    }),
    buildRolloutCheck({
      key: 'packages_assigned_to_approved_originators',
      label: 'Packages assigned to approved cohort originators',
      passed: normalizedPackages.length > 0 && unassignedPackages.length === 0 && packagesAssignedOutsideCohort.length === 0,
      evidence: {
        unassignedPackageIds: unassignedPackages.map((item) => item.id),
        outsideCohortPackageIds: packagesAssignedOutsideCohort.map((item) => item.id),
      },
      message: 'Assign every package to one approved rollout originator before launch.',
    }),
    buildRolloutCheck({
      key: 'originator_package_capacity',
      label: 'Originator package capacity respected',
      passed: overCapacityOriginators.length === 0,
      evidence: { packageCountsByOriginator, maxPackagesPerOriginator, overCapacityOriginators },
      message: 'Reduce package volume or split the rollout before an originator exceeds the approved package limit.',
    }),
    buildRolloutCheck({
      key: 'support_escalation_and_rollback_defined',
      label: 'Support, escalation and rollback coverage defined',
      passed: Boolean(rolloutControls.supportOwner || rolloutControls.support_owner) &&
        Boolean(rolloutControls.escalationOwner || rolloutControls.escalation_owner) &&
        Boolean(rolloutControls.rollbackOwner || rolloutControls.rollback_owner),
      evidence: {
        supportOwner: rolloutControls.supportOwner || rolloutControls.support_owner || null,
        escalationOwner: rolloutControls.escalationOwner || rolloutControls.escalation_owner || null,
        rollbackOwner: rolloutControls.rollbackOwner || rolloutControls.rollback_owner || null,
      },
      message: 'Name support, escalation and rollback owners for the multi-originator rollout.',
    }),
    buildRolloutCheck({
      key: 'monitoring_and_pause_ready',
      label: 'Monitoring and pause path ready',
      passed: Boolean(rolloutControls.monitoringCadence || rolloutControls.monitoring_cadence) &&
        rolloutControls.pauseRolloutTested === true,
      evidence: {
        monitoringCadence: rolloutControls.monitoringCadence || rolloutControls.monitoring_cadence || null,
        pauseRolloutTested: rolloutControls.pauseRolloutTested === true,
      },
      message: 'Define monitoring cadence and test the rollout pause path before launch.',
    }),
    buildRolloutCheck({
      key: 'automation_boundary_intact',
      label: 'Automation boundary intact',
      passed: automationDisabled,
      evidence: {
        liveDeliveryEnabled: rolloutControls.liveDeliveryEnabled === true,
        automaticBankSubmission: rolloutControls.automaticBankSubmission === true,
        bankWorkflowMutation: rolloutControls.bankWorkflowMutation === true,
        offerWorkflowMutation: rolloutControls.offerWorkflowMutation === true,
        grantWorkflowMutation: rolloutControls.grantWorkflowMutation === true,
      },
      message: 'R8 rollout remains manual; it must not introduce live delivery or workflow mutation.',
    }),
  ]
  const issues = readinessIssuesFromChecks(checks)
  const status = issues.length
    ? BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.blocked
    : BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.ready
  return {
    rolloutVersion: BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_VERSION,
    status,
    generatedAt,
    generatedBy,
    originators,
    scope: {
      originatorCount: originators.length,
      maxActiveOriginators,
      maxPackagesPerOriginator,
      packageIds: normalizedPackages.map((item) => item.id).filter(Boolean),
      transactionIds: normalizedPackages.map((item) => item.transactionId).filter(Boolean),
      hardeningVersion: hardeningReport?.hardeningVersion || null,
    },
    packageDistribution: originators.map((originator) => ({
      originatorKey: originator.key,
      originatorName: originator.name,
      packageCount: packageCountsByOriginator[originator.key] || 0,
      maxPackages: maxPackagesPerOriginator,
    })),
    checklist: checks,
    summary: {
      totalChecks: checks.length,
      passed: checks.filter((check) => check.status === 'passed').length,
      blocked: checks.filter((check) => check.status === 'blocked').length,
      originatorCount: originators.length,
      maxActiveOriginators,
      packageCount: normalizedPackages.length,
      unassignedPackageCount: unassignedPackages.length,
      packagesOutsideCohortCount: packagesAssignedOutsideCohort.length,
    },
    issues,
    nextActions: issues.length
      ? issues.map((issue) => issue.message)
      : ['Start the controlled multi-originator rollout with manual package handling and daily monitoring.'],
    rolloutBoundary: {
      phase: 'R8',
      arch9FacilitatesOnly: true,
      originatorProcessesExternally: true,
      maximumActiveOriginators: maxActiveOriginators,
      automaticBankSubmission: false,
      liveOobaDelivery: false,
      liveBankDelivery: false,
      bankWorkflowMutation: false,
      offerWorkflowMutation: false,
      grantWorkflowMutation: false,
    },
    sensitivePayloadIncluded: false,
    noAutomaticBankSubmission: true,
    liveDeliveryEnabled: false,
    bankWorkflowUnchanged: true,
    offerWorkflowMutationDeferred: true,
    grantWorkflowMutationDeferred: true,
  }
}

export function buildBondOriginatorMultiOriginatorRolloutLaunchPlan({
  rolloutReport = {},
  packages = [],
  launchedBy = null,
  launchedAt = new Date().toISOString(),
} = {}) {
  if (rolloutReport?.rolloutVersion !== BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_VERSION) {
    return { ok: false, reason: 'multi_originator_rollout_report_required', launchPlan: null }
  }
  if (rolloutReport.status !== BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.ready) {
    return { ok: false, reason: 'multi_originator_rollout_not_ready', launchPlan: null, issues: normalizeList(rolloutReport.issues) }
  }
  const normalizedPackages = normalizeList(packages).map(normalizeOriginatorWorkspacePackage).filter(Boolean)
  return {
    ok: true,
    launchPlan: {
      rolloutVersion: BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_VERSION,
      status: BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.active,
      launchedAt,
      launchedBy,
      originators: normalizeList(rolloutReport.originators),
      packageAssignments: normalizedPackages.map((item) => ({
        exportPackageId: item.id,
        transactionId: item.transactionId,
        assignedOriginatorKey: packageAssignedOriginatorKey(item),
        assignmentMode: 'manual_controlled_multi_originator_rollout',
        canAcceptPackage: item.status === BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.readyForOriginator,
        canDownloadPackage: [
          BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator,
          BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded,
        ].includes(item.status),
      })),
      monitoringCadence: 'daily',
      rollback: {
        canPauseRollout: true,
        canRevokeFutureAssignments: true,
        preserveAuditHistory: true,
      },
      actions: {
        canAddOriginatorOutsideCohort: false,
        canLiveDeliver: false,
        canAutoSubmitToBank: false,
        canMutateBankWorkflow: false,
      },
      workflowBoundary: rolloutReport.rolloutBoundary,
    },
    event: {
      eventType: 'bond_originator_multi_originator_rollout_started',
      actorId: launchedBy,
      occurredAt: launchedAt,
      sensitivePayloadIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

export function buildBondOriginatorMultiOriginatorRolloutViewModel({
  rolloutReport = null,
  launchPlan = null,
  packages = [],
  progressEvents = [],
  documentRequests = [],
  offerCaptures = [],
  grantCaptures = [],
} = {}) {
  const report = rolloutReport?.rolloutVersion === BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_VERSION ? rolloutReport : null
  const status = launchPlan?.status || report?.status || BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.draft
  const normalizedPackages = normalizeList(packages).map(normalizeOriginatorWorkspacePackage).filter(Boolean)
  const progressTimeline = buildBondOriginatorProgressTimeline({ progressEvents, documentRequests })
  const documentRequestSummary = buildBondOriginatorDocumentRequestSummary(documentRequests)
  const offerGrantSummary = buildBondOriginatorOfferGrantSummary({ offerCaptures, grantCaptures })
  const originatorCount = report?.scope?.originatorCount || normalizeList(report?.originators).length || 0
  const maxActiveOriginators = report?.scope?.maxActiveOriginators || 3
  return {
    available: Boolean(report),
    rolloutVersion: BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_VERSION,
    status,
    statusLabel: {
      [BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.draft]: 'Rollout not started',
      [BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.ready]: 'Ready for multi-originator rollout',
      [BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.active]: 'Multi-originator rollout active',
      [BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.paused]: 'Rollout paused',
      [BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.completed]: 'Rollout completed',
      [BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.blocked]: 'Rollout blocked',
    }[status] || 'Rollout status',
    originators: normalizeList(report?.originators),
    packageDistribution: normalizeList(report?.packageDistribution),
    cards: [
      { key: 'originators', label: 'Originators', value: `${originatorCount}/${maxActiveOriginators}`, detail: 'Approved rollout cohort only' },
      { key: 'packages', label: 'Rollout packages', value: String(normalizedPackages.length || report?.summary?.packageCount || 0), detail: 'Manual intake packages' },
      { key: 'document_requests', label: 'Document requests', value: `${documentRequestSummary.open || 0} open`, detail: `${documentRequestSummary.awaitingReview || 0} awaiting review` },
      { key: 'offers_grants', label: 'Offers and grants', value: `${offerGrantSummary.offerCount || 0} offers`, detail: `${offerGrantSummary.grantCount || 0} grants` },
      { key: 'progress', label: 'Latest progress', value: progressTimeline.summary?.currentLabel || 'No update', detail: progressTimeline.summary?.currentStatus || 'pending' },
    ],
    packages: normalizedPackages.map((item) => buildBondOriginatorWorkspacePackageSummary({ exportPackage: item })),
    checklist: normalizeList(report?.checklist).map((check) => ({
      key: check.key,
      label: check.label,
      status: check.status,
      message: check.message,
    })),
    nextActions: status === BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.active
      ? ['Monitor each originator daily, keep package handling manual, and pause the rollout if hardening controls fail.']
      : normalizeList(report?.nextActions),
    actions: {
      canStartRollout: report?.status === BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.ready && !launchPlan,
      canPauseRollout: status === BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.active,
      canAddOriginatorOutsideCohort: false,
      canLiveDeliver: false,
      canAutoSubmitToBank: false,
      canMutateBankWorkflow: false,
    },
    workflowBoundary: {
      arch9FacilitatesOnly: true,
      originatorProcessesExternally: true,
      maximumActiveOriginators: maxActiveOriginators,
      noAutomaticBankSubmission: true,
      liveDeliveryEnabled: false,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
    },
    payloadsExcluded: true,
    tokensExcluded: true,
    publicDocumentUrlsExcluded: true,
  }
}

const FORMAL_INTEGRATION_REQUIRED_EVIDENCE = [
  'approvedSchema',
  'enumMap',
  'validationRules',
  'transportPolicy',
  'credentialPolicy',
  'acknowledgementContract',
  'statusContract',
  'securityReview',
  'dataProcessingApproval',
  'sandboxTestPlan',
]

function normalizeFormalIntegrationEvidence(integrationContract = {}) {
  return {
    approvedSchema: Boolean(integrationContract.approvedSchema || integrationContract.approved_schema || integrationContract.schemaApproved),
    enumMap: Boolean(integrationContract.enumMap || integrationContract.enum_map || integrationContract.enumMapApproved),
    validationRules: Boolean(integrationContract.validationRules || integrationContract.validation_rules || integrationContract.validationRulesApproved),
    transportPolicy: Boolean(integrationContract.transportPolicy || integrationContract.transport_policy || integrationContract.transportPolicyApproved),
    credentialPolicy: Boolean(integrationContract.credentialPolicy || integrationContract.credential_policy || integrationContract.credentialsApproved),
    acknowledgementContract: Boolean(integrationContract.acknowledgementContract || integrationContract.acknowledgement_contract || integrationContract.ackContractApproved),
    statusContract: Boolean(integrationContract.statusContract || integrationContract.status_contract || integrationContract.statusMappingApproved),
    securityReview: Boolean(integrationContract.securityReview || integrationContract.security_review || integrationContract.securityApproved),
    dataProcessingApproval: Boolean(integrationContract.dataProcessingApproval || integrationContract.data_processing_approval || integrationContract.privacyApproved),
    sandboxTestPlan: Boolean(integrationContract.sandboxTestPlan || integrationContract.sandbox_test_plan || integrationContract.sandboxPlanApproved),
  }
}

function buildFormalIntegrationCheck({ key = '', label = '', passed = false, evidence = null, message = '' } = {}) {
  return {
    key,
    label,
    status: passed ? 'passed' : 'blocked',
    evidence,
    message: passed ? message || 'Ready.' : message || 'Resolve this before enabling a formal integration sandbox.',
  }
}

export function buildBondOriginatorFormalIntegrationReadinessReport({
  rolloutReport = null,
  recipientAdapter = null,
  recipientProfileKey = '',
  integrationContract = {},
  formalControls = {},
  generatedBy = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const evidence = normalizeFormalIntegrationEvidence(integrationContract)
  const missingEvidence = FORMAL_INTEGRATION_REQUIRED_EVIDENCE.filter((key) => evidence[key] !== true)
  const destinationKey = normalizeText(
    recipientAdapter?.destinationKey ||
    integrationContract.destinationKey ||
    integrationContract.destination_key ||
    recipientProfileKey,
  )
  const destinationLabel = normalizeText(
    recipientAdapter?.label ||
    integrationContract.destinationLabel ||
    integrationContract.destination_label ||
    destinationKey,
  ) || 'Formal integration'
  const rolloutStatus = rolloutReport?.status || null
  const rolloutReady = rolloutReport?.rolloutVersion === BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_VERSION &&
    [
      BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.active,
      BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.completed,
      BOND_ORIGINATOR_MULTI_ORIGINATOR_ROLLOUT_STATUSES.ready,
    ].includes(rolloutStatus)
  const automationDisabled = formalControls.liveDeliveryEnabled !== true &&
    formalControls.automaticBankSubmission !== true &&
    formalControls.bankWorkflowMutation !== true &&
    formalControls.offerWorkflowMutation !== true &&
    formalControls.grantWorkflowMutation !== true
  const checks = [
    buildFormalIntegrationCheck({
      key: 'r8_rollout_ready',
      label: 'Controlled R8 rollout is ready',
      passed: rolloutReady,
      evidence: { rolloutVersion: rolloutReport?.rolloutVersion || null, rolloutStatus },
      message: 'Complete a controlled R8 rollout before preparing optional formal integrations.',
    }),
    buildFormalIntegrationCheck({
      key: 'recipient_identified',
      label: 'Recipient integration identified',
      passed: Boolean(destinationKey),
      evidence: { destinationKey, destinationLabel, recipientProfileKey: normalizeText(recipientProfileKey) || null },
      message: 'Identify the formal recipient, such as OOBA or a specific approved originator integration.',
    }),
    buildFormalIntegrationCheck({
      key: 'official_specification_contract_complete',
      label: 'Official specification contract complete',
      passed: missingEvidence.length === 0,
      evidence: { supplied: evidence, missing: missingEvidence },
      message: 'Approved schema, enum map, validation rules, transport policy, credentials and acknowledgement/status contracts are required.',
    }),
    buildFormalIntegrationCheck({
      key: 'adapter_contract_matches_repository',
      label: 'Adapter contract matches repository readiness',
      passed: recipientAdapter?.enabled !== true || recipientAdapter?.officialSpecificationAvailable === true,
      evidence: {
        adapterVersion: recipientAdapter?.adapterVersion || null,
        enabled: recipientAdapter?.enabled === true,
        officialSpecificationAvailable: recipientAdapter?.officialSpecificationAvailable === true,
      },
      message: 'An enabled adapter must be backed by approved repository specifications.',
    }),
    buildFormalIntegrationCheck({
      key: 'sandbox_only_release',
      label: 'Sandbox-only release mode confirmed',
      passed: formalControls.sandboxOnly === true || formalControls.sandbox_only === true,
      evidence: { sandboxOnly: formalControls.sandboxOnly === true || formalControls.sandbox_only === true },
      message: 'R9 can prepare sandbox integration governance only; production live delivery remains a later decision.',
    }),
    buildFormalIntegrationCheck({
      key: 'integration_owners_defined',
      label: 'Integration owners defined',
      passed: Boolean(formalControls.technicalOwner || formalControls.technical_owner) &&
        Boolean(formalControls.businessOwner || formalControls.business_owner) &&
        Boolean(formalControls.rollbackOwner || formalControls.rollback_owner),
      evidence: {
        technicalOwner: formalControls.technicalOwner || formalControls.technical_owner || null,
        businessOwner: formalControls.businessOwner || formalControls.business_owner || null,
        rollbackOwner: formalControls.rollbackOwner || formalControls.rollback_owner || null,
      },
      message: 'Name technical, business and rollback owners before sandbox activation.',
    }),
    buildFormalIntegrationCheck({
      key: 'automation_boundary_intact',
      label: 'Automation boundary intact',
      passed: automationDisabled,
      evidence: {
        liveDeliveryEnabled: formalControls.liveDeliveryEnabled === true,
        automaticBankSubmission: formalControls.automaticBankSubmission === true,
        bankWorkflowMutation: formalControls.bankWorkflowMutation === true,
        offerWorkflowMutation: formalControls.offerWorkflowMutation === true,
        grantWorkflowMutation: formalControls.grantWorkflowMutation === true,
      },
      message: 'R9 readiness must not enable live delivery, automatic bank submission or workflow mutation.',
    }),
  ]
  const issues = readinessIssuesFromChecks(checks)
  const status = issues.length
    ? BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.blocked
    : BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.readyForSandbox
  return {
    formalIntegrationVersion: BOND_ORIGINATOR_FORMAL_INTEGRATION_VERSION,
    status,
    generatedAt,
    generatedBy,
    destination: {
      key: destinationKey || null,
      label: destinationLabel,
      type: recipientAdapter?.destinationType || integrationContract.destinationType || integrationContract.destination_type || 'bond_originator',
      adapterVersion: recipientAdapter?.adapterVersion || null,
      recipientProfileKey: normalizeText(recipientProfileKey) || null,
    },
    scope: {
      rolloutVersion: rolloutReport?.rolloutVersion || null,
      rolloutStatus,
      sandboxOnly: true,
      productionLiveDelivery: false,
    },
    evidenceSummary: evidence,
    missingEvidence,
    checklist: checks,
    summary: {
      totalChecks: checks.length,
      passed: checks.filter((check) => check.status === 'passed').length,
      blocked: checks.filter((check) => check.status === 'blocked').length,
      missingEvidenceCount: missingEvidence.length,
    },
    issues,
    nextActions: issues.length
      ? issues.map((issue) => issue.message)
      : ['Prepare a sandbox-only formal integration activation plan. Production delivery remains disabled until separately approved.'],
    integrationBoundary: {
      phase: 'R9',
      optionalFormalIntegration: true,
      sandboxOnly: true,
      productionLiveDelivery: false,
      arch9FacilitatesOnly: true,
      originatorProcessesExternally: true,
      automaticBankSubmission: false,
      liveOobaDelivery: false,
      liveBankDelivery: false,
      bankWorkflowMutation: false,
      offerWorkflowMutation: false,
      grantWorkflowMutation: false,
    },
    sensitivePayloadIncluded: false,
    credentialsIncluded: false,
    rawSchemaIncluded: false,
    noAutomaticBankSubmission: true,
    liveDeliveryEnabled: false,
    bankWorkflowUnchanged: true,
    offerWorkflowMutationDeferred: true,
    grantWorkflowMutationDeferred: true,
  }
}

export function buildBondOriginatorFormalIntegrationActivationPlan({
  readinessReport = {},
  activatedBy = null,
  activatedAt = new Date().toISOString(),
} = {}) {
  if (readinessReport?.formalIntegrationVersion !== BOND_ORIGINATOR_FORMAL_INTEGRATION_VERSION) {
    return { ok: false, reason: 'formal_integration_readiness_report_required', activationPlan: null }
  }
  if (readinessReport.status !== BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.readyForSandbox) {
    return { ok: false, reason: 'formal_integration_not_ready_for_sandbox', activationPlan: null, issues: normalizeList(readinessReport.issues) }
  }
  return {
    ok: true,
    activationPlan: {
      formalIntegrationVersion: BOND_ORIGINATOR_FORMAL_INTEGRATION_VERSION,
      status: BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.sandboxActive,
      activatedAt,
      activatedBy,
      destination: readinessReport.destination,
      mode: 'sandbox_only',
      allowedActions: {
        canRunSandboxValidation: true,
        canGenerateProductionPayload: false,
        canEnableLiveDelivery: false,
        canAutoSubmitToBank: false,
        canMutateBankWorkflow: false,
      },
      requiredOperatorReview: [
        'Validate sandbox payloads against the approved recipient schema.',
        'Validate acknowledgement and status contract handling in sandbox.',
        'Confirm no production credentials or live transport are used.',
      ],
      rollback: {
        canPauseSandbox: true,
        revokeSandboxCredentialsOnly: true,
        preserveAuditHistory: true,
        doNotMutateBankWorkflow: true,
      },
      integrationBoundary: readinessReport.integrationBoundary,
    },
    event: {
      eventType: 'bond_originator_formal_integration_sandbox_activated',
      actorId: activatedBy,
      occurredAt: activatedAt,
      sensitivePayloadIncluded: false,
      credentialsIncluded: false,
      bankWorkflowUnchanged: true,
    },
  }
}

export function buildBondOriginatorFormalIntegrationViewModel({ readinessReport = null, activationPlan = null } = {}) {
  const report = readinessReport?.formalIntegrationVersion === BOND_ORIGINATOR_FORMAL_INTEGRATION_VERSION ? readinessReport : null
  const status = activationPlan?.status || report?.status || BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.blocked
  return {
    available: Boolean(report),
    formalIntegrationVersion: BOND_ORIGINATOR_FORMAL_INTEGRATION_VERSION,
    status,
    statusLabel: {
      [BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.blocked]: 'Formal integration blocked',
      [BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.readyForSandbox]: 'Ready for sandbox review',
      [BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.sandboxActive]: 'Sandbox active',
      [BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.paused]: 'Sandbox paused',
      [BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.retired]: 'Integration retired',
    }[status] || 'Formal integration status',
    destination: report?.destination || null,
    cards: [
      { key: 'evidence', label: 'Required evidence', value: `${report?.summary?.passed || 0}/${report?.summary?.totalChecks || 0}`, detail: `${report?.summary?.missingEvidenceCount || 0} missing` },
      { key: 'mode', label: 'Mode', value: activationPlan ? 'Sandbox' : 'Readiness', detail: 'Production delivery disabled' },
      { key: 'workflow', label: 'Workflow boundary', value: 'Unchanged', detail: 'No automatic bank submission' },
    ],
    checklist: normalizeList(report?.checklist).map((check) => ({
      key: check.key,
      label: check.label,
      status: check.status,
      message: check.message,
    })),
    nextActions: activationPlan
      ? normalizeList(activationPlan.requiredOperatorReview)
      : normalizeList(report?.nextActions),
    actions: {
      canActivateSandbox: report?.status === BOND_ORIGINATOR_FORMAL_INTEGRATION_STATUSES.readyForSandbox && !activationPlan,
      canRunSandboxValidation: Boolean(activationPlan),
      canGenerateProductionPayload: false,
      canEnableLiveDelivery: false,
      canAutoSubmitToBank: false,
      canMutateBankWorkflow: false,
      canChangeOfferWorkflow: false,
      canChangeGrantWorkflow: false,
    },
    integrationBoundary: report?.integrationBoundary || {
      sandboxOnly: true,
      productionLiveDelivery: false,
      automaticBankSubmission: false,
      bankWorkflowMutation: false,
    },
    payloadsExcluded: true,
    tokensExcluded: true,
    credentialsExcluded: true,
    rawSchemasExcluded: true,
    publicDocumentUrlsExcluded: true,
  }
}

export async function prepareBondApplicationExportPackage({
  submission = {},
  normalizedApplication = null,
  destinationKey = 'ooba',
  expectedSnapshotHash = null,
  supplementalDocuments = [],
  packageDocuments = [],
  requestedBy = null,
  idempotencyKey = null,
  existingPackage = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (existingPackage?.idempotencyKey && idempotencyKey && existingPackage.idempotencyKey === idempotencyKey) {
    return { ok: true, package: clone(existingPackage), idempotent: true }
  }

  const adapter = getBondApplicationDestinationAdapter(destinationKey)
  const canonicalExport = buildCanonicalBondApplicationExport({
    submission,
    normalizedApplication,
    supplementalDocuments,
    packageDocuments,
    generatedAt,
  })
  const canonicalHash = await hashCanonicalBondApplicationExport(canonicalExport)
  const canonicalValidation = validateCanonicalBondApplicationExport(canonicalExport)
  const eligibility = await validateBondApplicationExportEligibility({
    submission,
    normalizedApplication,
    destinationAdapter: adapter,
    expectedSnapshotHash,
  })
  const adapterValidation = adapter.validateCanonicalSource(canonicalExport)
  const mapping = adapter.mapCanonicalToDestination(canonicalExport)
  const destinationValidation = adapter.validateDestinationPayload(mapping.payload)
  const serialization = adapter.serializePayload(mapping.payload)
  const issues = [
    ...canonicalValidation.issues,
    ...eligibility.issues,
    ...adapterValidation.issues,
    ...mapping.issues,
    ...destinationValidation.issues,
    ...serialization.issues,
  ]
  const packageStatus = hasBlockingIssue(issues)
    ? BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.validationFailed
    : BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.readyForReview

  return {
    ok: packageStatus !== BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.validationFailed,
    package: {
      schemaVersion: BOND_APPLICATION_EXPORT_PACKAGE_SCHEMA_VERSION,
      id: null,
      idempotencyKey: idempotencyKey || null,
      transactionId: submission.transaction_id || submission.transactionId || canonicalExport.source.transactionId || null,
      bondApplicationId: canonicalExport.source.bondApplicationId || null,
      submissionId: submission.id || canonicalExport.source.submissionId || null,
      destinationKey: adapter.destinationKey,
      destinationType: adapter.destinationType,
      adapterVersion: adapter.adapterVersion,
      status: packageStatus,
      sourceSnapshotHash: canonicalExport.source.snapshotHash,
      canonicalHash,
      payloadHash: serialization.ok ? await hashCanonicalBondApplicationExport(mapping.payload) : null,
      canonicalExport,
      destinationPayload: serialization.ok ? mapping.payload : null,
      serializedPayload: serialization.ok ? serialization.body : null,
      contentType: serialization.contentType || null,
      validationIssues: issues,
      mappingCoverage: buildBondApplicationMappingCoverageReport(adapter),
      documentManifest: canonicalExport.documents,
      operationalContext: safeOperationalContext({ requestedBy, deliveryMode: serialization.ok ? BOND_APPLICATION_DELIVERY_METHODS.secureExport : 'blocked' }),
      createdAt: generatedAt,
      approvedAt: null,
      approvedBy: null,
      deliveredAt: null,
      supersededAt: null,
    },
  }
}

export async function prepareBondOriginatorIntakePackage({
  submission = {},
  normalizedApplication = null,
  originatorRecipient = {},
  supplementalDocuments = [],
  packageDocuments = [],
  requestedBy = null,
  idempotencyKey = null,
  existingPackage = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  if (existingPackage?.idempotencyKey && idempotencyKey && existingPackage.idempotencyKey === idempotencyKey) {
    return { ok: true, package: clone(existingPackage), idempotent: true }
  }
  const canonicalExport = buildCanonicalBondApplicationExport({
    submission,
    normalizedApplication,
    supplementalDocuments,
    packageDocuments,
    generatedAt,
  })
  const canonicalHash = await hashCanonicalBondApplicationExport(canonicalExport)
  const canonicalValidation = validateCanonicalBondApplicationExport(canonicalExport)
  const eligibility = await validateBondApplicationExportEligibility({
    submission,
    normalizedApplication,
  })
  const issues = [...canonicalValidation.issues, ...eligibility.issues]
  const documentBundleManifest = buildOriginatorDocumentBundleManifest(canonicalExport)
  const ok = !hasSubmittedSnapshotIssue(issues)
  return {
    ok,
    package: {
      schemaVersion: BOND_APPLICATION_EXPORT_PACKAGE_SCHEMA_VERSION,
      id: null,
      idempotencyKey: idempotencyKey || null,
      transactionId: submission.transaction_id || submission.transactionId || canonicalExport.source.transactionId || null,
      bondApplicationId: canonicalExport.source.bondApplicationId || null,
      submissionId: submission.id || canonicalExport.source.submissionId || null,
      destinationKey: BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY,
      destinationType: 'bond_originator',
      adapterVersion: BOND_APPLICATION_ORIGINATOR_INTAKE_ADAPTER_VERSION,
      status: ok
        ? BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.readyForOriginator
        : BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.validationFailed,
      sourceSnapshotHash: canonicalExport.source.snapshotHash,
      canonicalHash,
      payloadHash: null,
      canonicalExport,
      destinationPayload: null,
      serializedPayload: null,
      contentType: null,
      validationIssues: issues,
      mappingCoverage: {
        destinationKey: BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY,
        adapterVersion: BOND_APPLICATION_ORIGINATOR_INTAKE_ADAPTER_VERSION,
        officialSpecificationAvailable: true,
        mappedSourceGroups: ['source', 'application', 'participants', 'documents', 'declarations', 'signerManifest'],
        unmappedSourceGroups: [],
        blockers: [],
      },
      documentManifest: canonicalExport.documents,
      documentBundleManifest,
      operationalContext: safeOperationalContext({
        requestedBy,
        requestedByRole: 'originator_intake',
        deliveryMode: 'originator_download',
      }),
      originatorRecipient: {
        id: originatorRecipient.id || originatorRecipient.profileId || originatorRecipient.userId || null,
        name: originatorRecipient.name || originatorRecipient.displayName || originatorRecipient.organisationName || '',
        emailReference: originatorRecipient.emailReference || null,
      },
      participantSummary: countParticipantsByRole(canonicalExport),
      packageReadyAt: ok ? generatedAt : null,
      acceptedAt: null,
      acceptedBy: null,
      downloadCount: 0,
      lastDownloadedAt: null,
      lastDownloadedBy: null,
      createdAt: generatedAt,
      approvedAt: null,
      approvedBy: null,
      deliveredAt: null,
      supersededAt: null,
    },
  }
}

export function acceptBondOriginatorIntakePackage({
  exportPackage = {},
  acceptedBy = null,
  acceptedAt = new Date().toISOString(),
} = {}) {
  if (exportPackage.destinationKey !== BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY) {
    return { ok: false, reason: 'not_originator_intake_package', package: exportPackage }
  }
  if (exportPackage.status === BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator ||
      exportPackage.status === BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded) {
    return { ok: true, package: exportPackage, idempotent: true }
  }
  if (exportPackage.status !== BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.readyForOriginator) {
    return { ok: false, reason: 'package_not_ready_for_originator', package: exportPackage }
  }
  return {
    ok: true,
    package: {
      ...exportPackage,
      status: BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator,
      acceptedBy,
      acceptedAt,
      operationalContext: {
        ...(exportPackage.operationalContext || {}),
        originatorAccepted: true,
        noAutomaticBankSubmission: true,
      },
    },
    event: {
      eventType: 'bond_originator_intake_package_accepted',
      exportPackageId: exportPackage.id || null,
      transactionId: exportPackage.transactionId || null,
      actorId: acceptedBy,
      occurredAt: acceptedAt,
      sensitivePayloadIncluded: false,
    },
  }
}

export function recordBondOriginatorPackageDownload({
  exportPackage = {},
  downloadedBy = null,
  downloadedAt = new Date().toISOString(),
  documentIds = [],
  idempotencyKey = null,
} = {}) {
  if (![BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator, BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded].includes(exportPackage.status)) {
    return { ok: false, reason: 'originator_package_not_accepted', package: exportPackage }
  }
  const safeDocumentIds = Array.isArray(documentIds) ? documentIds.filter(Boolean) : []
  return {
    ok: true,
    attempt: {
      exportPackageId: exportPackage.id || null,
      idempotencyKey: idempotencyKey || null,
      deliveryMethod: 'originator_package_download',
      status: BOND_APPLICATION_DELIVERY_ATTEMPT_STATUSES.confirmed,
      externalReference: null,
      attemptedBy: downloadedBy,
      attemptedAt: downloadedAt,
      completedAt: downloadedAt,
      responseSummary: {
        documentCount: safeDocumentIds.length,
        downloadedDocumentIds: safeDocumentIds,
      },
      rawResponseStored: false,
      bankWorkflowUpdateDeferred: true,
    },
    package: {
      ...exportPackage,
      status: BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded,
      downloadCount: Math.max(Number(exportPackage.downloadCount || 0), 0) + 1,
      lastDownloadedAt: downloadedAt,
      lastDownloadedBy: downloadedBy,
      operationalContext: {
        ...(exportPackage.operationalContext || {}),
        lastAction: 'originator_package_downloaded',
        noAutomaticBankSubmission: true,
      },
    },
    event: {
      eventType: 'bond_originator_intake_package_downloaded',
      exportPackageId: exportPackage.id || null,
      transactionId: exportPackage.transactionId || null,
      actorId: downloadedBy,
      occurredAt: downloadedAt,
      documentCount: safeDocumentIds.length,
      sensitivePayloadIncluded: false,
    },
  }
}

export function buildBondOriginatorIntakePackageViewModel({ exportPackage = {} } = {}) {
  const bundle = exportPackage.documentBundleManifest || buildOriginatorDocumentBundleManifest(exportPackage.canonicalExport || {})
  const status = exportPackage.status || 'draft'
  const documentRequestSummary = exportPackage.documentRequestSummary ||
    buildBondOriginatorDocumentRequestSummary(exportPackage.documentRequests || [])
  const progressTimeline = exportPackage.progressTimeline ||
    buildBondOriginatorProgressTimeline({ exportPackage })
  const offerGrantSummary = exportPackage.offerGrantSummary ||
    buildBondOriginatorOfferGrantSummary({
      offerCaptures: exportPackage.offerCaptures || [],
      grantCaptures: exportPackage.grantCaptures || [],
    })
  const labels = {
    ready_for_originator: 'Package ready',
    accepted_by_originator: 'Accepted by originator',
    downloaded: 'Downloaded by originator',
    validation_failed: 'Needs attention',
    superseded: 'Superseded',
    cancelled: 'Cancelled',
  }
  return {
    id: exportPackage.id || null,
    transactionId: exportPackage.transactionId || null,
    submissionId: exportPackage.submissionId || null,
    status,
    statusLabel: labels[status] || 'Preparing',
    recipientName: exportPackage.originatorRecipient?.name || 'Bond originator',
    packageReadyAt: exportPackage.packageReadyAt || exportPackage.createdAt || null,
    acceptedAt: exportPackage.acceptedAt || null,
    lastDownloadedAt: exportPackage.lastDownloadedAt || null,
    downloadCount: Number(exportPackage.downloadCount || 0),
    participantSummary: exportPackage.participantSummary || countParticipantsByRole(exportPackage.canonicalExport || {}),
    documentCounts: {
      signedApplicationDocuments: bundle.packageDocumentCount || 0,
      supportingDocuments: bundle.supportingDocuments?.length || 0,
      participantDocuments: bundle.participantDocumentCount || 0,
      sharedDocuments: bundle.sharedDocumentCount || 0,
      total: bundle.totalDocumentCount || 0,
    },
    documentRequestSummary,
    progressSummary: progressTimeline.summary,
    progressTimeline,
    offerGrantSummary,
    actions: {
      canAccept: status === BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.readyForOriginator,
      canDownload: [
        BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator,
        BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded,
      ].includes(status),
      canRequestMoreDocuments: [
        BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.acceptedByOriginator,
        BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.downloaded,
      ].includes(status),
    },
    bankWorkflowUnchanged: true,
  }
}

function sanitizeOriginatorWorkspaceDocument(document = {}, documentRole = 'supporting_document') {
  return {
    documentId: document.matchedDocumentId || document.documentId || document.id || null,
    documentRole,
    participantKey: document.participantKey || null,
    participantRole: document.participantRole || null,
    requirementKey: document.requirementKey || null,
    canonicalDocumentType: document.canonicalDocumentType || document.documentType || null,
    status: document.status || document.reviewStatus || null,
  }
}

function buildOriginatorWorkspaceDocumentList(exportPackage = {}) {
  const bundle = exportPackage.documentBundleManifest || buildOriginatorDocumentBundleManifest(exportPackage.canonicalExport || {})
  const signed = Array.isArray(bundle.signedApplicationDocuments) ? bundle.signedApplicationDocuments : []
  const supporting = Array.isArray(bundle.supportingDocuments) ? bundle.supportingDocuments : []
  return [
    ...signed.map((document) => sanitizeOriginatorWorkspaceDocument(document, 'signed_application_document')),
    ...supporting.map((document) => sanitizeOriginatorWorkspaceDocument(document, 'supporting_document')),
  ].filter((document) => document.documentId || document.requirementKey || document.canonicalDocumentType)
}

function normalizeOriginatorWorkspacePackage(rawPackage = {}) {
  if (!rawPackage || typeof rawPackage !== 'object') return null
  const id = rawPackage.id || rawPackage.exportPackageId || rawPackage.export_package_id || null
  const transactionId = rawPackage.transactionId || rawPackage.transaction_id || null
  const status = rawPackage.status || rawPackage.packageStatus || rawPackage.package_status || BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.draft
  if (!id && !transactionId) return null
  return {
    ...rawPackage,
    id,
    transactionId,
    bondApplicationId: rawPackage.bondApplicationId || rawPackage.bond_application_id || null,
    submissionId: rawPackage.submissionId || rawPackage.submission_id || null,
    destinationKey: rawPackage.destinationKey || rawPackage.destination_key || BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY,
    status,
    originatorRecipient: {
      id:
        rawPackage.originatorRecipient?.id ||
        rawPackage.originatorRecipientId ||
        rawPackage.originator_recipient_id ||
        rawPackage.assignment?.originatorProfileId ||
        rawPackage.assignedToProfileId ||
        rawPackage.assigned_to_profile_id ||
        null,
      name:
        rawPackage.originatorRecipient?.name ||
        rawPackage.originatorRecipientName ||
        rawPackage.originator_recipient_name ||
        rawPackage.recipientName ||
        'Bond originator',
      emailReference:
        rawPackage.originatorRecipient?.emailReference ||
        rawPackage.originatorRecipientEmailReference ||
        rawPackage.assigned_to_email_reference ||
        null,
    },
    packageReadyAt: rawPackage.packageReadyAt || rawPackage.package_ready_at || rawPackage.createdAt || rawPackage.created_at || null,
    acceptedAt: rawPackage.acceptedAt || rawPackage.accepted_at || null,
    acceptedBy: rawPackage.acceptedBy || rawPackage.accepted_by || null,
    downloadCount: Number(rawPackage.downloadCount ?? rawPackage.download_count ?? 0) || 0,
    lastDownloadedAt: rawPackage.lastDownloadedAt || rawPackage.last_downloaded_at || null,
    lastDownloadedBy: rawPackage.lastDownloadedBy || rawPackage.last_downloaded_by || null,
    documentBundleManifest: rawPackage.documentBundleManifest || rawPackage.document_bundle_manifest_json || rawPackage.document_bundle_manifest || null,
    documentRequests: rawPackage.documentRequests || rawPackage.document_requests || [],
    progressEvents: rawPackage.progressEvents || rawPackage.progress_events || [],
    offerCaptures: rawPackage.offerCaptures || rawPackage.offer_captures || [],
    grantCaptures: rawPackage.grantCaptures || rawPackage.grant_captures || [],
    assignment: {
      id: rawPackage.assignment?.id || rawPackage.workspaceAssignmentId || rawPackage.workspace_assignment_id || null,
      status: rawPackage.assignment?.status || rawPackage.assignmentStatus || rawPackage.assignment_status || BOND_ORIGINATOR_WORKSPACE_ASSIGNMENT_STATUSES.assigned,
      assignedToProfileId:
        rawPackage.assignment?.assignedToProfileId ||
        rawPackage.assignedToProfileId ||
        rawPackage.assigned_to_profile_id ||
        null,
      assignedAt: rawPackage.assignment?.assignedAt || rawPackage.assignedAt || rawPackage.assigned_at || null,
      acceptedAt: rawPackage.assignment?.acceptedAt || rawPackage.assignmentAcceptedAt || rawPackage.assignment_accepted_at || null,
    },
  }
}

function buildOriginatorWorkspaceActions(exportPackage = {}) {
  const packageView = buildBondOriginatorIntakePackageViewModel({ exportPackage })
  return {
    canAccept: packageView.actions.canAccept,
    canDownload: packageView.actions.canDownload,
    canRequestDocuments: packageView.actions.canRequestMoreDocuments,
    canRecordProgress: canRecordOriginatorProgress(exportPackage),
    canCaptureOffersAndGrants: canCaptureOriginatorOfferOrGrant(exportPackage),
    canLiveDeliver: false,
    canMutateBankWorkflow: false,
    canAutoSubmitToBank: false,
  }
}

function buildOriginatorWorkspaceNextActions({ exportPackage = {}, documentRequestSummary = {}, offerGrantSummary = {} } = {}) {
  const actions = buildOriginatorWorkspaceActions(exportPackage)
  const nextActions = []
  if (actions.canAccept) nextActions.push('Accept the application package for processing.')
  if (actions.canDownload && !exportPackage.lastDownloadedAt) nextActions.push('Download the signed application and supporting documents.')
  if (documentRequestSummary.open > 0) nextActions.push('Follow up on open document requests.')
  if (documentRequestSummary.awaitingReview > 0) nextActions.push('Review uploaded requested documents.')
  if (actions.canCaptureOffersAndGrants && !offerGrantSummary.offerCount) nextActions.push('Capture bank offers received from originator processing.')
  if (offerGrantSummary.acceptedOfferCount > 0 && !offerGrantSummary.grantCount) nextActions.push('Capture the bond grant when received.')
  if (!nextActions.length) nextActions.push('Continue external originator processing and record safe progress updates.')
  return nextActions
}

export function filterBondOriginatorWorkspacePackagesForViewer({
  packages = [],
  viewerOriginatorId = null,
  internal = false,
} = {}) {
  const normalized = (Array.isArray(packages) ? packages : [])
    .map(normalizeOriginatorWorkspacePackage)
    .filter(Boolean)
  if (internal) return normalized
  const viewerId = normalizeText(viewerOriginatorId)
  if (!viewerId) return []
  return normalized.filter((item) => {
    const assignedId = normalizeText(item.assignment?.assignedToProfileId || item.originatorRecipient?.id)
    return assignedId === viewerId
  })
}

export function buildBondOriginatorWorkspacePackageSummary({
  exportPackage = {},
  recipientFormatPackages = [],
  governanceReport = null,
  readinessReport = null,
} = {}) {
  const normalizedPackage = normalizeOriginatorWorkspacePackage(exportPackage)
  if (!normalizedPackage) {
    return {
      available: false,
      statusLabel: 'No originator package',
      actions: buildOriginatorWorkspaceActions({}),
      bankWorkflowUnchanged: true,
    }
  }
  const packageView = buildBondOriginatorIntakePackageViewModel({ exportPackage: normalizedPackage })
  const documentRequestSummary = buildBondOriginatorDocumentRequestSummary(normalizedPackage.documentRequests)
  const progressTimeline = buildBondOriginatorProgressTimeline({
    exportPackage: normalizedPackage,
    progressEvents: normalizedPackage.progressEvents,
    documentRequests: normalizedPackage.documentRequests,
  })
  const offerGrantSummary = buildBondOriginatorOfferGrantSummary({
    offerCaptures: normalizedPackage.offerCaptures,
    grantCaptures: normalizedPackage.grantCaptures,
  })
  const actions = buildOriginatorWorkspaceActions(normalizedPackage)
  return {
    available: true,
    workspaceVersion: BOND_ORIGINATOR_WORKSPACE_MVP_VERSION,
    id: normalizedPackage.id,
    transactionId: normalizedPackage.transactionId,
    submissionId: normalizedPackage.submissionId,
    status: normalizedPackage.status,
    statusLabel: packageView.statusLabel,
    recipientName: packageView.recipientName,
    assignment: normalizedPackage.assignment,
    packageReadyAt: normalizedPackage.packageReadyAt,
    acceptedAt: normalizedPackage.acceptedAt,
    lastDownloadedAt: normalizedPackage.lastDownloadedAt,
    downloadCount: normalizedPackage.downloadCount,
    participantSummary: packageView.participantSummary,
    documentCounts: packageView.documentCounts,
    documentRequestSummary,
    progressSummary: progressTimeline.summary,
    offerGrantSummary,
    recipientFormatSummary: (Array.isArray(recipientFormatPackages) ? recipientFormatPackages : []).map((formatPackage) => ({
      id: formatPackage.id || null,
      recipientProfileKey: formatPackage.recipientProfileKey || formatPackage.recipient_profile_key || null,
      label: formatPackage.label || formatPackage.profileLabel || formatPackage.profile_label || null,
      status: formatPackage.status || null,
      generatedAt: formatPackage.generatedAt || formatPackage.generated_at || null,
      manualDownloadOnly: formatPackage.manualDownloadOnly !== false && formatPackage.manual_download_only !== false,
      liveDeliveryEnabled: false,
    })),
    governanceStatus: governanceReport?.status || null,
    readinessStatus: readinessReport?.status || null,
    nextActions: buildOriginatorWorkspaceNextActions({
      exportPackage: normalizedPackage,
      documentRequestSummary,
      offerGrantSummary,
    }),
    actions,
    workflowBoundary: {
      arch9FacilitatesOnly: true,
      originatorProcessesExternally: true,
      noAutomaticBankSubmission: true,
      noLiveOobaDelivery: true,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
    },
  }
}

export function buildBondOriginatorWorkspacePackageDetailViewModel({
  exportPackage = {},
  recipientFormatPackages = [],
  governanceReport = null,
  readinessReport = null,
  documentRequests = null,
  progressEvents = null,
  offerCaptures = null,
  grantCaptures = null,
} = {}) {
  const normalizedPackage = normalizeOriginatorWorkspacePackage({
    ...exportPackage,
    documentRequests: documentRequests || exportPackage.documentRequests,
    progressEvents: progressEvents || exportPackage.progressEvents,
    offerCaptures: offerCaptures || exportPackage.offerCaptures,
    grantCaptures: grantCaptures || exportPackage.grantCaptures,
  })
  if (!normalizedPackage) {
    return {
      available: false,
      statusLabel: 'No originator package',
      actions: buildOriginatorWorkspaceActions({}),
      bankWorkflowUnchanged: true,
    }
  }
  const summary = buildBondOriginatorWorkspacePackageSummary({
    exportPackage: normalizedPackage,
    recipientFormatPackages,
    governanceReport,
    readinessReport,
  })
  const progressTimeline = filterBondOriginatorProgressForViewer({
    timeline: buildBondOriginatorProgressTimeline({
      exportPackage: normalizedPackage,
      progressEvents: normalizedPackage.progressEvents,
      documentRequests: normalizedPackage.documentRequests,
    }),
    viewer: 'originator',
  })
  return {
    ...summary,
    documents: buildOriginatorWorkspaceDocumentList(normalizedPackage),
    documentRequests: filterBondOriginatorDocumentRequestsForViewer({
      requests: normalizedPackage.documentRequests,
      internal: true,
    }).map((request) => ({
      id: request.id || null,
      status: request.status || null,
      requestType: request.requestType || null,
      targetScope: request.targetScope || null,
      participantKey: request.participantKey || null,
      participantRole: request.participantRole || null,
      requirementKey: request.requirementKey || null,
      canonicalDocumentType: request.canonicalDocumentType || null,
      title: request.title || null,
      buyerInstruction: request.buyerInstruction || null,
      dueAt: request.dueAt || null,
      linkedDocumentId: request.linkedDocumentId || null,
      requiresNewSubmission: false,
      bankWorkflowUnchanged: true,
    })),
    progressTimeline,
    offerGrantWorkspace: {
      offers: normalizedPackage.offerCaptures.map((offer) => ({
        id: offer.id || null,
        status: offer.status || null,
        bankName: offer.bankName || null,
        offeredAmount: offer.offeredAmount || null,
        capturedAt: offer.capturedAt || null,
        publishedAt: offer.publishedAt || null,
        buyerDecision: offer.buyerDecision || null,
        createsBankApplication: false,
        bankWorkflowUnchanged: true,
      })),
      grants: normalizedPackage.grantCaptures.map((grant) => ({
        id: grant.id || null,
        status: grant.status || null,
        bankName: grant.bankName || null,
        approvedAmount: grant.approvedAmount || null,
        capturedAt: grant.capturedAt || null,
        publishedAt: grant.publishedAt || null,
        signedGrantDocumentId: grant.signedGrantDocumentId || null,
        createsBankApplication: false,
        bankWorkflowUnchanged: true,
      })),
    },
    payloadsExcluded: true,
    tokensExcluded: true,
    publicDocumentUrlsExcluded: true,
    bankWorkflowUnchanged: true,
  }
}

export function buildBondOriginatorWorkspaceMvpViewModel({
  packages = [],
  viewerOriginatorId = null,
  internal = false,
  selectedPackageId = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const visiblePackages = filterBondOriginatorWorkspacePackagesForViewer({
    packages,
    viewerOriginatorId,
    internal,
  })
  const packageSummaries = visiblePackages.map((exportPackage) =>
    buildBondOriginatorWorkspacePackageSummary({ exportPackage }))
  const selected = selectedPackageId
    ? visiblePackages.find((item) => item.id === selectedPackageId)
    : visiblePackages[0]
  return {
    available: true,
    workspaceVersion: BOND_ORIGINATOR_WORKSPACE_MVP_VERSION,
    generatedAt,
    packageCount: packageSummaries.length,
    packages: packageSummaries,
    selectedPackageId: selected?.id || null,
    emptyState: packageSummaries.length
      ? null
      : 'No assigned bond application packages are ready in this workspace.',
    actions: {
      canAcceptPackages: packageSummaries.some((item) => item.actions.canAccept),
      canDownloadPackages: packageSummaries.some((item) => item.actions.canDownload),
      canRequestDocuments: packageSummaries.some((item) => item.actions.canRequestDocuments),
      canRecordProgress: packageSummaries.some((item) => item.actions.canRecordProgress),
      canCaptureOffersAndGrants: packageSummaries.some((item) => item.actions.canCaptureOffersAndGrants),
      canLiveDeliver: false,
      canMutateBankWorkflow: false,
      canAutoSubmitToBank: false,
    },
    workflowBoundary: {
      arch9FacilitatesOnly: true,
      originatorProcessesExternally: true,
      noAutomaticBankSubmission: true,
      noLiveOobaDelivery: true,
      bankWorkflowUnchanged: true,
      offerWorkflowUnchanged: true,
      grantWorkflowUnchanged: true,
    },
  }
}

function numberFromSummary(summary = {}, key = '') {
  const value = summary?.[key]
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
}

function dateFromSummary(summary = {}, key = 'latestAt') {
  return summary?.[key] || summary?.latest_at || summary?.latestAt || null
}

function normalizeAgentProgressPackage(rawPackage = {}) {
  if (!rawPackage || typeof rawPackage !== 'object') return null
  const hasPackageSignal = Boolean(
    rawPackage.id ||
    rawPackage.transactionId ||
    rawPackage.transaction_id ||
    rawPackage.status ||
    rawPackage.packageReadyAt ||
    rawPackage.package_ready_at ||
    rawPackage.acceptedAt ||
    rawPackage.accepted_at ||
    rawPackage.progressEvents ||
    rawPackage.progress_events ||
    rawPackage.documentRequestSummary ||
    rawPackage.document_request_summary ||
    rawPackage.offerGrantSummary ||
    rawPackage.offer_grant_summary,
  )
  if (!hasPackageSignal) return null

  const progressEvents =
    rawPackage.progressEvents ||
    rawPackage.progress_events ||
    rawPackage.transaction_bond_originator_progress_events ||
    []
  const documentRequestSummary =
    rawPackage.documentRequestSummary ||
    rawPackage.document_request_summary ||
    rawPackage.document_request_summary_json ||
    {}
  const offerGrantSummary =
    rawPackage.offerGrantSummary ||
    rawPackage.offer_grant_summary ||
    rawPackage.offer_grant_summary_json ||
    {}

  return {
    id: rawPackage.id || null,
    transactionId: rawPackage.transactionId || rawPackage.transaction_id || null,
    submissionId: rawPackage.submissionId || rawPackage.submission_id || null,
    destinationKey: rawPackage.destinationKey || rawPackage.destination_key || BOND_APPLICATION_ORIGINATOR_INTAKE_DESTINATION_KEY,
    destinationType: rawPackage.destinationType || rawPackage.destination_type || 'bond_originator',
    status: rawPackage.status || BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.draft,
    originatorRecipient: {
      name:
        rawPackage.originatorRecipient?.name ||
        rawPackage.originator_recipient_name ||
        rawPackage.originatorRecipientName ||
        'Bond originator',
    },
    packageReadyAt: rawPackage.packageReadyAt || rawPackage.package_ready_at || rawPackage.createdAt || rawPackage.created_at || null,
    acceptedAt: rawPackage.acceptedAt || rawPackage.accepted_at || null,
    lastDownloadedAt: rawPackage.lastDownloadedAt || rawPackage.last_downloaded_at || null,
    downloadCount: Number(rawPackage.downloadCount ?? rawPackage.download_count ?? 0) || 0,
    progressEvents: Array.isArray(progressEvents) ? progressEvents : [],
    documentRequestSummary,
    offerGrantSummary,
    bankWorkflowUnchanged: rawPackage.bankWorkflowUnchanged !== false && rawPackage.bank_workflow_unchanged !== false,
    offerWorkflowMutationDeferred: rawPackage.offerWorkflowMutationDeferred !== false,
    grantWorkflowMutationDeferred: rawPackage.grantWorkflowMutationDeferred !== false,
  }
}

export function buildBondOriginatorAgentProgressViewModel({
  exportPackage = {},
  timeline = null,
} = {}) {
  const normalizedPackage = normalizeAgentProgressPackage(exportPackage)
  if (!normalizedPackage) {
    return {
      available: false,
      statusLabel: 'No originator package yet',
      headline: 'Bond originator progress is not available yet',
      summary: 'The signed buyer application has not been handed to a bond originator in Arch9 yet.',
      cards: [],
      events: [],
      nextActions: ['Wait for the bond application package to be prepared and accepted by the originator.'],
      trackingOnly: true,
      bankWorkflowUnchanged: true,
      offerWorkflowMutationDeferred: true,
      grantWorkflowMutationDeferred: true,
    }
  }

  const packageView = buildBondOriginatorIntakePackageViewModel({ exportPackage: normalizedPackage })
  const progressTimeline = timeline || buildBondOriginatorProgressTimeline({
    exportPackage: normalizedPackage,
    progressEvents: normalizedPackage.progressEvents,
  })
  const agentTimeline = filterBondOriginatorProgressForViewer({
    timeline: progressTimeline,
    viewer: 'agent',
  })
  const documentSummary = normalizedPackage.documentRequestSummary || {}
  const offersSummary = normalizedPackage.offerGrantSummary?.offers || normalizedPackage.offerGrantSummary?.offerSummary || {}
  const grantsSummary = normalizedPackage.offerGrantSummary?.grants || normalizedPackage.offerGrantSummary?.grantSummary || {}
  const latestAt = [
    agentTimeline.summary?.lastUpdatedAt,
    dateFromSummary(documentSummary),
    dateFromSummary(offersSummary),
    dateFromSummary(grantsSummary),
    normalizedPackage.lastDownloadedAt,
    normalizedPackage.acceptedAt,
    normalizedPackage.packageReadyAt,
  ].filter(Boolean).sort().at(-1) || null
  const openDocumentRequests = numberFromSummary(documentSummary, 'open')
  const awaitingReviewDocuments = numberFromSummary(documentSummary, 'awaitingReview')
  const publishedOffers = numberFromSummary(offersSummary, 'published')
  const acceptedOffers = numberFromSummary(offersSummary, 'accepted')
  const publishedGrants = numberFromSummary(grantsSummary, 'published')
  const signedGrants = numberFromSummary(grantsSummary, 'signed')
  const nextActions = []

  if (!normalizedPackage.acceptedAt) {
    nextActions.push('Waiting for the bond originator to accept the intake package.')
  }
  if (normalizedPackage.acceptedAt && !normalizedPackage.lastDownloadedAt) {
    nextActions.push('Waiting for the originator to download the signed application and supporting documents.')
  }
  if (openDocumentRequests > 0) {
    nextActions.push(`${openDocumentRequests} originator document request${openDocumentRequests === 1 ? '' : 's'} still need attention.`)
  }
  if (awaitingReviewDocuments > 0) {
    nextActions.push(`${awaitingReviewDocuments} uploaded document${awaitingReviewDocuments === 1 ? '' : 's'} waiting for originator review.`)
  }
  if (publishedOffers > 0 && acceptedOffers === 0) {
    nextActions.push('Published bank offers are available for the buyer to review.')
  }
  if (acceptedOffers > 0 && signedGrants === 0) {
    nextActions.push('Buyer accepted an offer; grant and signing evidence can be tracked when captured.')
  }
  if (!nextActions.length) {
    nextActions.push(agentTimeline.summary?.currentSummary || 'No agent action is needed right now.')
  }

  return {
    available: true,
    id: normalizedPackage.id,
    transactionId: normalizedPackage.transactionId,
    status: normalizedPackage.status,
    statusLabel: packageView.statusLabel,
    recipientName: packageView.recipientName,
    headline: agentTimeline.summary?.currentLabel || packageView.statusLabel,
    summary: agentTimeline.summary?.currentSummary || 'Originator progress is being tracked.',
    lastUpdatedAt: latestAt,
    cards: [
      {
        key: 'originator_package',
        label: 'Originator package',
        value: packageView.statusLabel,
        detail: normalizedPackage.lastDownloadedAt
          ? 'Downloaded by originator'
          : normalizedPackage.acceptedAt
            ? 'Accepted by originator'
            : 'Awaiting originator acceptance',
      },
      {
        key: 'document_requests',
        label: 'Document requests',
        value: `${openDocumentRequests} open`,
        detail: awaitingReviewDocuments
          ? `${awaitingReviewDocuments} awaiting review`
          : `${numberFromSummary(documentSummary, 'accepted')} accepted`,
      },
      {
        key: 'offers',
        label: 'Bank offers',
        value: `${publishedOffers} published`,
        detail: acceptedOffers ? `${acceptedOffers} accepted by buyer` : 'No accepted offer recorded',
      },
      {
        key: 'grants',
        label: 'Bond grants',
        value: `${publishedGrants} published`,
        detail: signedGrants ? `${signedGrants} signed grant record${signedGrants === 1 ? '' : 's'}` : 'No signed grant captured',
      },
    ],
    events: agentTimeline.events.slice(-6).reverse(),
    nextActions,
    trackingOnly: true,
    bankWorkflowUnchanged: true,
    offerWorkflowMutationDeferred: true,
    grantWorkflowMutationDeferred: true,
  }
}

export function approveBondApplicationExportPackage({
  exportPackage = {},
  approvedBy = null,
  approvedAt = new Date().toISOString(),
} = {}) {
  const issues = Array.isArray(exportPackage.validationIssues) ? exportPackage.validationIssues : []
  if (hasBlockingIssue(issues) || exportPackage.status === BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.validationFailed) {
    return {
      ok: false,
      reason: 'package_has_blocking_validation_issues',
      package: exportPackage,
    }
  }
  if (exportPackage.status === BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.approved) {
    return { ok: true, package: exportPackage, idempotent: true }
  }
  return {
    ok: true,
    package: {
      ...exportPackage,
      status: BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.approved,
      approvedBy,
      approvedAt,
    },
  }
}

export function recordBondApplicationDeliveryAttempt({
  exportPackage = {},
  deliveryMethod = BOND_APPLICATION_DELIVERY_METHODS.secureExport,
  status = BOND_APPLICATION_DELIVERY_ATTEMPT_STATUSES.queued,
  externalReference = null,
  attemptedBy = null,
  attemptedAt = new Date().toISOString(),
  response = null,
  idempotencyKey = null,
} = {}) {
  if (exportPackage.status !== BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.approved &&
      exportPackage.status !== BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.delivering) {
    return {
      ok: false,
      reason: 'export_package_not_approved',
      attempt: null,
    }
  }
  if (exportPackage.supersededAt || exportPackage.status === BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.superseded) {
    return {
      ok: false,
      reason: 'export_package_superseded',
      attempt: null,
    }
  }
  return {
    ok: true,
    attempt: {
      exportPackageId: exportPackage.id || null,
      idempotencyKey: idempotencyKey || null,
      deliveryMethod,
      status,
      externalReference: normalizeText(externalReference) || null,
      attemptedBy,
      attemptedAt,
      responseSummary: response ? {
        status: response.status || null,
        receivedAt: response.receivedAt || response.received_at || null,
      } : null,
      rawResponseStored: false,
      bankWorkflowUpdateDeferred: true,
    },
    package: {
      ...exportPackage,
      status: status === BOND_APPLICATION_DELIVERY_ATTEMPT_STATUSES.failed
        ? BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.deliveryFailed
        : BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.delivering,
    },
  }
}

export function confirmManualBondApplicationSubmission({
  exportPackage = {},
  externalReference = null,
  confirmedBy = null,
  confirmedAt = new Date().toISOString(),
} = {}) {
  if (![BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.approved, BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.delivering].includes(exportPackage.status)) {
    return { ok: false, reason: 'manual_confirmation_requires_approved_package' }
  }
  if (!normalizeText(externalReference)) {
    return { ok: false, reason: 'external_reference_required' }
  }
  return {
    ok: true,
    package: {
      ...exportPackage,
      status: BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.delivered,
      deliveredAt: confirmedAt,
    },
    deliveryAttempt: {
      exportPackageId: exportPackage.id || null,
      deliveryMethod: BOND_APPLICATION_DELIVERY_METHODS.manualConfirmation,
      status: BOND_APPLICATION_DELIVERY_ATTEMPT_STATUSES.confirmed,
      externalReference: normalizeText(externalReference),
      attemptedBy: confirmedBy,
      attemptedAt: confirmedAt,
      bankWorkflowUpdateDeferred: false,
      confirmationOnly: true,
    },
    bankWorkflowUpdateProposal: {
      action: 'record_manual_bank_submission_confirmation',
      transactionId: exportPackage.transactionId || null,
      destinationKey: exportPackage.destinationKey || null,
      externalReference: normalizeText(externalReference),
      confirmedBy,
      confirmedAt,
      requiresAuthorizedOriginatorReview: true,
    },
  }
}

export function supersedeBondApplicationExportPackage({
  exportPackage = {},
  supersededByPackageId = null,
  reason = 'newer_submission_version_prepared',
  supersededAt = new Date().toISOString(),
} = {}) {
  return {
    ...exportPackage,
    status: BOND_APPLICATION_EXPORT_PACKAGE_STATUSES.superseded,
    supersededByPackageId,
    supersededAt,
    supersessionReason: reason,
  }
}
