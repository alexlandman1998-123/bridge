import { rentalApplicationDocumentSlots, rentalApplicationDocumentForSlot } from './rentalApplicationWizardModel.js'
import { RENTAL_APPLICATION_SCHEMA_VERSION } from './rentalApplicationFieldContract.js'
import { validateRentalApplicationFields } from './rentalApplicationFieldContract.js'
export const RENTAL_APPLICANT_PORTAL_REQUIRED_DOCUMENTS = Object.freeze(['identity', 'proof_of_income'])
export const RENTAL_APPLICANT_PORTAL_REQUIRED_CONSENTS = Object.freeze(['privacy', 'credit_check', 'identity_verification'])

export function isRentalApplicantPortalReadyToSubmit({ data = {}, documents = [], consents = {} } = {}) {
  const completedSections = validateRentalApplicationFields(data).length === 0
  const suppliedDocuments = new Set((Array.isArray(documents) ? documents : []).filter((document) => ['uploaded', 'accepted'].includes(document.status)).map((document) => document.document_type))
  const acceptedConsents = RENTAL_APPLICANT_PORTAL_REQUIRED_CONSENTS.every((type) => consents?.[type] === true)
  const scenarioDocuments = data.schemaVersion !== RENTAL_APPLICATION_SCHEMA_VERSION || rentalApplicationDocumentSlots(data).filter((slot) => slot.required).every((slot) => rentalApplicationDocumentForSlot(slot, documents, data))
  return completedSections && scenarioDocuments && RENTAL_APPLICANT_PORTAL_REQUIRED_DOCUMENTS.every((type) => suppliedDocuments.has(type)) && acceptedConsents
}
