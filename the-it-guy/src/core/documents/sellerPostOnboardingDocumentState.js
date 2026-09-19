export const SELLER_POST_ONBOARDING_DOCUMENT_STATE_CONTRACT = 'arch9-seller-post-onboarding-document-state-v1'

export const SELLER_POST_ONBOARDING_DOCUMENT_STATES = Object.freeze({
  notStarted: 'not_started',
  complete: 'complete',
  awaitingAgentReview: 'awaiting_agent_review',
  readyToSend: 'ready_to_send',
  sentForSignature: 'sent_for_signature',
  awaitingRemainingSignatures: 'awaiting_remaining_signatures',
  awaitingSignedHardCopy: 'awaiting_signed_hard_copy',
  signed: 'signed',
  correctionRequested: 'correction_requested',
})

const text = (value) => String(value ?? '').trim()

function route(value = '') {
  const normalized = text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_')
  return ['manual', 'manual_upload', 'physical', 'wet_ink'].includes(normalized) ? 'manual_upload' : 'digital_pack'
}

function lifecycleStage(formData = {}) {
  const lifecycle = formData?.sellerOnboardingSigningLifecycle || formData?.seller_onboarding_signing_lifecycle || {}
  return text(lifecycle.stage)
}

/**
 * The shared, route-aware state model for documents that follow seller
 * onboarding. It deliberately does not create files or mark anything signed;
 * it only makes every surface describe the same operational truth.
 */
export function buildSellerPostOnboardingDocumentState({
  formData = {},
  onboardingSubmitted = false,
  mandateSigned = false,
  completedSignerCount = 0,
  requiredSignerCount = 0,
} = {}) {
  const stage = lifecycleStage(formData)
  const signingRoute = route(formData?.mandateSignatureRoute || formData?.mandate_signature_route || formData?.mandateExecutionMode || formData?.mandate_execution_mode)
  const reviewed = ['agent_review_approved', 'pack_prepared', 'pack_sent', 'partially_signed', 'manual_awaiting_upload', 'mandate_signed'].includes(stage)
  const packSent = ['pack_sent', 'partially_signed', 'mandate_signed'].includes(stage)
  const partiallySigned = stage === 'partially_signed' || (requiredSignerCount > 1 && completedSignerCount > 0 && completedSignerCount < requiredSignerCount)
  const signed = mandateSigned || stage === 'mandate_signed'
  const correctionRequested = stage === 'correction_requested' || text(formData?.sellerOnboardingReview?.status || formData?.seller_onboarding_review?.status) === 'correction_requested'

  const postReviewState = () => {
    if (correctionRequested) return SELLER_POST_ONBOARDING_DOCUMENT_STATES.correctionRequested
    if (signed) return SELLER_POST_ONBOARDING_DOCUMENT_STATES.signed
    if (signingRoute === 'manual_upload' && stage === 'manual_awaiting_upload') return SELLER_POST_ONBOARDING_DOCUMENT_STATES.awaitingSignedHardCopy
    if (partiallySigned) return SELLER_POST_ONBOARDING_DOCUMENT_STATES.awaitingRemainingSignatures
    if (packSent) return SELLER_POST_ONBOARDING_DOCUMENT_STATES.sentForSignature
    if (reviewed) return SELLER_POST_ONBOARDING_DOCUMENT_STATES.readyToSend
    return SELLER_POST_ONBOARDING_DOCUMENT_STATES.awaitingAgentReview
  }

  const postReviewDocumentState = onboardingSubmitted ? postReviewState() : SELLER_POST_ONBOARDING_DOCUMENT_STATES.notStarted
  return {
    contract: SELLER_POST_ONBOARDING_DOCUMENT_STATE_CONTRACT,
    onboardingSubmitted: Boolean(onboardingSubmitted),
    signingRoute,
    lifecycleStage: stage || SELLER_POST_ONBOARDING_DOCUMENT_STATES.notStarted,
    documents: [
      {
        key: 'signed_disclosure_form',
        requirementKey: 'signed_disclosure_form',
        status: onboardingSubmitted ? SELLER_POST_ONBOARDING_DOCUMENT_STATES.complete : SELLER_POST_ONBOARDING_DOCUMENT_STATES.notStarted,
        completionRoute: onboardingSubmitted ? 'seller_onboarding' : '',
      },
      {
        key: 'signed_fica_declaration',
        requirementKey: 'signed_fica_declaration',
        status: postReviewDocumentState,
        completionRoute: signingRoute,
      },
      {
        key: 'signed_mandate',
        requirementKey: 'signed_mandate',
        status: postReviewDocumentState,
        completionRoute: signingRoute,
      },
    ],
  }
}

export default buildSellerPostOnboardingDocumentState
