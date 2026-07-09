export const ATTORNEY_INCOMING_INSTRUCTION_STATUSES = Object.freeze({
  newInstruction: 'new_instruction',
  awaitingClientOnboarding: 'awaiting_client_onboarding',
  awaitingSignedOtp: 'awaiting_signed_otp',
  awaitingDocuments: 'awaiting_documents',
  readyForAcceptance: 'ready_for_acceptance',
  accepted: 'accepted',
  declined: 'declined',
  removed: 'removed',
  completed: 'completed',
})

export const ATTORNEY_INCOMING_QUEUE_STATUSES = Object.freeze([
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments,
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance,
])

export const ATTORNEY_PRE_INCOMING_STATUSES = Object.freeze([
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction,
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding,
])

export const ATTORNEY_INSTRUCTION_CLOSED_STATUSES = Object.freeze([
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted,
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined,
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES.removed,
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES.completed,
])

export const ATTORNEY_INCOMING_STATUS_LABELS = Object.freeze({
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction]: 'New Instruction',
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding]: 'Awaiting Buyer Onboarding',
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp]: 'Awaiting Signed OTP',
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments]: 'Awaiting Documents',
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance]: 'Ready For Acceptance',
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted]: 'Accepted',
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined]: 'Declined',
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.removed]: 'Removed',
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.completed]: 'Completed',
})

export const ATTORNEY_INCOMING_WAITING_ON = Object.freeze({
  buyerOnboarding: 'buyer_onboarding',
  signedOtp: 'signed_otp',
  documents: 'documents',
  attorneyAcceptance: 'attorney_acceptance',
  instructionReview: 'instruction_review',
})

const STATUS_ALIASES = Object.freeze({
  new: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction,
  new_instruction: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction,
  instruction_received: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction,
  awaiting_onboarding: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding,
  awaiting_client: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding,
  awaiting_client_onboarding: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding,
  buyer_onboarding_sent: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding,
  sent: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding,
  in_progress: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding,
  submitted: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
  buyer_onboarding_completed: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
  client_onboarding_complete: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
  awaiting_otp: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
  awaiting_signed_otp: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
  awaiting_documents: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments,
  awaiting_supporting_documents: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments,
  documents_in_review: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments,
  ready: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance,
  ready_for_acceptance: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance,
  ready_for_instruction: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance,
  signed_otp_received: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance,
  accepted: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted,
  declined: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined,
  rejected: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined,
  removed: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.removed,
  cancelled: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.removed,
  completed: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.completed,
})

const ONBOARDING_SUBMITTED_STATUSES = new Set([
  'submitted',
  'reviewed',
  'approved',
  'complete',
  'completed',
  'client_onboarding_complete',
  'awaiting_signed_otp',
  'signed_otp_received',
])

const ONBOARDING_IN_PROGRESS_STATUSES = new Set([
  'sent',
  'in_progress',
  'awaiting_client_onboarding',
  'not_started',
])

const SIGNED_OTP_STATUSES = new Set([
  'signed_otp_received',
  'otp_uploaded',
])

const OPEN_DOCUMENT_REQUEST_STATUSES = new Set([
  'requested',
  'rejected',
])

const REVIEW_PENDING_DOCUMENT_REQUEST_STATUSES = new Set([
  'uploaded',
  'reviewed',
  'under_review',
])

function normalizeKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, '_')
}

function firstText(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || ''
}

function readInstructionStatus(assignment = {}) {
  return firstText(
    assignment.instructionStatus,
    assignment.instruction_status,
    assignment.intakeStatus,
    assignment.intake_status,
  )
}

function readAssignmentStatus(assignment = {}) {
  return firstText(
    assignment.assignmentStatus,
    assignment.assignment_status,
    assignment.status,
  )
}

