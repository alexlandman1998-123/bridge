import {
  PROPERTY_DISCLOSURE_QUESTIONS,
  getPropertyDisclosureStatus,
  normalizePropertyDisclosure,
} from './propertyDisclosure.js'

// Capture is not a seller attestation. Once any seller has signed, preserve the
// original questionnaire and its evidence, including older disclosure formats.
export function isSellerDisclosureCaptureLocked(formData = {}) {
  const disclosure = formData.propertyDisclosure || formData.property_disclosure || {}
  const signers = formData.sellerComplianceSigners || formData.seller_compliance_signers || formData.sellerComplianceSigning?.signers || formData.seller_compliance_signing?.signers || []
  const snapshot = formData.sellerOnboardingDisclosureSnapshot || formData.seller_onboarding_disclosure_snapshot || {}
  return Boolean(
    disclosure.signature || disclosure.sellerSignature || disclosure.seller_signature ||
    disclosure.signedAt || disclosure.signed_at || disclosure.lockedSnapshot ||
    disclosure.uploadedDocumentReviewed || disclosure.uploaded_document_reviewed ||
    snapshot.disclosure?.signature || snapshot.disclosure?.sellerSignature ||
    (Array.isArray(signers) && signers.some((signer) => signer.signature?.value || (typeof signer.signature === 'string' && signer.signature) || signer.signatureValue || signer.signature_value || signer.signedAt || signer.signed_at)),
  )
}

export function getSellerDisclosureQuestionMissing(disclosure = {}) {
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosure.kind || 'residential' })
  const unanswered = PROPERTY_DISCLOSURE_QUESTIONS.filter((question) => !normalized.responses[question.key]?.answer)
  return unanswered.length ? [`Answer all Annexure A questions (${unanswered.length} remaining).`] : []
}

export function buildSellerAgentAssistedDisclosurePatch({
  disclosure = {}, existingFormData = {}, capturedBy = '', capturedAt = new Date().toISOString(), draft = false,
} = {}) {
  if (isSellerDisclosureCaptureLocked(existingFormData)) {
    return {
      propertyDisclosure: existingFormData.propertyDisclosure || existingFormData.property_disclosure,
      propertyDisclosureStatus: existingFormData.propertyDisclosureStatus || getPropertyDisclosureStatus(existingFormData.propertyDisclosure || existingFormData.property_disclosure),
    }
  }
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosure.kind || 'residential' })
  // Only questionnaire data can cross the assisted-capture boundary. Never copy
  // a signature, declaration, acknowledgements or a stale generated document.
  const captured = normalizePropertyDisclosure({
    version: normalized.version, kind: normalized.kind, responses: normalized.responses,
    issues: normalized.issues, remoteControlsQuantity: normalized.remoteControlsQuantity,
    comments: normalized.comments, otherDisclosure: normalized.otherDisclosure,
  }, { kind: normalized.kind })
  return {
    propertyDisclosure: captured,
    propertyDisclosureStatus: getPropertyDisclosureStatus(captured),
    sellerDisclosureCapture: {
      mode: 'agent_assisted', status: draft ? 'draft' : 'awaiting_seller_review_and_signature',
      capturedBy, capturedAt,
    },
  }
}
