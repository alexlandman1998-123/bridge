import { rentalReviewResultPassed, rentalReviewSubjects } from './rentalApplicationReviewModel.js'
import { tenantQualificationProgress } from './rentalTenantWorkspaceModel.js'

const text = (value) => String(value ?? '').trim()
const key = (value) => text(value).toLowerCase()

export function findLeadViewing(lead, viewings = [], { attended = false } = {}) {
  return (Array.isArray(viewings) ? viewings : []).find((viewing) =>
    text(viewing.tenantLeadId) === text(lead.id) && text(viewing.id) && text(viewing.startsAt)
      && (attended ? key(viewing.outcome) === 'attended' : ['', 'attended'].includes(key(viewing.outcome)))) || null
}

export function findSubmittedLeadApplication(lead, applications = []) {
  return (Array.isArray(applications) ? applications : []).find((application) =>
    text(application.leadId) === text(lead.id) && text(application.id)
      && (!lead.relationships?.applicationId || text(application.id) === text(lead.relationships.applicationId))
      && (!lead.relationships?.vacancyId || text(application.vacancyId) === text(lead.relationships.vacancyId))
      && (!lead.relationships?.unitId || text(application.unitId) === text(lead.relationships.unitId))
      && ['submitted', 'under_review', 'approved'].includes(key(application.status))) || null
}

export function findLeadMandate(lead, mandates = [], propertyId = '', organisationId = '') {
  return (Array.isArray(mandates) ? mandates : []).find((mandate) => {
    const metadata = mandate.raw?.metadata_json || {}
    return text(mandate.id) && text(mandate.propertyId) === text(propertyId)
      && (!text(organisationId) || text(mandate.organisationId) === text(organisationId))
      && text(metadata.leadId) === text(lead.id)
      && key(mandate.mandateStatus) === 'active'
      && key(mandate.authorityStatus) === 'confirmed'
      && text(metadata.signedEvidenceReference) && text(metadata.signedAt)
  }) || null
}

export function requireRentalLeadHandoff(lead, toStage, records = {}) {
  if (toStage === 'qualified') {
    const progress = tenantQualificationProgress(lead)
    if (progress.count !== progress.total) throw new Error('Save the complete tenant qualification answers before marking the tenant qualified.')
    return { evidence: { qualificationComplete: true }, relationships: {} }
  }
  if (toStage === 'viewing_scheduled' || toStage === 'viewing_completed') {
    const viewing = findLeadViewing(lead, records.viewings, { attended: toStage === 'viewing_completed' })
    if (!viewing) throw new Error(toStage === 'viewing_completed'
      ? 'Record an attended viewing in Viewings before advancing this lead.'
      : 'Schedule a viewing in Viewings before advancing this lead.')
    return { evidence: { scheduledFor: viewing.startsAt, viewingOutcome: viewing.outcome, viewingId: viewing.id }, relationships: {} }
  }
  if (['application_submitted', 'screening_pending', 'fica_pending', 'fica_complete', 'placement_ready'].includes(toStage)) {
    const applications = (records.applications || []).filter((application) => !records.organisationId || text(application.organisationId) === text(records.organisationId))
    const application = findSubmittedLeadApplication(lead, applications)
    if (!application) throw new Error('The linked applicant must submit the application before this lead can advance.')
    const checkTypes = toStage === 'fica_pending' ? ['identity', 'affordability', 'employment', 'reference'] : toStage === 'fica_complete' ? ['fica'] : []
    for (const checkType of checkTypes) {
      const check = (records.checks || []).find((item) => item.checkType === checkType && text(item.applicationId) === text(application.id))
      for (const subject of rentalReviewSubjects(application.data, checkType)) {
        if (!rentalReviewResultPassed(check?.result?.subjects?.[subject.id], application.submittedAt)) {
          throw new Error(`Complete the current ${checkType.replaceAll('_', ' ')} review in the linked application before advancing this lead.`)
        }
      }
    }
    if (toStage === 'placement_ready' && application.status !== 'approved') throw new Error('Approve the linked application before confirming placement readiness.')
    return { evidence: { applicationReference: application.id, ...(toStage === 'fica_complete' ? { ficaReference: `Application ${application.id}: FICA review` } : {}), applicationStatus: application.status, submissionAt: application.submittedAt || null, reviewCheckIds: (records.checks || []).filter((item) => checkTypes.includes(item.checkType)).map((item) => item.id) }, relationships: { applicationId: application.id, vacancyId: application.vacancyId, unitId: application.unitId } }
  }
  if (toStage === 'mandate_signed' || toStage === 'listing_ready') {
    const mandate = findLeadMandate(lead, records.mandates, records.propertyId, records.organisationId)
    if (!mandate) throw new Error('Record a signed mandate for this lead and property before advancing.')
    return { evidence: { mandateReference: mandate.raw.metadata_json.signedEvidenceReference, signedAt: mandate.raw.metadata_json.signedAt }, relationships: { propertyId: mandate.propertyId, mandateId: mandate.id } }
  }
  if (toStage === 'listing_created') {
    const listingId = text(lead.relationships?.listingId)
    const listing = records.listing
    if (!listingId || text(listing?.id) !== listingId || text(listing?.organisationId || listing?.organisation_id) !== text(records.organisationId)) {
      throw new Error('Create and link a saved rental listing before advancing this landlord lead.')
    }
    return { evidence: { listingId }, relationships: { listingId } }
  }
  return { evidence: {}, relationships: {} }
}
