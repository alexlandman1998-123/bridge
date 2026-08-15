const BOND_FINANCE_TYPES = new Set(['bond', 'combination', 'hybrid'])
const ORIGINATOR_MANAGED_VALUES = new Set(['bond_originator', 'originator', 'bond originator'])
const SIGNED_OTP_STATUS_VALUES = new Set([
  'signed_otp_received',
  'otp_signed',
  'signed otp received',
  'signed otp',
  'fully_signed',
  'fully signed',
  'complete',
  'completed',
])
const OTP_PREPARING_STATUS_VALUES = new Set([
  'otp_uploaded',
  'awaiting_signed_otp',
  'awaiting signed otp',
  'awaiting_signature',
  'awaiting signature',
  'ready_for_client_signature',
  'awaiting_other_signatures',
  'finalisation_pending',
  'finalising',
  'preparing',
  'generated_not_ready',
])
const FINANCE_OR_LATER_STAGES = new Set(['FIN', 'ATTY', 'ATT', 'XFER', 'REG', 'REGISTERED'])

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeStage(value = '') {
  return String(value || '').trim().toUpperCase()
}

function isBondFinanceType(value = '') {
  return BOND_FINANCE_TYPES.has(normalizeKey(value))
}

function isOriginatorManaged(value = '') {
  return ORIGINATOR_MANAGED_VALUES.has(normalizeKey(value))
}

function normalizeDocumentText(document = {}) {
  return [
    document.document_type,
    document.documentType,
    document.document_key,
    document.documentKey,
    document.category,
    document.name,
    document.label,
    document.key,
    document.status,
    document.workflow_state,
    document.workflowState,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function isSignedOtpDocument(document = {}) {
  const text = normalizeDocumentText(document)
  if (!text) return false
  if (text.includes('signed_otp') || text.includes('otp_signed')) return true
  return text.includes('signed') && (text.includes('otp') || text.includes('offer to purchase'))
}

function isOtpDocumentInProgress(document = {}) {
  const text = normalizeDocumentText(document)
  if (!text) return false
  return (text.includes('otp') || text.includes('offer to purchase')) && !isSignedOtpDocument(document)
}

function hasSignedOtpDocument(documents = []) {
  return documents.some((document) => isSignedOtpDocument(document))
}

function hasOtpDocumentInProgress(documents = []) {
  return documents.some((document) => isOtpDocumentInProgress(document))
}

function getStatusCandidates(portal = {}) {
  return [
    portal?.transaction?.onboarding_status,
    portal?.transaction?.onboardingStatus,
    portal?.transaction?.otp_status,
    portal?.transaction?.otpStatus,
    portal?.transaction?.stage,
    portal?.onboardingStatus,
    portal?.onboarding_status,
    portal?.onboardingFormData?.status,
  ].map(normalizeKey).filter(Boolean)
}

export function getBondApplicationOtpUnlockState({
  portal = {},
  financeType = '',
  financeManagedBy = '',
  mainStage = '',
  requiredDocuments = [],
  documents = [],
} = {}) {
  const resolvedFinanceType =
    financeType ||
    portal?.onboardingFormData?.formData?.purchase_finance_type ||
    portal?.transaction?.finance_type ||
    portal?.transaction?.financeType
  const resolvedFinanceManagedBy =
    financeManagedBy ||
    portal?.onboardingFormData?.formData?.finance_managed_by ||
    portal?.onboardingFormData?.formData?.financeManagedBy ||
    portal?.transaction?.finance_managed_by ||
    portal?.transaction?.financeManagedBy

  if (!isBondFinanceType(resolvedFinanceType)) {
    return {
      status: 'not_required',
      unlocked: false,
      blocked: false,
      reason: 'not_bond_finance',
      label: 'Not required',
      title: 'Bond application not required',
      description: 'This transaction is not marked as bond-financed.',
    }
  }

  if (!isOriginatorManaged(resolvedFinanceManagedBy)) {
    return {
      status: 'not_available',
      unlocked: false,
      blocked: false,
      reason: 'finance_not_originator_managed',
      label: 'Externally managed',
      title: 'Bond application managed outside this portal',
      description: 'Finance for this transaction is not assigned to the bond originator workflow.',
    }
  }

  const normalizedMainStage = normalizeStage(
    mainStage || portal?.transaction?.current_main_stage || portal?.transaction?.currentMainStage || portal?.mainStage,
  )
  const statusCandidates = getStatusCandidates(portal)
  const allDocuments = [
    ...(Array.isArray(requiredDocuments) ? requiredDocuments : []),
    ...(Array.isArray(documents) ? documents : []),
    ...(Array.isArray(portal?.documents) ? portal.documents : []),
    ...(Array.isArray(portal?.sharedDocuments) ? portal.sharedDocuments : []),
  ]
  const signedByStatus = statusCandidates.some((status) => SIGNED_OTP_STATUS_VALUES.has(status))
  const preparingByStatus = statusCandidates.some((status) => OTP_PREPARING_STATUS_VALUES.has(status))
  const signedByPacket =
    normalizeKey(portal?.otpPacket?.state) === 'fully_signed' ||
    portal?.otpPacket?.finalSignedAccess?.available === true
  const signedByDocument = hasSignedOtpDocument(allDocuments)
  const preparingByDocument = hasOtpDocumentInProgress(allDocuments)
  const atFinanceOrLater = FINANCE_OR_LATER_STAGES.has(normalizedMainStage)

  if (signedByStatus || signedByPacket || signedByDocument || atFinanceOrLater) {
    return {
      status: 'unlocked',
      unlocked: true,
      blocked: false,
      reason: signedByStatus
        ? 'signed_otp_status'
        : signedByPacket
          ? 'signed_otp_packet'
          : signedByDocument
            ? 'signed_otp_document'
            : 'finance_stage_reached',
      label: 'Ready',
      title: 'Your bond application is ready',
      description: 'We have prepared the application from your OTP, onboarding details, and transaction information.',
    }
  }

  if (preparingByStatus || preparingByDocument) {
    return {
      status: 'preparing',
      unlocked: false,
      blocked: true,
      reason: preparingByStatus ? 'otp_in_progress_status' : 'otp_in_progress_document',
      label: 'OTP in progress',
      title: 'Your bond application is being prepared',
      description: 'Your OTP is loaded or awaiting signature. The application will unlock once the signed OTP handoff is complete.',
    }
  }

  return {
    status: 'locked',
    unlocked: false,
    blocked: true,
    reason: 'awaiting_otp',
    label: 'Locked',
    title: 'Bond application unlocks after OTP',
    description: 'Once your OTP is loaded and signed, we will prepare your bond application with the information already captured.',
  }
}
