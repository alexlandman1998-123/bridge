import { isBondFinanceType as isCanonicalBondFinanceType } from './financeType'

export const BOND_INTAKE_STATUSES = Object.freeze({
  AWAITING_BUYER_APPLICATION: 'AWAITING_BUYER_APPLICATION',
  BUYER_IN_PROGRESS: 'BUYER_IN_PROGRESS',
  AWAITING_DOCUMENTS: 'AWAITING_DOCUMENTS',
  READY_FOR_REVIEW: 'READY_FOR_REVIEW',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  NOT_BOND_RELEVANT: 'NOT_BOND_RELEVANT',
})

export const BOND_APPLICATION_PROGRESS_STATUSES = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
})

export const BOND_INTAKE_STATUS_LABELS = Object.freeze({
  [BOND_INTAKE_STATUSES.AWAITING_BUYER_APPLICATION]: 'Awaiting buyer application',
  [BOND_INTAKE_STATUSES.BUYER_IN_PROGRESS]: 'Buyer in progress',
  [BOND_INTAKE_STATUSES.AWAITING_DOCUMENTS]: 'Awaiting documents',
  [BOND_INTAKE_STATUSES.READY_FOR_REVIEW]: 'Ready for review',
  [BOND_INTAKE_STATUSES.ACCEPTED]: 'Accepted',
  [BOND_INTAKE_STATUSES.DECLINED]: 'Declined',
  [BOND_INTAKE_STATUSES.NOT_BOND_RELEVANT]: 'Not bond relevant',
})

export const BOND_INTAKE_STATUS_TONES = Object.freeze({
  [BOND_INTAKE_STATUSES.AWAITING_BUYER_APPLICATION]: 'neutral',
  [BOND_INTAKE_STATUSES.BUYER_IN_PROGRESS]: 'warning',
  [BOND_INTAKE_STATUSES.AWAITING_DOCUMENTS]: 'warning',
  [BOND_INTAKE_STATUSES.READY_FOR_REVIEW]: 'success',
  [BOND_INTAKE_STATUSES.ACCEPTED]: 'success',
  [BOND_INTAKE_STATUSES.DECLINED]: 'danger',
  [BOND_INTAKE_STATUSES.NOT_BOND_RELEVANT]: 'muted',
})

