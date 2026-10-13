import assert from 'node:assert/strict'
import test from 'node:test'
import { sellerContactName, sellerOnboardingDisplayName } from '../sellerContactDetails.js'

test('captured onboarding names survive an empty mapped seller and an unconfirmed route', () => {
  for (const formData of [
    { sellerFirstName: 'Beverley', sellerSurname: 'Paynter' },
    { firstName: 'Beverley', lastName: 'Paynter' },
    { fullName: 'Beverley Paynter' },
    { sellerName: 'Beverley Paynter' },
    { primaryContactName: 'Beverley Paynter' },
  ]) {
    assert.equal(sellerOnboardingDisplayName({ seller: { name: '' }, sellerOnboarding: { formData } }), 'Beverley Paynter')
  }
})

test('current form edits and nested canonical contact facts remain visible', () => {
  const listing = { sellerOnboarding: { formData: { sellerFirstName: 'Saved', sellerSurname: 'Seller' } } }
  assert.equal(sellerOnboardingDisplayName(listing, { sellerFirstName: 'Updated', sellerSurname: 'Name' }), 'Updated Name')
  assert.equal(sellerOnboardingDisplayName({ sellerCanonicalFacts: { seller: { first_name: 'Beverley', surname: 'Paynter' } } }), 'Beverley Paynter')
  assert.equal(sellerOnboardingDisplayName({ sellerCanonicalFacts: { seller: { company_name: 'Owner Company', contact: { name: 'Beverley Paynter' } } } }), 'Beverley Paynter')
})

test('generic labels, identifiers and objects cannot hide a captured person name', () => {
  assert.equal(sellerContactName('Seller', '  Beverley Paynter  '), 'Beverley Paynter')
  assert.equal(sellerContactName('Your agent', {}, 'e44233e3-2fa1-4d63-9f3d-bb17c38f37e4', 'Kevin Croft'), 'Kevin Croft')
  assert.equal(sellerOnboardingDisplayName({ sellerName: 'Seller' }), '')
})
