import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSellerOnboardingJourneyStatus } from '../src/core/documents/sellerOnboardingJourneyStatus.js'
import { buildSellerPostOnboardingDocumentState } from '../src/core/documents/sellerPostOnboardingDocumentState.js'
import { createSellerOnboardingFormalPackDispatch } from '../src/core/documents/sellerOnboardingFormalPackDispatch.js'

const manualForm = {
  mandateSignatureRoute: 'manual_upload',
  sellerOnboardingReview: { status: 'approved' },
  sellerOnboardingSigningLifecycle: { stage: 'manual_awaiting_upload' },
}
assert.deepEqual(
  buildSellerPostOnboardingDocumentState({ onboardingSubmitted: true, formData: manualForm }).documents.map((document) => document.status),
  ['complete', 'awaiting_signed_hard_copy', 'awaiting_signed_hard_copy'],
)
assert.deepEqual(
  buildSellerOnboardingJourneyStatus({ onboardingSubmitted: true, formData: manualForm }).documents.map((document) => document.status),
  ['signed_in_onboarding', 'awaiting_signed_hard_copy', 'awaiting_signed_hard_copy'],
)

const dispatch = createSellerOnboardingFormalPackDispatch({
  formalPackApproval: { status: 'approved' }, selectedDocuments: ['fica', 'mandate'],
  response: { delivery: 'sent', signingGroupId: 'group-1', signingLinks: [{ signerEmail: 'seller@example.test', delivery: 'sent', signingLink: 'do-not-store-this' }] },
})
assert.equal(dispatch.status, 'sent')
assert.equal(JSON.stringify(dispatch).includes('do-not-store-this'), false)

const documentsSource = readFileSync(new URL('../src/services/sellerDocumentRequirementsService.js', import.meta.url), 'utf8')
assert.match(documentsSource, /seller_onboarding\.manual_signing_pack/)
assert.match(documentsSource, /correction_requested/)
const readinessSource = readFileSync(new URL('../src/lib/sellerDocumentReleaseReadiness.js', import.meta.url), 'utf8')
assert.match(readinessSource, /scoped canary certification/)
assert.match(readinessSource, /releaseRecommended/)
console.log('seller onboarding signing Phase 8 regression and controlled-rollout checks passed')
