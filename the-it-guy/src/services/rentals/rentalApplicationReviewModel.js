import { rentalApplicationSavedDocumentSlots, isRentalEntityApplicant, rentalPrimaryNeedsIncome, rentalApplicationDocumentForSlot } from './rentalApplicationWizardModel.js'
const sameSubmission = (a, b) => Boolean(a && b && Date.parse(a) === Date.parse(b))
export const rentalReviewResultPassed = (result, submittedAt, today = new Date().toISOString().slice(0, 10)) => Boolean(result?.status === 'passed' && result.reviewedBy && result.evidenceNote?.trim() && sameSubmission(result.submissionAt, submittedAt) && (!result.expiresAt || result.expiresAt >= today))
export const RENTAL_REVIEW_CHECKS = ['identity', 'fica', 'affordability', 'employment', 'reference']
export const RENTAL_REVIEW_CONSENTS = ['privacy', 'credit_check', 'identity_verification']
export const rentalApplicationIsReviewable = (application) => ['submitted', 'under_review'].includes(application?.status)
export function rentalReviewSubjects(data = {}, checkType) {
  const primary = { id: 'primary', name: [data.identity?.firstName, data.identity?.lastName].filter(Boolean).join(' ') || 'Primary applicant' }
  const entity = { id: 'entity', name: data.entity?.legalName || 'Applicant entity' }
  const people = (data.people || []).filter((person) => {
    if (['identity', 'fica'].includes(checkType)) return true
    if (checkType === 'reference') return ['co_tenant', 'guarantor'].includes(person.role)
    return person.role === 'guarantor' || person.contributesToAffordability === true
  }).map((person) => ({ id: person.id, name: [person.firstName, person.lastName].filter(Boolean).join(' ') || person.role }))
  const ownFinancialReview = isRentalEntityApplicant(data) || !['affordability', 'employment'].includes(checkType) || rentalPrimaryNeedsIncome(data)
  const applicant = isRentalEntityApplicant(data) && !['identity', 'fica'].includes(checkType) ? entity : primary
  return [...(ownFinancialReview ? [applicant] : []), ...people]
}
export function rentalReviewDocument(slot, application) {
  const current = rentalApplicationSavedDocumentSlots(application.data, application.requirements).find((item) => item.key === slot.key) || slot
  return rentalApplicationDocumentForSlot(current, application.documents || [], application.data || {})
}
export function rentalApplicationApprovalReadiness(application, checks = [], today = new Date().toISOString().slice(0, 10)) {
  const blockers = []
  if (!rentalApplicationIsReviewable(application)) blockers.push('Submit the application before review.')
  for (const slot of rentalApplicationSavedDocumentSlots(application.data, application.requirements).filter((item) => item.required)) {
    if (slot.saved ? slot.state !== 'accepted' || (slot.expiresAt && Date.parse(slot.expiresAt) <= Date.now()) : rentalReviewDocument(slot, application)?.status !== 'accepted') blockers.push(`Accept ${slot.title.toLowerCase()}.`)
  }
  for (const type of RENTAL_REVIEW_CONSENTS) {
    const valid = (application.consents || []).some((consent) => consent.type === type && consent.source === 'applicant' && consent.evidence?.accepted === true && (application.data?.schemaVersion !== 'arch9_rental_application_fields_v2' || consent.evidence?.declarationAccepted === true) && sameSubmission(consent.evidence?.submitted_at, application.submittedAt))
    if (!valid) blockers.push(`Current applicant consent required: ${type.replaceAll('_', ' ')}.`)
  }
  for (const checkType of RENTAL_REVIEW_CHECKS) {
    const row = checks.find((item) => item.checkType === checkType)
    for (const subject of rentalReviewSubjects(application.data, checkType)) {
      const result = row?.result?.subjects?.[subject.id]
      if (!rentalReviewResultPassed(result, application.submittedAt, today)) blockers.push(`${subject.name}: ${checkType.replaceAll('_', ' ')} review outstanding or expired.`)
    }
  }
  const landlord = application.data?.review?.landlordDecision
  if (landlord?.outcome !== 'approved' || !sameSubmission(landlord.submissionAt, application.submittedAt) || !landlord.recordedBy) blockers.push('Record the landlord’s approval for this submission.')
  return { blockers, ready: blockers.length === 0 }
}
