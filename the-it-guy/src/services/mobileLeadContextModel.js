import { isRentalCrmLead, getRentalCrmLeadMetadata } from './rentals/rentalCrmLeadModel.js'
import { TENANT_QUESTIONS, tenantQualificationValues, tenantQualificationProgress } from './rentals/rentalTenantWorkspaceModel.js'
import { buildBuyerQualificationIntake, BUYER_INTAKE_QUALIFICATION_FIELDS, getBuyerQualificationReadiness } from './buyerIntakeModel.js'

export function getMobileBuyerQualification(lead = {}) {
  if (isRentalCrmLead(lead)) {
    const metadata = getRentalCrmLeadMetadata(lead)
    const answers = tenantQualificationValues(metadata)
    const progress = tenantQualificationProgress(metadata)
    const submittedAt = metadata.qualification?.submittedAt || ''
    return { kind: 'tenant', status: submittedAt ? 'Submitted' : progress.count ? 'In progress' : 'Not submitted', submittedAt, captured: progress.count, viewing: metadata.viewingRequest || {},
      rows: TENANT_QUESTIONS.map(({ key, label }) => ({ key, label, value: answers[key] === true ? 'Yes' : answers[key] === false ? 'No' : String(answers[key] ?? '').trim() || 'Not captured' })) }
  }
  // The same canonical intake and legacy qualification notes used on desktop.
  // General lead budget/area fields alone are not qualification evidence.
  const intake = buildBuyerQualificationIntake({}, { notes: lead.notes || '' })
  const qualification = intake.qualification || {}
  const answers = qualification.answers || {}
  const readiness = getBuyerQualificationReadiness(answers)
  const captured = BUYER_INTAKE_QUALIFICATION_FIELDS.filter(({ key }) => String(answers[key] || '').trim()).length
  const submittedAt = captured ? intake.viewing?.respondedAt || qualification.qualifiedAt || '' : ''
  return {
    status: submittedAt ? 'Submitted' : readiness.complete ? 'Captured' : captured ? 'In progress' : 'Not submitted',
    submittedAt,
    captured,
    rows: BUYER_INTAKE_QUALIFICATION_FIELDS
      .filter(({ key }) => String(answers.financeType || '').toLowerCase() !== 'cash' || !['subjectToFinance', 'preApprovalStatus'].includes(key))
      .map(({ key, label }) => ({ key, label, value: String(answers[key] || '').trim() || 'Not captured' })),
    viewing: intake.viewing || {},
  }
}

export function getMobileEnquiryListing(lead = {}, listing = null) {
  const price = Number(listing?.askingPrice || lead.enquiredPropertyPrice || 0)
  return {
    address: listing?.propertyAddress || lead.enquiredPropertyAddress || lead.enquiredPropertyTitle || lead.propertyInterest || 'Listing details not captured',
    location: [listing?.suburb, listing?.city].filter(Boolean).join(', '),
    price: Number.isFinite(price) && price > 0 ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(price) : 'Price not available',
    rental: /rent|lease/i.test(`${listing?.listingCategory || ''} ${listing?.listingType || ''}`),
  }
}
