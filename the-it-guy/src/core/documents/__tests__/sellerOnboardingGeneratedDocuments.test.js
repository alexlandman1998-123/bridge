import assert from 'node:assert/strict'
import test from 'node:test'
import { createSellerOnboardingGeneratedDocuments } from '../sellerOnboardingGeneratedDocuments.js'

test('keeps FICA and disclosure as separate completed artifacts while mandate remains outstanding', () => {
  const result = createSellerOnboardingGeneratedDocuments({ generatedAt: '2026-09-14T12:00:00.000Z' })
  assert.deepEqual(result.documents.map((document) => document.key), ['signed_fica_declaration', 'signed_disclosure_form'])
  assert.equal(result.mandate.status, 'required')
})