function readOnboardingStatus(transaction = {}, onboarding = {}) {
  const transactionRow = transaction || {}
  const onboardingRow = onboarding || {}
  return firstText(
    transactionRow.onboardingStatus,
    transactionRow.onboarding_status,
    onboardingRow.status,
    onboardingRow.onboardingStatus,
    onboardingRow.onboarding_status,
  )
}

function hasValue(...values) {
  return values.some((value) => value !== null && value !== undefined && String(value).trim() !== '')
}

export function normalizeAttorneyIncomingInstructionStatus(value, fallback = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  return STATUS_ALIASES[normalized] || fallback
}

export function getAttorneyIncomingStatusLabel(status) {
  const normalized = normalizeAttorneyIncomingInstructionStatus(status, ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction)
  return ATTORNEY_INCOMING_STATUS_LABELS[normalized] || ATTORNEY_INCOMING_STATUS_LABELS[ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction]
}

export function isAttorneyIncomingQueueStatus(status) {
  const normalized = normalizeAttorneyIncomingInstructionStatus(status)
  return ATTORNEY_INCOMING_QUEUE_STATUSES.includes(normalized)
}

export function isAttorneyInstructionClosedStatus(status) {
  const normalized = normalizeAttorneyIncomingInstructionStatus(status)
  return ATTORNEY_INSTRUCTION_CLOSED_STATUSES.includes(normalized)
}

export function isTransferAttorneyAssignment(assignment = {}) {
  const attorneyRole = normalizeKey(assignment.attorneyRole || assignment.attorney_role)
  const assignmentType = normalizeKey(assignment.assignmentType || assignment.assignment_type || assignment.matterType || assignment.matter_type)
  return (
    attorneyRole === 'transfer_attorney' ||
    assignmentType === 'transfer' ||
    assignmentType === 'transfer_and_bond'
  )
}

export function getOpenAttorneyDocumentRequests(documentRequests = []) {
  return (documentRequests || []).filter((request) => OPEN_DOCUMENT_REQUEST_STATUSES.has(normalizeKey(request.status || request.reviewStatus || request.review_status)))
}

export function getAttorneyDocumentRequestsInReview(documentRequests = []) {
  return (documentRequests || []).filter((request) => REVIEW_PENDING_DOCUMENT_REQUEST_STATUSES.has(normalizeKey(request.reviewStatus || request.review_status || request.status)))
}

export function hasBuyerOnboardingSubmitted({ transaction = {}, onboarding = {} } = {}) {
  const transactionRow = transaction || {}
  const onboardingRow = onboarding || {}
  const status = normalizeKey(readOnboardingStatus(transactionRow, onboardingRow))
  return (
    ONBOARDING_SUBMITTED_STATUSES.has(status) ||
    hasValue(
      transactionRow.onboardingCompletedAt,
      transactionRow.onboarding_completed_at,
      transactionRow.externalOnboardingSubmittedAt,
      transactionRow.external_onboarding_submitted_at,
      onboardingRow.submittedAt,
      onboardingRow.submitted_at,
    )
  )
}

export function hasSignedOtpReceived(transaction = {}) {
  const transactionRow = transaction || {}
  const onboardingStatus = normalizeKey(transactionRow.onboardingStatus || transactionRow.onboarding_status)
  const mainStage = String(transactionRow.currentMainStage || transactionRow.current_main_stage || '').trim().toUpperCase()
  return (
    SIGNED_OTP_STATUSES.has(onboardingStatus) ||
    hasValue(transactionRow.signedOtpReceivedAt, transactionRow.signed_otp_received_at, transactionRow.otpUploadedAt, transactionRow.otp_uploaded_at) ||
    ['ATT', 'ATTY', 'XFER', 'REG'].includes(mainStage)
  )
}

