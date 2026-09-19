import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSellerOnboardingFormalSigningSelection, validateSellerOnboardingFormalSigningSelection } from '../sellerOnboardingFormalSigningPack.js'

test('the post-review signing pack contains FICA and mandate, never the already signed disclosure', () => {
  assert.deepEqual(normalizeSellerOnboardingFormalSigningSelection({ disclosure: true, fica: true, mandate: true }), {
    disclosure: false,
    fica: true,
    mandate: true,
  })
  assert.deepEqual(validateSellerOnboardingFormalSigningSelection({ fica: true, mandate: true }), {
    contract: 'arch9-seller-onboarding-formal-signing-pack-v1',
    valid: true,
    selectedDocuments: ['fica', 'mandate'],
    missing: [],
  })
})

test('does not allow a mandate-only post-review signing pack', () => {
  assert.deepEqual(validateSellerOnboardingFormalSigningSelection({ mandate: true }).missing, ['fica'])
})
