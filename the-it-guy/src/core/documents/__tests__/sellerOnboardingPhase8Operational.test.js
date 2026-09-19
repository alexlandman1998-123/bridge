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
  assert.deepEqual(status.documents.map((document) => document.status), ['signed_in_onboarding', 'awaiting_signed_hard_copy', 'awaiting_signed_hard_copy'])
})
