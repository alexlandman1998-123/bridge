import test from 'node:test'
import assert from 'node:assert/strict'
import { assertListingEditorSellerOwnership } from '../listingSellerHistoricalNormalizationModel.js'

test('stale individual editor cannot overwrite a multiple-owner Seller record', () => {
  assert.throws(() => assertListingEditorSellerOwnership({ sellerType: 'individual' }, {
    sellerOnboarding: { canonicalFacts: { seller: { owner_structure_type: 'multiple_owners' } }, formData: { owners: [{}, {}] } },
  }), /Review and confirm the legal owners/)
})

test('retained owner entries also block an inconsistent individual projection', () => {
  assert.throws(() => assertListingEditorSellerOwnership({ sellerType: 'individual' }, {
    sellerOnboarding: { formData: { ownerStructureType: 'individual', owners: [{}, {}] } },
  }), /No listing changes were saved/)
})

test('checks the stored onboarding source even if the display projection chose listing facts', () => {
  assert.throws(() => assertListingEditorSellerOwnership({ sellerType: 'individual' }, {
    sellerOnboarding: {
      canonicalFacts: { seller: { owner_structure_type: 'individual' } },
      storedCanonicalFacts: { seller: { owner_structure_type: 'multiple_owners' } },
    },
  }), /Review and confirm/)
})

test('consistent single-owner and multiple-owner saves remain available', () => {
  for (const type of ['individual', 'multiple_owners']) {
    assert.doesNotThrow(() => assertListingEditorSellerOwnership({ sellerType: type }, {
      sellerOnboarding: { canonicalFacts: { seller: { owner_structure_type: type } }, formData: { owners: type === 'individual' ? [{}] : [{}, {}] } },
    }))
  }
})
