export const RENTAL_LISTING_CREATE_FLOW_VERSION = 'arch9_rental_listing_create_flow_v1'

export const RENTAL_LISTING_CREATE_STEPS = Object.freeze([
  {
    key: 'property',
    label: 'Property',
    fields: ['propertyAddress', 'monthlyRent', 'availableFrom'],
  },
  {
    key: 'landlord',
    label: 'Landlord',
    fields: ['landlordName', 'landlordContact'],
  },
  {
    key: 'terms',
    label: 'Rental Terms',
    fields: ['depositAmount', 'leasePeriodMonths', 'furnishedStatus', 'petsPolicy', 'utilitiesPolicy'],
  },
  {
    key: 'readiness',
    label: 'Readiness',
    fields: ['mandateStatus', 'marketingApprovalStatus', 'inspectionStatus'],
  },
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function isFieldComplete(field, form = {}) {
  if (field === 'landlordContact') return Boolean(normalizeText(form.landlordEmail) || normalizeText(form.landlordPhone))
  if (field === 'monthlyRent' || field === 'depositAmount' || field === 'leasePeriodMonths') return Boolean(normalizeNumber(form[field]))
  return Boolean(normalizeText(form[field]))
}

export function buildRentalListingCreateProgress(form = {}) {
  const steps = RENTAL_LISTING_CREATE_STEPS.map((step) => {
    const completedFields = step.fields.filter((field) => isFieldComplete(field, form))
    return {
      ...step,
      completedCount: completedFields.length,
      totalCount: step.fields.length,
      complete: completedFields.length === step.fields.length,
    }
  })
  return {
    version: RENTAL_LISTING_CREATE_FLOW_VERSION,
    steps,
    completedSteps: steps.filter((step) => step.complete).length,
    totalSteps: steps.length,
    firstIncompleteStep: steps.find((step) => !step.complete)?.key || '',
  }
}
