import { mergeRentalApplicationData, validateRentalApplicationFields } from './rentalApplicationFieldContract.js'
export const RENTAL_APPLICATION_VERSION = 'arch9_rental_application_v1'
export const RENTAL_APPLICATION_STATUSES = Object.freeze(['draft', 'submitted', 'under_review', 'approved', 'declined', 'withdrawn'])
const text = (value) => String(value ?? '').trim()
export function createRentalApplicationDraft({ applicationId = '', organisationId = '', vacancyId = '', unitId = '', applicantPartyId = '', version = 1, data = {} } = {}) {
  if (!text(applicationId) || !text(organisationId) || !text(vacancyId) || !text(unitId) || !text(applicantPartyId)) throw new Error('Application, organisation, vacancy, unit and applicant are required.')
  return { applicationId: text(applicationId), organisationId: text(organisationId), vacancyId: text(vacancyId), unitId: text(unitId), applicantPartyId: text(applicantPartyId), version: Math.max(1, Number(version) || 1), status: 'draft', data: mergeRentalApplicationData({}, data) }
}
export function calculateRentalApplicationCompletion(application = {}) {
  const data = application.data || {}
  const sections = [
    Boolean(text(data.identity?.firstName) && text(data.identity?.lastName) && (text(data.identity?.email) || text(data.identity?.phone))),
    Boolean(text(data.employment?.employmentType)),
    Number(data.income?.monthlyIncome) > 0 || Number(data.income?.otherIncome) > 0,
    Boolean(text(data.rentalHistory?.currentAddress) && text(data.rentalHistory?.reasonForMoving)),
  ]
  const complete = sections.filter(Boolean).length
  return { complete, required: sections.length, percent: Math.round(complete / sections.length * 100), ready: validateRentalApplicationFields(data).length === 0 }
}
export function saveRentalApplicationDraft(application = {}, patch = {}) {
  if (text(application.status) !== 'draft') throw new Error('Only draft applications can be autosaved.')
  return { ...application, data: mergeRentalApplicationData(application.data, patch), version: Number(application.version || 1) + 1 }
}
