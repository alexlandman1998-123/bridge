import assert from 'node:assert/strict'
import test from 'node:test'

import { needsSellerOwnershipSetup, resolveSellerInformationEditMode } from '../sellerOwnershipSetupRouting.js'

test('routes unresolved legal ownership blockers to the ownership setup editor', () => {
  const sellerSubject = { onboardingReady: false, requiredSetupFields: ['Company registration number'] }

  assert.equal(needsSellerOwnershipSetup({ sellerSubject }), true)
  assert.equal(resolveSellerInformationEditMode({ sellerSubject }), 'profile')
})

test('keeps ordinary FICA address corrections in the address editor', () => {
  assert.equal(resolveSellerInformationEditMode({ missingFields: ['Residential / registered address'] }), 'address')
  assert.equal(resolveSellerInformationEditMode({ missingFields: ['Nationality'] }), 'personal')
})
