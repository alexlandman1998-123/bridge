import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerOnboardingReviewChecklist, recordSellerOnboardingReview, SELLER_ONBOARDING_REVIEW_STATUS } from '../sellerOnboardingReview.js'

const completeForm = {
  sellerFirstName: 'Jane', sellerSurname: 'Smith', email: 'jane@example.com', phone: '0820000000',
  sellerTaxNumber: '12345', saResident: 'yes', popiConsentAccepted: true,
  ownerEntityType: 'natural_person', ownerStructureType: 'individual', ownershipType: 'individual', ownershipRouteConfirmed: true,
  idNumber: '8001015009087', dateOfBirth: '1980-01-01', nationality: 'South African', residentialAddress: '1 Main Road', maritalStatus: 'single',
  propertyAddress: '1 Main Road', suburb: 'Sandton', city: 'Johannesburg', province: 'Gauteng',
  propertyCategory: 'residential', propertyStructureType: 'full_title', propertyType: 'house',
  ratesTaxes: '1000', leviesNotApplicable: true, waterBillingType: 'municipal', mandateType: 'sole',
  occupation: 'Teacher', sourceOfFunds: 'Salary', politicallyExposedPerson: 'no',
}

test('agent checklist blocks missing submitted facts and separates later evidence follow-up', () => {
  const ready = buildSellerOnboardingReviewChecklist({ formData: completeForm })
  assert.equal(ready.ready, true)
  assert.deepEqual(ready.missing, [])
  assert.ok(ready.followUps.some((item) => item.includes('Property Disclosure')))

  const missing = buildSellerOnboardingReviewChecklist({ formData: { ...completeForm, sourceOfFunds: '', politicallyExposedPerson: '' } })
  assert.equal(missing.ready, false)
  assert.ok(missing.missing.includes('Source of funds / wealth'))
  assert.ok(missing.missing.includes('Political exposure declaration'))
})

test('records agent approval and correction requests as an append-only review history', () => {
  const approved = recordSellerOnboardingReview({ status: SELLER_ONBOARDING_REVIEW_STATUS.approved, actor: 'agent-1', at: '2026-09-19T10:00:00.000Z' })
  const returned = recordSellerOnboardingReview({ existing: approved, status: SELLER_ONBOARDING_REVIEW_STATUS.correctionRequested, reason: 'Please confirm the electrical disclosure.', actor: 'agent-1', at: '2026-09-19T10:05:00.000Z' })
  assert.equal(returned.status, 'correction_requested')
  assert.equal(returned.history.length, 2)
  assert.equal(returned.history[0].status, 'approved')
})

test('requires a reason before returning onboarding for correction', () => {
  assert.throws(() => recordSellerOnboardingReview({ status: SELLER_ONBOARDING_REVIEW_STATUS.correctionRequested }), /reason is required/)
})
