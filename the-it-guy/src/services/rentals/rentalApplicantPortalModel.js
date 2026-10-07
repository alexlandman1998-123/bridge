import { rentalApplicationDocumentProgress } from './rentalApplicationWizardModel.js'
import { validateRentalApplicationFields } from './rentalApplicationFieldContract.js'
export const RENTAL_APPLICANT_PORTAL_REQUIRED_DOCUMENTS = Object.freeze(['identity', 'proof_of_income'])
export const RENTAL_APPLICANT_PORTAL_REQUIRED_CONSENTS = Object.freeze(['privacy', 'credit_check', 'identity_verification'])

// Submission captures answers and permissions. Collection and approval are separate gates.
export function isRentalApplicantPortalReadyToSubmit({ data = {}, consents = {} } = {}) {
  return validateRentalApplicationFields(data).length === 0 && RENTAL_APPLICANT_PORTAL_REQUIRED_CONSENTS.every((type) => consents?.[type] === true)
}
export function rentalApplicationReadinessStages(application = {}, reviewReady = false) {
  const detailsComplete = validateRentalApplicationFields(application.data || {}).length === 0
  const documents = rentalApplicationDocumentProgress(application)
  const submitted = application.status && application.status !== 'draft'
  return { details: submitted ? 'Submitted' : detailsComplete ? 'Complete — awaiting submission' : 'Incomplete', documents, review: ['approved', 'declined', 'withdrawn'].includes(application.status) ? application.status[0].toUpperCase() + application.status.slice(1) : reviewReady ? 'Ready for decision' : documents.uploaded < documents.required || documents.required === 0 ? 'Awaiting documents' : 'Checks and document review outstanding' }
}
