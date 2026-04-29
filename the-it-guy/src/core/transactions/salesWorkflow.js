import { SALES_STAGE_DEFINITIONS, WORKFLOW_LANE_DEFINITIONS } from '../workflows/definitions'
import { buildWorkflowLaneSnapshot } from '../workflows/engine'

export const SALES_WORKFLOW_STAGE_KEYS = [
  'new_transaction_onboarding',
  'otp_prep_signing',
  'supporting_documentation',
  'ready_for_finance',
]

export const OTP_DOCUMENT_TYPES = {
  generated: 'otp_generated',
  pendingApproval: 'otp_pending_approval',
  approved: 'otp_approved',
  sentToClient: 'otp_sent_to_client',
  signedReuploaded: 'otp_signed_reuploaded',
  signedFinal: 'signed_final',
}

const OTP_GENERATED_TYPES = new Set([
  OTP_DOCUMENT_TYPES.generated,
  OTP_DOCUMENT_TYPES.pendingApproval,
  OTP_DOCUMENT_TYPES.approved,
  OTP_DOCUMENT_TYPES.sentToClient,
])

const OTP_SIGNED_TYPES = new Set([OTP_DOCUMENT_TYPES.signedReuploaded, OTP_DOCUMENT_TYPES.signedFinal])
const ONBOARDING_COMPLETE_STATUSES = new Set(['submitted', 'reviewed', 'approved'])

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

export function normalizeOtpDocumentType(value) {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  if (OTP_GENERATED_TYPES.has(normalized) || OTP_SIGNED_TYPES.has(normalized)) {
    return normalized
  }
  if (normalized === 'otp_signed') {
    return OTP_DOCUMENT_TYPES.signedReuploaded
  }
  if (normalized === 'otp_signed_final') {
    return OTP_DOCUMENT_TYPES.signedFinal
  }
  return normalized
}

function isOtpRelatedDocument(document = {}) {
  const haystack = normalizeText(
    `${document?.name || ''} ${document?.category || ''} ${document?.document_type || ''} ${document?.stage_key || ''}`,
  )
  return haystack.includes('otp') || haystack.includes('offer to purchase')
}

function isSignedOtpDocument(document = {}) {
  const normalizedType = normalizeOtpDocumentType(document?.document_type)
  if (OTP_SIGNED_TYPES.has(normalizedType)) return true
  const haystack = normalizeText(
    `${document?.name || ''} ${document?.category || ''} ${document?.document_type || ''}`,
  )
  return isOtpRelatedDocument(document) && (haystack.includes('signed') || haystack.includes('executed') || haystack.includes('final'))
}

function isGeneratedOtpDocument(document = {}) {
  const normalizedType = normalizeOtpDocumentType(document?.document_type)
  if (OTP_GENERATED_TYPES.has(normalizedType)) return true
  if (OTP_SIGNED_TYPES.has(normalizedType)) return false
  return isOtpRelatedDocument(document) && !isSignedOtpDocument(document)
}

function toTimestamp(value) {
  const parsed = Date.parse(value || '')
  return Number.isFinite(parsed) ? parsed : 0
}

function byNewest(left, right) {
  const rightTimestamp = toTimestamp(right?.created_at || right?.updated_at)
  const leftTimestamp = toTimestamp(left?.created_at || left?.updated_at)
  return rightTimestamp - leftTimestamp
}

function resolveRequiredDocumentComplete(item = {}) {
  if (typeof item.complete === 'boolean') {
    return item.complete
  }

  const normalizedStatus = normalizeText(item.status)
  if (['uploaded', 'under_review', 'accepted', 'reviewed', 'completed', 'approved', 'verified'].includes(normalizedStatus)) {
    return true
  }

  return Boolean(item.is_uploaded)
}

function buildStage(key, label, description, status, blocker = '') {
  return {
    key,
    label,
    description,
    status,
    blocker: blocker || '',
  }
}

