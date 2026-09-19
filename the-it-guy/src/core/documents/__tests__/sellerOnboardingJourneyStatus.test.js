import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerOnboardingJourneyStatus } from '../sellerOnboardingJourneyStatus.js'

test('keeps signed disclosure separate while showing the FICA and mandate pack as sent', () => {
  const status = buildSellerOnboardingJourneyStatus({
    onboardingSubmitted: true,
    formData: { sellerOnboardingReview: { status: 'approved' }, sellerOnboardingSigningLifecycle: { stage: 'pack_sent' } },
  })
  assert.equal(status.currentLabel, 'FICA and mandate pack sent')
  assert.deepEqual(status.documents.map((document) => document.status), ['signed_in_onboarding', 'sent_for_signature', 'sent_for_signature'])
})

test('shows correction requested ahead of later signing steps', () => {
  const status = buildSellerOnboardingJourneyStatus({ onboardingSubmitted: true, formData: { sellerOnboardingReview: { status: 'correction_requested', reason: 'Confirm address' } } })
  assert.equal(status.currentLabel, 'Correction requested')
  assert.equal(status.steps[1].attention, true)
})
