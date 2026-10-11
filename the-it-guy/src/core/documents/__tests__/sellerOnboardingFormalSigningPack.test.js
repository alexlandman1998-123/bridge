import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSellerOnboardingFormalSigningSelection, validateSellerOnboardingFormalSigningSelection } from '../sellerOnboardingFormalSigningPack.js'

test('every document may be prepared independently after information review', () => {
  for (const key of ['mandate', 'disclosure', 'fica']) {
    const selection = { [key]: true }
    const result = validateSellerOnboardingFormalSigningSelection(selection)
    assert.equal(result.valid, true)
    assert.deepEqual(result.selectedDocuments, [key])
    assert.deepEqual(result.missing, [])
  }
  assert.deepEqual(normalizeSellerOnboardingFormalSigningSelection({ disclosure: true, fica: true, mandate: true }), { disclosure: true, fica: true, mandate: true })
  assert.equal(validateSellerOnboardingFormalSigningSelection({}).valid, false)
})

test('an agency mandate remains a separate upload without forcing FICA generation', () => {
  for (const selection of [{ fica: true }, { disclosure: true }]) assert.equal(validateSellerOnboardingFormalSigningSelection(selection, { mandateSource: 'agency_upload' }).valid, true)
  assert.equal(validateSellerOnboardingFormalSigningSelection({ mandate: true }, { mandateSource: 'agency_upload' }).valid, false)
  assert.equal(validateSellerOnboardingFormalSigningSelection({}, { mandateSource: 'agency_upload' }).valid, false)
})