export function resolveSalesWorkflowSnapshot({
  onboardingStatus = '',
  onboardingCompletedAt = null,
  externalOnboardingSubmittedAt = null,
  documents = [],
  requiredDocuments = [],
  permissions = null,
} = {}) {
  const normalizedOnboardingStatus = normalizeText(onboardingStatus)
  const onboardingComplete =
    ONBOARDING_COMPLETE_STATUSES.has(normalizedOnboardingStatus) ||
    Boolean(onboardingCompletedAt || externalOnboardingSubmittedAt)

  const sortedDocuments = [...(documents || [])].sort(byNewest)
  const latestGeneratedOtpDocument = sortedDocuments.find((item) => isGeneratedOtpDocument(item)) || null
  const latestSignedOtpDocument = sortedDocuments.find((item) => isSignedOtpDocument(item)) || null
  const generatedType = normalizeOtpDocumentType(latestGeneratedOtpDocument?.document_type)
  const generatedCategory = normalizeText(latestGeneratedOtpDocument?.category)
  const generatedName = normalizeText(latestGeneratedOtpDocument?.name)
  const inferredApprovedFromText =
    generatedCategory.includes('approved') || generatedName.includes('approved')
  const inferredSentFromText =
    generatedCategory.includes('sent to client') ||
    generatedCategory.includes('client visible') ||
    generatedName.includes('sent to client')
  const otpAvailableToClient =
    Boolean(latestGeneratedOtpDocument) &&
    (generatedType === OTP_DOCUMENT_TYPES.sentToClient || inferredSentFromText || Boolean(latestGeneratedOtpDocument?.is_client_visible))
  const otpApproved =
    Boolean(latestGeneratedOtpDocument) &&
    ([OTP_DOCUMENT_TYPES.approved, OTP_DOCUMENT_TYPES.sentToClient].includes(generatedType) ||
      inferredApprovedFromText ||
      otpAvailableToClient)
  const signedOtpReceived = Boolean(latestSignedOtpDocument)

  const activeRequiredDocuments = (requiredDocuments || []).filter((item) => item?.isEnabled !== false && item?.isRequired !== false)
  const supportingCompletedCount = activeRequiredDocuments.filter((item) => resolveRequiredDocumentComplete(item)).length
  const supportingTotalCount = activeRequiredDocuments.length
  const supportingDocsComplete = supportingTotalCount === 0 ? true : supportingCompletedCount === supportingTotalCount
  const missingSupportingCount = Math.max(supportingTotalCount - supportingCompletedCount, 0)

  const readyForFinance = onboardingComplete && signedOtpReceived && supportingDocsComplete

  const stageOneBlocker = onboardingComplete ? '' : 'Client onboarding must be completed before moving ahead.'
  const stageTwoBlocker = !onboardingComplete
    ? 'Onboarding must be completed before OTP preparation starts.'
    : !latestGeneratedOtpDocument
      ? 'Generate the OTP document first.'
      : !otpApproved
        ? 'Approve the generated OTP before sharing it.'
        : !otpAvailableToClient
          ? 'Make the approved OTP available to the client.'
          : !signedOtpReceived
            ? 'Upload the signed OTP to complete this stage.'
            : ''
  const stageThreeBlocker = !onboardingComplete
    ? 'Onboarding is still incomplete.'
    : !signedOtpReceived
      ? 'Signed OTP is required before supporting documents can close.'
      : missingSupportingCount > 0
        ? `${missingSupportingCount} supporting document${missingSupportingCount === 1 ? '' : 's'} still outstanding.`
        : ''
  const stageFourBlocker = readyForFinance
    ? ''
    : [stageOneBlocker, stageTwoBlocker, stageThreeBlocker].filter(Boolean)[0] || 'Complete all prior sales steps first.'

  const stageBlockers = {
    new_transaction_onboarding: stageOneBlocker,
    otp_prep_signing: stageTwoBlocker,
    supporting_documentation: stageThreeBlocker,
    ready_for_finance: stageFourBlocker,
  }

  let nextAction = 'move_ready_for_finance'
  if (!onboardingComplete) {
    nextAction = 'complete_onboarding'
  } else if (!latestGeneratedOtpDocument) {
    nextAction = 'generate_otp'
  } else if (!otpApproved) {
    nextAction = 'approve_otp'
  } else if (!otpAvailableToClient) {
    nextAction = 'share_otp'
  } else if (!signedOtpReceived) {
    nextAction = 'upload_signed_otp'
  } else if (!supportingDocsComplete) {
    nextAction = 'complete_supporting_documents'
  }

  const sourceStatusByStageKey = {
    new_transaction_onboarding: onboardingComplete ? 'completed' : 'in_progress',
    otp_prep_signing: signedOtpReceived ? 'completed' : onboardingComplete ? 'in_progress' : 'not_started',
    supporting_documentation: supportingDocsComplete ? 'completed' : onboardingComplete && signedOtpReceived ? 'in_progress' : 'not_started',
    ready_for_finance: readyForFinance ? 'completed' : 'not_started',
  }

  const nextActionLabelMap = {
    complete_onboarding: 'Send Onboarding',
    generate_otp: 'Generate OTP',
    approve_otp: 'Approve OTP',
    share_otp: 'Make OTP Available',
    upload_signed_otp: 'Upload Signed OTP',
    complete_supporting_documents: 'Open Documents',
    move_ready_for_finance: 'Move to Ready for Finance',
  }

  const laneState = buildWorkflowLaneSnapshot({
    laneKey: WORKFLOW_LANE_DEFINITIONS.sales.key,
    laneLabel: WORKFLOW_LANE_DEFINITIONS.sales.label,
    stageDefinitions: SALES_STAGE_DEFINITIONS,
    sourceStatusByStageKey,
    lockState: {
      isLocked: false,
      message: '',
      blockers: [],
    },
    stageBlockersByKey: stageBlockers,
    permissions,
    nextAction: {
      key: nextAction,
      label: nextActionLabelMap[nextAction] || 'Continue',
      variant: 'primary',
    },
    isCompleteOverride: readyForFinance,
  })

  const currentStageIndex = Math.max(
    0,
    SALES_WORKFLOW_STAGE_KEYS.findIndex((key) => key === (laneState.currentStageKey || SALES_WORKFLOW_STAGE_KEYS[SALES_WORKFLOW_STAGE_KEYS.length - 1])),
  )

  return {
    onboardingComplete,
    supportingDocsComplete,
    signedOtpReceived,
    readyForFinance,
    nextAction,
    currentStageIndex,
    stages: laneState.stages.map((stage) => buildStage(stage.key, stage.label, stage.description, stage.status, stage.blocker)),
    blockers: laneState.blockers.filter(Boolean),
    laneState,
    availableActions: laneState.availableActions,
    latestGeneratedOtpDocument,
    latestSignedOtpDocument,
    otpApproved,
    otpAvailableToClient,
    supportingCompletedCount,
    supportingTotalCount,
    missingSupportingCount,
  }
}
