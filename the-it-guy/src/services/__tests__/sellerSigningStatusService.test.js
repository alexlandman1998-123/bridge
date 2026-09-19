import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSellerSigningStatusModel } from '../sellerSigningStatusService.js'

test('uses one status vocabulary across onboarding, digital, manual, and signed mandate routes', () => {
  const submitted = buildSellerSigningStatusModel({ onboardingSubmitted: true })
  assert.equal(submitted.phase, 'onboarding_submitted')
  assert.equal(submitted.disclosure.label, 'Signed in onboarding')
  assert.equal(submitted.fica.label, 'Awaiting review')
  assert.equal(submitted.mandate.label, 'Awaiting review')

  const approved = buildSellerSigningStatusModel({ onboardingSubmitted: true, onboardingReviewStatus: 'approved' })
  assert.equal(approved.fica.label, 'Ready to send')
  assert.equal(approved.mandate.label, 'Ready to send')

  const digital = buildSellerSigningStatusModel({ onboardingSubmitted: true, mandateStatus: 'sent', mandateExecutionMode: 'digital' })
  assert.equal(digital.phase, 'digital_pack_sent')
  assert.equal(digital.fica.label, 'Sent for signature')
  assert.equal(digital.mandate.label, 'Sent for signature')

  const manual = buildSellerSigningStatusModel({ onboardingSubmitted: true, mandateStatus: 'sent', mandateExecutionMode: 'manual' })
  assert.equal(manual.phase, 'manual_route')
  assert.equal(manual.fica.label, 'As applicable')
  assert.equal(manual.mandate.label, 'Awaiting signed hard copy')

  const signed = buildSellerSigningStatusModel({ onboardingSubmitted: true, mandateStatus: 'signed', ficaStatus: 'approved' })
  assert.equal(signed.phase, 'mandate_signed')
  assert.equal(signed.mandate.label, 'Signed')
  assert.equal(signed.fica.label, 'Complete')
})