const COMPLETED_DOCUMENT_STATUSES = new Set(['uploaded', 'under_review', 'approved', 'accepted', 'completed'])
const APPROVED_DOCUMENT_STATUSES = new Set(['approved', 'accepted', 'completed'])
const REJECTED_DOCUMENT_STATUSES = new Set(['rejected', 'declined', 'failed', 'reupload_required', 'needs_reupload'])
const NOT_REQUIRED_DOCUMENT_STATUSES = new Set(['waived', 'not_required', 'not_applicable'])
const ACTIVE_ROLE_PLAYER_STATUSES = new Set(['', 'active', 'assigned', 'in_progress', 'started', 'current'])
const ACCEPTED_ASSIGNMENT_STATUSES = new Set(['workspace_assigned', 'consultant_assigned', 'processor_assigned', 'fully_assigned'])
const DECLINED_MARKER_VALUES = new Set(['declined', 'rejected', 'not_accepted', 'intake_declined'])
const ACCEPTED_MARKER_VALUES = new Set(['accepted', 'intake_accepted', 'ready_accepted', 'assigned'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeDateValue(value) {
  const normalized = normalizeText(value)
  if (!normalized) return null
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : normalized
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function getFormData(onboardingFormData = null) {
  if (!isPlainObject(onboardingFormData)) return {}
  if (isPlainObject(onboardingFormData.form_data)) return onboardingFormData.form_data
  if (isPlainObject(onboardingFormData.formData)) return onboardingFormData.formData
  return onboardingFormData
}

function pickFirstObject(candidates = []) {
  return candidates.find((candidate) => isPlainObject(candidate)) || null
}

function pickFirstText(candidates = []) {
  for (const candidate of candidates) {
    const value = normalizeText(candidate)
    if (value) return value
  }
  return ''
}

function getBondApplicationPayload({ transaction = {}, onboardingFormData = null } = {}) {
  const formData = getFormData(onboardingFormData)
  return pickFirstObject([
    formData.bond_application,
    formData.finance?.bond_application,
    formData.bondApplication,
    transaction?.bond_application,
    transaction?.bondApplication,
  ])
}

function getFinanceTypeCandidates(transaction = {}, onboardingFormData = null) {
  const formData = getFormData(onboardingFormData)
  return [
    transaction?.finance_type,
    transaction?.financeType,
    transaction?.transaction_finance_details?.finance_type,
    transaction?.transactionFinanceDetails?.financeType,
    transaction?.transactionFinanceDetails?.finance_type,
    transaction?.finance_details?.finance_type,
    transaction?.financeDetails?.financeType,
    formData.finance_type,
    formData.financeType,
    formData.finance?.finance_type,
    formData.finance?.financeType,
    formData.bond_application?.finance_type,
    formData.bond_application?.financeType,
    formData.finance?.bond_application?.finance_type,
    formData.finance?.bond_application?.financeType,
    formData.bondApplication?.finance_type,
    formData.bondApplication?.financeType,
  ]
}

export function isBondFinanceType(transaction = {}, onboardingFormData = null) {
  return getFinanceTypeCandidates(transaction, onboardingFormData).some((value) => isCanonicalBondFinanceType(value))
}

function isSubmittedBondApplication(payload = null) {
  if (!isPlainObject(payload)) return false
  if (normalizeDateValue(payload.submitted_at || payload.submittedAt)) return true
  const status = normalizeLower(payload.status || payload.application_status || payload.applicationStatus)
  return ['submitted', 'complete', 'completed', 'ready_for_review'].includes(status)
}

function isStartedBondApplication(payload = null) {
  if (!isPlainObject(payload)) return false
  if (isSubmittedBondApplication(payload)) return true
  if (normalizeDateValue(payload.started_at || payload.startedAt || payload.created_at || payload.createdAt)) return true
  const status = normalizeLower(payload.status || payload.application_status || payload.applicationStatus)
  if (['draft', 'in_progress', 'started', 'partial'].includes(status)) return true
  return Object.keys(payload).some((key) => !['status', 'application_status', 'applicationStatus'].includes(key))
}

function getSectionsCompleted(payload = null) {
  if (!isPlainObject(payload)) return []
  const explicit = payload.sections_completed || payload.sectionsCompleted
  if (Array.isArray(explicit)) return explicit.map(normalizeText).filter(Boolean)
  if (isPlainObject(explicit)) {
    return Object.entries(explicit)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key)
  }
  const sections = payload.sections || payload.section_progress || payload.sectionProgress
  if (isPlainObject(sections)) {
    return Object.entries(sections)
      .filter(([, value]) => {
        if (value === true) return true
        if (isPlainObject(value)) return Boolean(value.completed || value.isComplete || value.status === 'completed')
        return normalizeLower(value) === 'completed'
      })
      .map(([key]) => key)
  }
  return []
}

export function getBondApplicationProgress(input = {}) {
  const payload = getBondApplicationPayload(input)
  const submittedAt = normalizeDateValue(payload?.submitted_at || payload?.submittedAt)
  const startedAt = normalizeDateValue(payload?.started_at || payload?.startedAt || payload?.created_at || payload?.createdAt)
  const sectionsCompleted = getSectionsCompleted(payload)
  const explicitPercentage = normalizeNumber(
    payload?.completion_percentage ?? payload?.completionPercentage ?? payload?.progress_percentage ?? payload?.progressPercentage,
    Number.NaN,
  )
  const completionPercentage = Number.isFinite(explicitPercentage)
    ? Math.max(0, Math.min(100, explicitPercentage))
    : isSubmittedBondApplication(payload)
      ? 100
      : sectionsCompleted.length
        ? Math.min(95, sectionsCompleted.length * 20)
        : 0

  if (isSubmittedBondApplication(payload)) {
    return {
      status: BOND_APPLICATION_PROGRESS_STATUSES.SUBMITTED,
      submittedAt: submittedAt || normalizeDateValue(payload?.updated_at || payload?.updatedAt),
      startedAt,
      completionPercentage,
      sectionsCompleted,
    }
  }

  if (isStartedBondApplication(payload)) {
    return {
      status: BOND_APPLICATION_PROGRESS_STATUSES.IN_PROGRESS,
      submittedAt: null,
      startedAt,
      completionPercentage,
      sectionsCompleted,
    }
  }

  return {
    status: BOND_APPLICATION_PROGRESS_STATUSES.NOT_STARTED,
    submittedAt: null,
    startedAt: null,
    completionPercentage: 0,
    sectionsCompleted: [],
  }
}

function isFinanceDocument(candidate = {}) {
  const text = [
    candidate.category,
    candidate.document_category,
    candidate.documentCategory,
    candidate.document_type,
    candidate.documentType,
    candidate.type,
    candidate.title,
    candidate.label,
    candidate.name,
    candidate.lane_key,
    candidate.laneKey,
    candidate.requirement_id,
    candidate.requirementId,
  ]
    .map(normalizeLower)
    .filter(Boolean)
    .join(' ')

  if (!text) return true
  return /(bond|finance|bank|fica|income|salary|payslip|statement|affordability|credit|id|identity|proof)/i.test(text)
}

function getDocumentLabel(candidate = {}) {
  return (
    pickFirstText([
      candidate.title,
      candidate.label,
      candidate.name,
      candidate.document_label,
      candidate.documentLabel,
      candidate.document_type,
      candidate.documentType,
      candidate.type,
      candidate.category,
    ]) || 'Required document'
  )
}

function getDocumentKey(candidate = {}, fallback = '') {
  return normalizeLower(
    pickFirstText([
      candidate.id,
      candidate.request_id,
      candidate.requestId,
      candidate.requirement_id,
      candidate.requirementId,
      candidate.document_type,
      candidate.documentType,
      candidate.type,
      candidate.title,
      fallback,
    ]),
  )
}

function getDocumentStatus(candidate = {}) {
  return normalizeLower(
    pickFirstText([
      candidate.review_status,
      candidate.reviewStatus,
      candidate.status,
      candidate.requiredDocumentStatus,
      candidate.document_status,
      candidate.documentStatus,
      candidate.upload_status,
      candidate.uploadStatus,
    ]),
  )
}

function hasUploadedDocument(candidate = {}) {
  return Boolean(
    pickFirstText([
      candidate.document_id,
      candidate.documentId,
      candidate.file_id,
      candidate.fileId,
      candidate.storage_path,
      candidate.storagePath,
      candidate.url,
      candidate.path,
      candidate.uploaded_at,
      candidate.uploadedAt,
    ]),
  )
}

function buildUploadedDocumentIndex(documents = []) {
  const index = new Map()
  for (const document of Array.isArray(documents) ? documents : []) {
    const keys = [
      getDocumentKey(document),
      normalizeLower(document.document_request_id || document.documentRequestId),
      normalizeLower(document.request_id || document.requestId),
      normalizeLower(document.requirement_id || document.requirementId),
      normalizeLower(document.document_type || document.documentType || document.type),
      normalizeLower(document.title || document.label || document.name),
    ].filter(Boolean)
    for (const key of keys) {
      if (!index.has(key)) index.set(key, [])
      index.get(key).push(document)
    }
  }
  return index
}

function getMatchingDocuments(request = {}, documentsByKey = new Map()) {
  const keys = [
    getDocumentKey(request),
    normalizeLower(request.id),
    normalizeLower(request.requirement_id || request.requirementId),
    normalizeLower(request.document_type || request.documentType || request.type),
    normalizeLower(request.title || request.label || request.name),
  ].filter(Boolean)
  return keys.flatMap((key) => documentsByKey.get(key) || [])
}

function isDocumentComplete(request = {}, matchingDocuments = []) {
  const status = getDocumentStatus(request)
  if (NOT_REQUIRED_DOCUMENT_STATUSES.has(status)) return true
  if (REJECTED_DOCUMENT_STATUSES.has(status)) return false
  if (COMPLETED_DOCUMENT_STATUSES.has(status) || hasUploadedDocument(request)) return true
  return matchingDocuments.some((document) => {
    const documentStatus = getDocumentStatus(document)
    if (REJECTED_DOCUMENT_STATUSES.has(documentStatus)) return false
    return COMPLETED_DOCUMENT_STATUSES.has(documentStatus) || hasUploadedDocument(document)
  })
}

function isDocumentApproved(request = {}, matchingDocuments = []) {
  const status = getDocumentStatus(request)
  if (APPROVED_DOCUMENT_STATUSES.has(status)) return true
  return matchingDocuments.some((document) => APPROVED_DOCUMENT_STATUSES.has(getDocumentStatus(document)))
}

export function getDocumentReadinessSummary({ documentRequests = [], documents = [] } = {}) {
  const requests = (Array.isArray(documentRequests) ? documentRequests : []).filter(isFinanceDocument)
  const documentsByKey = buildUploadedDocumentIndex(documents)
  const missingLabels = []
  let uploadedCount = 0
  let approvedCount = 0

  for (const request of requests) {
    const status = getDocumentStatus(request)
    if (NOT_REQUIRED_DOCUMENT_STATUSES.has(status)) continue
    const matchingDocuments = getMatchingDocuments(request, documentsByKey)
    const complete = isDocumentComplete(request, matchingDocuments)
    const approved = isDocumentApproved(request, matchingDocuments)
    if (complete) uploadedCount += 1
    if (approved) approvedCount += 1
    if (!complete) missingLabels.push(getDocumentLabel(request))
  }

  const requiredCount = requests.filter((request) => !NOT_REQUIRED_DOCUMENT_STATUSES.has(getDocumentStatus(request))).length
  const missingCount = missingLabels.length

  return {
    requiredCount,
    uploadedCount,
    approvedCount,
    missingCount,
    missingLabels,
    isComplete: requiredCount === 0 || missingCount === 0,
  }
}

function getRolePlayerSnapshot(rolePlayer = {}) {
  const snapshot = rolePlayer.snapshot_json || rolePlayer.snapshotJson || rolePlayer.snapshot || {}
  return isPlainObject(snapshot) ? snapshot : {}
}

function getEvents(input = {}) {
  const transaction = input.transaction || {}
  if (Array.isArray(input.events)) return input.events
  if (Array.isArray(input.transactionEvents)) return input.transactionEvents
  if (Array.isArray(input.transaction_events)) return input.transaction_events
  if (Array.isArray(transaction.events)) return transaction.events
  if (Array.isArray(transaction.transactionEvents)) return transaction.transactionEvents
  if (Array.isArray(transaction.transaction_events)) return transaction.transaction_events
  return []
}

function hasDeclinedMarker(input = {}) {
  const transaction = input.transaction || input || {}
  const statusValues = [
    transaction.bond_intake_status,
    transaction.bondIntakeStatus,
    transaction.bond_originator_intake_status,
    transaction.bondOriginatorIntakeStatus,
    transaction.bond_assignment_decision,
    transaction.bondAssignmentDecision,
    transaction.bond_assignment_status,
    transaction.bondAssignmentStatus,
  ].map(normalizeLower)

  if (statusValues.some((value) => DECLINED_MARKER_VALUES.has(value))) return true

  const rolePlayerDeclined = getRolePlayers(input).some((rolePlayer) => {
    const snapshot = getRolePlayerSnapshot(rolePlayer)
    const values = [
      snapshot.intake_status,
      snapshot.intakeStatus,
      snapshot.decision,
      snapshot.status,
      rolePlayer.selection_source,
      rolePlayer.selectionSource,
    ].map(normalizeLower)
    return values.some((value) => DECLINED_MARKER_VALUES.has(value) || value === 'declined_from_intake')
  })
  if (rolePlayerDeclined) return true

  return getEvents(input).some((event) => {
    const eventType = normalizeLower(event.event_type || event.eventType || event.type)
    const eventData = isPlainObject(event.event_data) ? event.event_data : isPlainObject(event.eventData) ? event.eventData : {}
    const dataStatus = normalizeLower(eventData.intake_status || eventData.intakeStatus || eventData.status)
    return eventType === 'bond_intake_declined' || DECLINED_MARKER_VALUES.has(dataStatus)
  })
}

function getRolePlayers(input = {}) {
  const transaction = input.transaction || {}
  if (Array.isArray(input.rolePlayers)) return input.rolePlayers
  if (Array.isArray(transaction.rolePlayers)) return transaction.rolePlayers
  if (Array.isArray(transaction.transactionRolePlayers)) return transaction.transactionRolePlayers
  if (Array.isArray(transaction.transaction_role_players)) return transaction.transaction_role_players
  return []
}

function rolePlayerIsBondOriginator(rolePlayer = {}, currentOrganisationId = '') {
  const role = normalizeLower(
    pickFirstText([
      rolePlayer.role_type,
      rolePlayer.roleType,
      rolePlayer.role,
      rolePlayer.participantRole,
      rolePlayer.participant_role,
      rolePlayer.participant_role_type,
    ]),
  )
  if (!['bond_originator', 'bond originator'].includes(role)) return false

  const status = normalizeLower(rolePlayer.status || rolePlayer.participantStatus || rolePlayer.participant_status)
  if (!ACTIVE_ROLE_PLAYER_STATUSES.has(status)) return false

  const currentOrg = normalizeText(currentOrganisationId)
  if (!currentOrg) return true
  const roleOrg = normalizeText(
    rolePlayer.organisation_id ||
      rolePlayer.organization_id ||
      rolePlayer.workspace_id ||
      rolePlayer.organisationId ||
      rolePlayer.organizationId ||
      rolePlayer.workspaceId,
  )
  return !roleOrg || roleOrg === currentOrg
}

function hasAcceptedAssignment(input = {}) {
  const transaction = input.transaction || {}
  const assignmentStatus = normalizeLower(transaction.bond_assignment_status || transaction.bondAssignmentStatus)
  const assignedEmail = pickFirstText([
    transaction.assigned_bond_originator_email,
    transaction.assignedBondOriginatorEmail,
    transaction.assigned_bond_originator,
  ])
  const assignedUserId = pickFirstText([
    transaction.primary_bond_consultant_user_id,
    transaction.primaryBondConsultantUserId,
    transaction.bond_originator_user_id,
    transaction.bondOriginatorUserId,
  ])
  const financeManagedBy = normalizeLower(transaction.finance_managed_by || transaction.financeManagedBy)

  const rolePlayerAccepted = getRolePlayers(input).some((rolePlayer) => {
    if (!rolePlayerIsBondOriginator(rolePlayer, input.currentOrganisationId)) return false
    const snapshot = getRolePlayerSnapshot(rolePlayer)
    const markerValues = [
      snapshot.intake_status,
      snapshot.intakeStatus,
      snapshot.decision,
      snapshot.status,
      snapshot.source,
      rolePlayer.selection_source,
      rolePlayer.selectionSource,
    ].map(normalizeLower)
    return markerValues.some((value) => ACCEPTED_MARKER_VALUES.has(value) || value === 'accepted_from_intake' || value === 'assigned_from_intake')
  })

  if (rolePlayerAccepted) return true
  if (ACCEPTED_ASSIGNMENT_STATUSES.has(assignmentStatus)) return true
  if (assignedEmail || assignedUserId) return true
  if (financeManagedBy === 'bond_originator' && (assignedEmail || assignedUserId)) return true
  return rolePlayerAccepted
}

export function getBondIntakeStatus(input = {}) {
  const transaction = input.transaction || {}
  if (!isBondFinanceType(transaction, input.onboardingFormData)) {
    return BOND_INTAKE_STATUSES.NOT_BOND_RELEVANT
  }

  if (hasDeclinedMarker(input)) {
    return BOND_INTAKE_STATUSES.DECLINED
  }

  if (hasAcceptedAssignment(input)) {
    return BOND_INTAKE_STATUSES.ACCEPTED
  }

  const applicationProgress = getBondApplicationProgress(input)
  if (applicationProgress.status === BOND_APPLICATION_PROGRESS_STATUSES.NOT_STARTED) {
    return BOND_INTAKE_STATUSES.AWAITING_BUYER_APPLICATION
  }

  if (applicationProgress.status === BOND_APPLICATION_PROGRESS_STATUSES.IN_PROGRESS) {
    return BOND_INTAKE_STATUSES.BUYER_IN_PROGRESS
  }

  const documentReadiness = getDocumentReadinessSummary(input)
  if (!documentReadiness.isComplete) {
    return BOND_INTAKE_STATUSES.AWAITING_DOCUMENTS
  }

  return BOND_INTAKE_STATUSES.READY_FOR_REVIEW
}

function getReasons({ intakeStatus, applicationProgress, documentReadiness } = {}) {
  if (intakeStatus === BOND_INTAKE_STATUSES.NOT_BOND_RELEVANT) return ['Transaction is not Bond or Hybrid finance.']
  if (intakeStatus === BOND_INTAKE_STATUSES.ACCEPTED) return ['Bond originator assignment already exists.']
  if (intakeStatus === BOND_INTAKE_STATUSES.DECLINED) return ['Bond intake has been declined.']
  if (applicationProgress.status === BOND_APPLICATION_PROGRESS_STATUSES.NOT_STARTED) return ['No submitted bond application payload found.']
  if (applicationProgress.status === BOND_APPLICATION_PROGRESS_STATUSES.IN_PROGRESS) return ['Buyer has started but not submitted the bond application.']
  if (!documentReadiness.isComplete) return documentReadiness.missingLabels.map((label) => `${label} is required.`)
  return ['Bond application and required documents are ready for review.']
}

export function getBondIntakeSummary(input = {}) {
  const applicationProgress = getBondApplicationProgress(input)
  const documentReadiness = getDocumentReadinessSummary(input)
  const intakeStatus = getBondIntakeStatus(input)

  return {
    intakeStatus,
    applicationProgress,
    documentReadiness,
    canAccept: intakeStatus === BOND_INTAKE_STATUSES.READY_FOR_REVIEW,
    readinessLabel: BOND_INTAKE_STATUS_LABELS[intakeStatus] || BOND_INTAKE_STATUS_LABELS[BOND_INTAKE_STATUSES.NOT_BOND_RELEVANT],
    readinessTone: BOND_INTAKE_STATUS_TONES[intakeStatus] || 'muted',
    reasons: getReasons({ intakeStatus, applicationProgress, documentReadiness }),
  }
}
