export const RENTAL_APPLICANT_PORTAL_REQUIRED_DOCUMENTS = Object.freeze(['identity', 'proof_of_income'])
export const RENTAL_APPLICANT_PORTAL_REQUIRED_CONSENTS = Object.freeze(['privacy', 'credit_check', 'identity_verification'])

export function isRentalApplicantPortalReadyToSubmit({ data = {}, documents = [], consents = {} } = {}) {
  const sections = ['identity', 'employment', 'income', 'rentalHistory']
  const completedSections = sections.every((section) => Object.keys(data?.[section] || {}).length > 0)
  const suppliedDocuments = new Set((Array.isArray(documents) ? documents : []).filter((document) => ['uploaded', 'accepted'].includes(document.status)).map((document) => document.document_type))
  const acceptedConsents = RENTAL_APPLICANT_PORTAL_REQUIRED_CONSENTS.every((type) => consents?.[type] === true)
  return completedSections && RENTAL_APPLICANT_PORTAL_REQUIRED_DOCUMENTS.every((type) => suppliedDocuments.has(type)) && acceptedConsents
}