export function resolveAttorneyIncomingInstructionStatus({
  transaction = {},
  assignment = {},
  onboarding = {},
  documentRequests = [],
} = {}) {
  const transactionRow = transaction || {}
  const assignmentRow = assignment || {}
  const onboardingRow = onboarding || {}
  const documentRequestRows = documentRequests || []
  const assignmentStatus = normalizeAttorneyIncomingInstructionStatus(readAssignmentStatus(assignmentRow))
  const explicitInstructionStatus = normalizeAttorneyIncomingInstructionStatus(readInstructionStatus(assignmentRow))

  if (isAttorneyInstructionClosedStatus(explicitInstructionStatus)) return explicitInstructionStatus
  if (isAttorneyInstructionClosedStatus(assignmentStatus)) return assignmentStatus

  const openDocuments = getOpenAttorneyDocumentRequests(documentRequestRows)
  const reviewDocuments = getAttorneyDocumentRequestsInReview(documentRequestRows)
  const onboardingStatus = normalizeKey(readOnboardingStatus(transactionRow, onboardingRow))

  if (hasSignedOtpReceived(transactionRow)) {
    return openDocuments.length || reviewDocuments.length
      ? ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments
      : ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance
  }

  if (explicitInstructionStatus === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments) {
    return ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments
  }

  if (onboardingStatus === 'awaiting_supporting_documents' || onboardingStatus === 'documents_in_review') {
    return ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments
  }

  if (
    explicitInstructionStatus === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp ||
    hasBuyerOnboardingSubmitted({ transaction: transactionRow, onboarding: onboardingRow })
  ) {
    return ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp
  }

  if (
    explicitInstructionStatus === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding ||
    ONBOARDING_IN_PROGRESS_STATUSES.has(onboardingStatus)
  ) {
    return ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding
  }

  return explicitInstructionStatus || ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction
}

export function resolveAttorneyIncomingWaitingOn({
  status,
  transaction = {},
  onboarding = {},
  documentRequests = [],
} = {}) {
  const resolvedStatus = normalizeAttorneyIncomingInstructionStatus(status, ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction)
  const transactionRow = transaction || {}
  const onboardingRow = onboarding || {}
  const documentRequestRows = documentRequests || []
  const waitingOn = []
  const openDocuments = getOpenAttorneyDocumentRequests(documentRequestRows)
  const reviewDocuments = getAttorneyDocumentRequestsInReview(documentRequestRows)

  if (resolvedStatus === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction) {
    waitingOn.push(ATTORNEY_INCOMING_WAITING_ON.instructionReview)
  }

  if (resolvedStatus === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding) {
    waitingOn.push(ATTORNEY_INCOMING_WAITING_ON.buyerOnboarding)
  }

  if (
    resolvedStatus === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp ||
    (hasBuyerOnboardingSubmitted({ transaction: transactionRow, onboarding: onboardingRow }) && !hasSignedOtpReceived(transactionRow))
  ) {
    waitingOn.push(ATTORNEY_INCOMING_WAITING_ON.signedOtp)
  }

  if (resolvedStatus === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments || openDocuments.length || reviewDocuments.length) {
    waitingOn.push(ATTORNEY_INCOMING_WAITING_ON.documents)
  }

  if (resolvedStatus === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance) {
    waitingOn.push(ATTORNEY_INCOMING_WAITING_ON.attorneyAcceptance)
  }

  return [...new Set(waitingOn)]
}

export function buildAttorneyIncomingMatterContract(input = {}) {
  const status = resolveAttorneyIncomingInstructionStatus(input)
  const waitingOn = resolveAttorneyIncomingWaitingOn({ ...input, status })
  return {
    status,
    label: getAttorneyIncomingStatusLabel(status),
    waitingOn,
    visibleInIncomingQueue: isAttorneyIncomingQueueStatus(status),
    visibleInPreIncoming: ATTORNEY_PRE_INCOMING_STATUSES.includes(status),
    visibleInActiveMatters: status === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted,
    leavesIncomingQueue: isAttorneyInstructionClosedStatus(status),
    requiresTransferAttorneyAssignment: true,
  }
}

export function shouldShowInAttorneyIncomingQueue(input = {}) {
  if (input.assignment && !isTransferAttorneyAssignment(input.assignment)) return false
  return buildAttorneyIncomingMatterContract(input).visibleInIncomingQueue
}
