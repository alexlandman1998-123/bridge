import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerOnboardingReviewChecklist, recordSellerOnboardingReview, SELLER_ONBOARDING_REVIEW_STATUS } from '../sellerOnboardingReview.js'
import { buildListingSellerProfileCapturePayload } from '../../../lib/listingSellerProfileBuilderModel.js'
import { buildSellerSubject } from '../../../lib/sellerSubjectModel.js'

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
  assert.ok(ready.followUps.some((item) => /disclosure.*Documents/i.test(item)))

  const missing = buildSellerOnboardingReviewChecklist({ formData: { ...completeForm, sourceOfFunds: '', politicallyExposedPerson: '' } })
  assert.equal(missing.ready, false)
  assert.ok(missing.missing.includes('Source of funds / wealth'))
  assert.ok(missing.missing.includes('Political exposure declaration'))
})

test('property costs and utilities are follow-ups, not document approval blockers', () => {
  const checklist = buildSellerOnboardingReviewChecklist({ formData: { ...completeForm, levies: '', leviesNotApplicable: false, waterBillingType: '' } })
  assert.equal(checklist.ready, true)
  assert.deepEqual(checklist.missing, [])
  assert.ok(checklist.followUps.some(item => /levies/.test(item)))
  assert.ok(checklist.followUps.some(item => /water billing/.test(item)))
})

test('old manual capture with a selected route is recognised despite retained pending flags', () => {
  const checklist = buildSellerOnboardingReviewChecklist({ formData: {
    ...completeForm,
    ownershipRouteConfirmed: false,
    ownershipDeclarationPending: true,
    sellerProfileCaptureSource: 'listing_seller_profile_capture',
  } })
  assert.equal(checklist.ready, true)
  assert.equal(checklist.subject.kind, 'individual')
  assert.equal(checklist.subject.legalOwner.name, 'Jane Smith')
})

test('new manual capture clears pending ownership and persists confirmation into canonical facts', () => {
  const payload = buildListingSellerProfileCapturePayload({ branch: 'individual', sellerFirstName: 'Jane', sellerSurname: 'Smith', email: 'jane@example.com' }, {}, {
    existingFormData: { ownershipDeclarationPending: true, ownership_declaration_pending: true }, draft: true,
  })
  assert.equal(payload.formPatch.ownershipRouteConfirmed, true)
  assert.equal(payload.formPatch.ownershipDeclarationPending, false)
  assert.equal(payload.canonicalSellerFacts.seller.ownership_route_confirmed, true)
  assert.equal(payload.canonicalSellerFacts.seller.ownership_declaration_pending, false)
  const roundTrip = buildSellerSubject({ canonicalFacts: JSON.parse(JSON.stringify(payload.canonicalSellerFacts)) })
  assert.equal(roundTrip.kind, 'individual')
  assert.equal(roundTrip.legalOwner.name, 'Jane Smith')
})

test('link onboarding confirmation supersedes an old pending flag without trusting an unconfirmed default', () => {
  const confirmed = buildSellerOnboardingReviewChecklist({ formData: { ...completeForm, ownershipDeclarationPending: true }, listing: { sellerOnboarding: { status: 'completed' } } })
  assert.equal(confirmed.ready, true)
  assert.equal(confirmed.subject.legalOwner.name, 'Jane Smith')
  const unconfirmed = buildSellerOnboardingReviewChecklist({ formData: { ...completeForm, ownershipRouteConfirmed: false, ownershipDeclarationPending: true } })
  assert.ok(unconfirmed.missing.includes('Ownership route'))
  assert.ok(unconfirmed.missing.includes('Legal owner'))
  const emptyCapture = buildListingSellerProfileCapturePayload({ branch: '' }, {}, { draft: true })
  assert.equal(buildSellerSubject({ formData: emptyCapture.formPatch, canonicalFacts: emptyCapture.canonicalSellerFacts }).kind, 'unknown')
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
