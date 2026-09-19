function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function approved(value) {
  return ['approved', 'complete', 'completed', 'ready', 'verified'].includes(key(value))
}

// This is the shared language for the seller journey rail, Documents, portal,
// and readiness gates. Consumers should render these values instead of
// translating a mandate packet or onboarding status independently.
export function buildSellerSigningStatusModel({
  onboardingSubmitted = false,
  onboardingReviewStatus = '',
  mandateStatus = 'not_started',
  mandateExecutionMode = '',
  disclosureSigned = false,
  ficaStatus = '',
} = {}) {
  const suppliedMandate = key(mandateStatus)
  const mandate = ['fully_signed', 'completed', 'complete', 'finalised', 'finalized'].includes(suppliedMandate)
    ? 'signed'
    : suppliedMandate
  const route = key(mandateExecutionMode)
  const reviewApproved = approved(onboardingReviewStatus) || mandate === 'sent' || mandate === 'signed'
  const signed = mandate === 'signed'
  const manuallySent = mandate === 'sent' && route === 'manual'
  const digitallySent = mandate === 'sent' && route !== 'manual'

  const phase = signed
    ? 'mandate_signed'
    : manuallySent
      ? 'manual_route'
      : digitallySent
        ? 'digital_pack_sent'
        : reviewApproved && onboardingSubmitted
          ? 'agent_review_approved'
          : onboardingSubmitted
            ? 'onboarding_submitted'
            : 'onboarding_incomplete'

  const disclosure = signed || disclosureSigned
    ? { status: 'complete', label: 'Complete' }
    : onboardingSubmitted
      ? { status: 'signed_in_onboarding', label: 'Signed in onboarding' }
      : { status: 'awaiting_submission', label: 'Awaiting submission' }
  const fica = signed
    ? { status: approved(ficaStatus) ? 'complete' : 'review_status', label: approved(ficaStatus) ? 'Complete' : 'Complete / review status' }
    : digitallySent
      ? { status: 'sent_for_signature', label: 'Sent for signature' }
      : manuallySent
        ? { status: 'as_applicable', label: 'As applicable' }
        : reviewApproved
          ? { status: 'ready_to_send', label: 'Ready to send' }
          : onboardingSubmitted
            ? { status: 'awaiting_review', label: 'Awaiting review' }
            : { status: 'not_started', label: 'Not started' }
  const mandateSurface = signed
    ? { status: 'signed', label: 'Signed' }
    : digitallySent
      ? { status: 'sent_for_signature', label: 'Sent for signature' }
      : manuallySent
        ? { status: 'awaiting_signed_hard_copy', label: 'Awaiting signed hard copy' }
        : reviewApproved
          ? { status: 'ready_to_send', label: 'Ready to send' }
          : onboardingSubmitted
            ? { status: 'awaiting_review', label: 'Awaiting review' }
            : { status: 'not_started', label: 'Not started' }

  return {
    version: 'seller-signing-status-v1',
    phase,
    onboarding: onboardingSubmitted ? 'submitted' : 'incomplete',
    review: reviewApproved ? 'approved' : onboardingSubmitted ? 'awaiting_review' : 'not_started',
    disclosure,
    fica,
    mandate: mandateSurface,
    outstanding: signed
      ? []
      : manuallySent
        ? ['signed_mandate_hard_copy']
        : digitallySent
          ? ['fica_signature', 'mandate_signature']
          : onboardingSubmitted
            ? reviewApproved ? ['fica_signature', 'mandate_signature'] : ['agent_review']
            : ['seller_onboarding'],
  }
}

export function getSellerSigningStatusForDocument(documentKey = '', signingStatus = null) {
  const normalized = key(documentKey)
  if (normalized.includes('disclosure') || normalized.includes('defect')) return signingStatus?.disclosure || { status: 'not_started', label: 'Not started' }
  if (normalized.includes('fica')) return signingStatus?.fica || { status: 'not_started', label: 'Not started' }
  if (normalized.includes('mandate')) return signingStatus?.mandate || { status: 'not_started', label: 'Not started' }
  return null
}
