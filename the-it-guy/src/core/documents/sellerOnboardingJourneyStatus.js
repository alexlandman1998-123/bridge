import { readSellerOnboardingReview, SELLER_ONBOARDING_REVIEW_STATUS } from './sellerOnboardingReview.js'
import { hasCompletedOnboardingDisclosureSignature } from './sellerDocumentSigningContract.js'

const text = (value) => String(value ?? '').trim()

export function buildSellerOnboardingJourneyStatus({ formData = {}, onboardingSubmitted = false, mandateSigned = false, disclosureSigned = false, ficaSigned = false } = {}) {
  const lifecycle = formData.sellerOnboardingSigningLifecycle || formData.seller_onboarding_signing_lifecycle || {}
  const review = readSellerOnboardingReview(formData.sellerOnboardingReview || formData.seller_onboarding_review)
  const stage = text(lifecycle.stage)
  const packPrepared = ['pack_prepared', 'pack_sent', 'partially_signed', 'mandate_signed'].includes(stage)
  const packSent = ['pack_sent', 'partially_signed', 'mandate_signed'].includes(stage)
  const manualAwaitingUpload = stage === 'manual_awaiting_upload'
  // Lifecycle stages describe the historical handoff, not current signature evidence.
  const signed = mandateSigned === true
  const signedDisclosure = disclosureSigned || hasCompletedOnboardingDisclosureSignature(formData)
  const correctionRequested = review.status === SELLER_ONBOARDING_REVIEW_STATUS.correctionRequested || stage === 'correction_requested'
  const reviewed = review.status === SELLER_ONBOARDING_REVIEW_STATUS.approved || ['agent_review_approved', 'pack_prepared', 'pack_sent', 'partially_signed', 'mandate_signed'].includes(stage)
  const currentLabel = correctionRequested
    ? 'Correction requested'
    : signed
      ? 'Mandate signed'
      : manualAwaitingUpload
        ? 'Physical FICA and mandate copies ready for upload'
      : packSent
        ? 'FICA and mandate pack sent'
        : packPrepared
          ? 'FICA and mandate pack prepared'
          : reviewed
            ? 'Ready for FICA and mandate pack'
            : onboardingSubmitted
              ? 'Awaiting agent review'
              : 'Onboarding in progress'
  return {
    currentLabel,
    correctionRequested,
    review,
    steps: [
      { key: 'onboarding', label: 'Onboarding submitted', complete: onboardingSubmitted },
      { key: 'review', label: correctionRequested ? 'Correction requested' : 'Agent review approved', complete: reviewed && !correctionRequested, attention: correctionRequested },
      { key: 'pack', label: manualAwaitingUpload ? 'Physical FICA + mandate copies prepared' : 'FICA + mandate pack sent', complete: !correctionRequested && (packSent || manualAwaitingUpload) },
      { key: 'mandate', label: 'Mandate signed', complete: signed },
    ],
    documents: [
      { key: 'disclosure', label: 'Seller disclosure', status: signedDisclosure ? 'signed' : onboardingSubmitted ? 'awaiting_review' : 'not_started' },
      { key: 'fica', label: 'FICA declaration', status: correctionRequested ? 'correction_requested' : ficaSigned ? 'signed' : manualAwaitingUpload ? 'awaiting_signed_hard_copy' : packSent ? 'sent_for_signature' : reviewed ? 'ready_to_send' : 'awaiting_agent_review' },
      { key: 'mandate', label: 'Mandate', status: correctionRequested ? 'correction_requested' : signed ? 'signed' : manualAwaitingUpload ? 'awaiting_signed_hard_copy' : packSent ? 'sent_for_signature' : reviewed ? 'ready_to_send' : 'awaiting_agent_review' },
    ],
  }
}
