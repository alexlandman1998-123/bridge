// This register is an engineering control, not legal advice. A workflow stays
// fail-closed until a named legal decision is recorded and the workflow is
// explicitly enabled in a later, reviewed change.
export const SIGNING_CLASSIFICATION_STATUS = Object.freeze({
  WET_INK_REQUIRED: 'wet_ink_required',
  ACKNOWLEDGEMENT_ONLY: 'acknowledgement_only',
  LEGAL_REVIEW_REQUIRED: 'legal_review_required',
  ELECTRONIC_SIGNATURE_APPROVED: 'electronic_signature_approved',
})

export const SIGNING_CLASSIFICATION_REGISTER_VERSION = 'arch9-signing-classification-v1'

const workflow = (classification, surface, decisionOwner) => Object.freeze({
  classification,
  surface,
  decisionOwner,
  legalApprovalReference: '',
  legalApprovalDate: '',
})

export const SIGNING_CLASSIFICATION_REGISTER = Object.freeze({
  seller_mandate: workflow(
    SIGNING_CLASSIFICATION_STATUS.WET_INK_REQUIRED,
    'Seller listing mandate and associated mandate pack',
    'Legal counsel and seller-document operations',
  ),
  offer_to_purchase: workflow(
    SIGNING_CLASSIFICATION_STATUS.LEGAL_REVIEW_REQUIRED,
    'Offer to purchase, addenda, and related buyer/seller execution',
    'Legal counsel and transaction operations',
  ),
  legal_document_packet: workflow(
    SIGNING_CLASSIFICATION_STATUS.LEGAL_REVIEW_REQUIRED,
    'Legal Document Workspace, Signer Portal, and generated packet signing',
    'Legal counsel and document-platform operations',
  ),
  rental_lease: workflow(
    SIGNING_CLASSIFICATION_STATUS.LEGAL_REVIEW_REQUIRED,
    'Rental lease signing and tenancy acknowledgement',
    'Legal counsel and rental operations',
  ),
  buyer_onboarding: workflow(
    SIGNING_CLASSIFICATION_STATUS.ACKNOWLEDGEMENT_ONLY,
    'Buyer data capture, consent, and document upload',
    'Legal counsel and buyer-journey product owner',
  ),
  seller_onboarding: workflow(
    SIGNING_CLASSIFICATION_STATUS.ACKNOWLEDGEMENT_ONLY,
    'Seller data capture, consent, and document upload',
    'Legal counsel and seller-document operations',
  ),
  seller_fica_and_disclosure: workflow(
    SIGNING_CLASSIFICATION_STATUS.LEGAL_REVIEW_REQUIRED,
    'Seller FICA and disclosure declarations',
    'Legal counsel and compliance operations',
  ),
})

export const ELECTRONIC_SIGNING_CLASSIFICATION_ERROR = 'electronic_signing_not_approved'

export function getSigningWorkflowClassification(workflowKey = '') {
  return SIGNING_CLASSIFICATION_REGISTER[String(workflowKey || '').trim()] || null
}

export function isElectronicSigningApproved(workflowKey = '') {
  const entry = getSigningWorkflowClassification(workflowKey)
  return Boolean(
    entry
      && entry.classification === SIGNING_CLASSIFICATION_STATUS.ELECTRONIC_SIGNATURE_APPROVED
      && entry.legalApprovalReference
      && entry.legalApprovalDate,
  )
}

export function assertElectronicSigningApproved(workflowKey = '') {
  if (isElectronicSigningApproved(workflowKey)) return

  const entry = getSigningWorkflowClassification(workflowKey)
  const error = new Error(
    entry
      ? `Electronic signing is not approved for ${entry.surface}. Use the workflow specified by legal counsel.`
      : 'Electronic signing is not approved for an unclassified workflow. Obtain legal classification first.',
  )
  error.code = ELECTRONIC_SIGNING_CLASSIFICATION_ERROR
  error.workflowKey = String(workflowKey || '').trim()
  error.classification = entry?.classification || 'unclassified'
  throw error
}
