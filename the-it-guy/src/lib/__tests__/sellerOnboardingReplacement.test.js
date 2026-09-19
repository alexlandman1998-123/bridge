import assert from 'node:assert/strict'
import test from 'node:test'

import { needsSellerOnboardingReplacement } from '../sellerOnboardingReplacement.js'

test('requires a replacement link when a live onboarding legal route changes', () => {
  assert.equal(needsSellerOnboardingReplacement({
    previousFormData: { sellerOwnershipRoute: 'individual' },
    nextFormData: { sellerOwnershipRoute: 'company' },
    onboardingStatus: 'sent',
    onboardingToken: 'live-token',
  }), true)
})

test('does not replace a submitted pack or a route that has not changed', () => {
  assert.equal(needsSellerOnboardingReplacement({
    previousFormData: { sellerOwnershipRoute: 'individual' },
    nextFormData: { sellerOwnershipRoute: 'company' },
    onboardingStatus: 'completed',
    onboardingToken: 'live-token',
  }), false)
  assert.equal(needsSellerOnboardingReplacement({
    previousFormData: { sellerOwnershipRoute: 'company' },
    nextFormData: { sellerOwnershipRoute: 'company' },
    onboardingStatus: 'sent',
    onboardingToken: 'live-token',
  }), false)
})
