import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSellerSigningPlan } from '../../../lib/sellerSigningPlanModel.js'
import {
  buildSellerOnboardingAttorneyInstructionReadiness,
  createSellerOnboardingAttorneyRecommendation,
} from '../sellerOnboardingAttorneyRecommendation.js'
import { buildSellerOnboardingJourneyStatus } from '../sellerOnboardingJourneyStatus.js'
import { validateSellerOnboardingFormalSigningSelection } from '../sellerOnboardingFormalSigningPack.js'

test('operational signer matrix covers individual, co-owner, company and trust sellers', () => {
  const scenarios = [
    ['individual', { sellerName: 'John Smith', email: 'john@example.test' }, 1, 'Seller'],
    ['multiple_owners', { multipleOwners: [{ name: 'John Smith', email: 'john@example.test' }, { name: 'Jane Smith', email: 'jane@example.test' }] }, 2, 'Owner'],
    ['company', { authorisedSignatoryName: 'A Director', authorisedSignatoryEmail: 'director@example.test' }, 1, 'Authorised signatory'],
    ['trust', { authorisedTrusteeName: 'A Trustee', authorisedTrusteeEmail: 'trustee@example.test' }, 1, 'Authorised trustee'],
  ]
  for (const [sellerType, form, signerCount, role] of scenarios) {
    const plan = buildSellerSigningPlan({ sellerType, form })
    assert.equal(plan.ready, true, sellerType)
    assert.equal(plan.recipients.length, signerCount, sellerType)
    assert.equal(plan.recipients[0].role, role, sellerType)
  }
})

test('a correction supersedes the normal handoff until the onboarding is reviewed again', () => {
  const status = buildSellerOnboardingJourneyStatus({
    onboardingSubmitted: true,
    formData: { sellerOnboardingReview: { status: 'correction_requested', reason: 'Confirm title deed number' }, sellerOnboardingSigningLifecycle: { stage: 'pack_sent' } },
  })
  assert.equal(status.currentLabel, 'Correction requested')
  assert.equal(status.steps[1].attention, true)
})

test('a selected attorney remains a seller preference and cannot become an instruction before mandate signature', () => {
  const recommendation = createSellerOnboardingAttorneyRecommendation({
    partner: { id: 'partner-option-1', companyName: 'Example Conveyancers', partnerOrganisationId: 'firm-1' },
  })
  const readiness = buildSellerOnboardingAttorneyInstructionReadiness({
    recommendation: { ...recommendation, sellerConsentStatus: 'accepted' },
    mandate: { status: 'sent' },
    signing: { signers: [{ id: 'seller-1', name: 'John Smith', required: true }] },
  })
  assert.equal(readiness.status, 'awaiting_mandate_signature')
  assert.equal(readiness.canCreateAgencyInstruction, false)
})

test('rollout gate requires the distinct FICA and mandate pack', () => {
  assert.equal(validateSellerOnboardingFormalSigningSelection({ fica: true, mandate: true }).valid, true)
  assert.equal(validateSellerOnboardingFormalSigningSelection({ fica: true, mandate: false }).valid, false)
})

test('manual route agrees across the journey and document statuses', () => {
  const status = buildSellerOnboardingJourneyStatus({
    onboardingSubmitted: true,
    formData: { sellerOnboardingReview: { status: 'approved' }, sellerOnboardingSigningLifecycle: { stage: 'manual_awaiting_upload' } },
  })
  assert.equal(status.currentLabel, 'Physical FICA and mandate copies ready for upload')
  assert.deepEqual(status.documents.map((document) => document.status), ['awaiting_review', 'awaiting_signed_hard_copy', 'awaiting_signed_hard_copy'])
})

test('document signing and compliance use the same roster for every ownership route', async () => {
  const { buildSellerCompliancePortalModel } = await import('../sellerCompliancePortalModel.js')
  for (const form of [
    { ownershipType: 'married_anc', maritalRegime: 'anc', sellerFirstName: 'Alex', sellerSurname: 'Seller', email: 'alex@example.com', spouseName: 'Pat Seller', spouseEmail: 'pat@example.com' },
    { ownerEntityType: 'foreign', ownerStructureType: 'foreign_company', authorisedSignatoryName: 'Pat Director', authorisedSignatoryEmail: 'pat@example.com' },
    { ownerEntityType: 'foreign', ownerStructureType: 'foreign_trust', authorisedTrusteeName: 'Pat Trustee', authorisedTrusteeEmail: 'pat@example.com' },
    { ownershipType: 'deceased_estate', executorName: 'Pat Executor', executorEmail: 'pat@example.com' },
    { ownershipType: 'power_of_attorney', powerOfAttorneyName: 'Pat Representative', powerOfAttorneyEmail: 'pat@example.com' },
    { ownershipType: 'other', otherEntityName: 'Legal Entity', primaryContactName: 'Pat Representative', email: 'pat@example.com' },
    { ownershipType: 'multiple_owners', multipleOwners: [{ name: 'Alex', surname: 'Seller', email: 'alex@example.com' }, { name: 'Pat', surname: 'Seller', email: 'pat@example.com' }] },
  ]) {
    const plan = buildSellerSigningPlan({ sellerType: 'individual', form }) // A stale listing label cannot override the saved form.
    const compliance = buildSellerCompliancePortalModel({ formData: form })
    assert.deepEqual(plan.recipients.map(({ id, name, email }) => ({ id, name, email })), compliance.signers.map(({ id, name, email }) => ({ id, name, email })))
    assert.equal(plan.ready, true)
  }
})

test('shared email does not silently remove an owner; manual capture and digital dispatch have separate gates', () => {
  const form = { ownershipType: 'multiple_owners', multipleOwners: [{ name: 'Alex Owner', email: 'shared@example.com' }, { name: 'Pat Owner', email: 'shared@example.com' }] }
  const plan = buildSellerSigningPlan({ form })
  assert.equal(plan.recipients.length, 2)
  assert.equal(plan.manualReady, true)
  assert.equal(plan.ready, false)
  assert.match(plan.missing.join(' '), /distinct email/)
  const noEmail = buildSellerSigningPlan({ form: { ...form, multipleOwners: form.multipleOwners.map((owner) => ({ ...owner, email: '' })) } })
  assert.equal(noEmail.manualReady, true)
  assert.equal(noEmail.ready, false)
  const incomplete = buildSellerSigningPlan({ form: { ...form, multipleOwners: [form.multipleOwners[0]] } })
  assert.equal(incomplete.manualReady, false)
  assert.equal(incomplete.recipients.length, 2)
})

test('foreign individual does not acquire a spouse signer merely from foreign ownership', () => {
  const plan = buildSellerSigningPlan({ form: { ownerEntityType: 'foreign', ownerStructureType: 'foreign_individual', sellerFirstName: 'Alex', sellerSurname: 'Owner', email: 'alex@example.com', maritalStatus: 'single' } })
  assert.equal(plan.ready, true)
  assert.equal(plan.recipients.length, 1)
})
