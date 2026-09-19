import assert from 'node:assert/strict'
import test from 'node:test'
import { createSellerOnboardingGeneratedDocuments } from '../sellerOnboardingGeneratedDocuments.js'

test('marks onboarding disclosure complete while FICA and mandate await agent review', () => {
  const result = createSellerOnboardingGeneratedDocuments({ generatedAt: '2026-09-14T12:00:00.000Z' })
  assert.deepEqual(result.documents.map((document) => document.key), ['signed_disclosure_form'])
  assert.deepEqual(result.documents.map((document) => document.status), ['complete'])
  assert.equal(result.ficaDeclaration.status, 'awaiting_agent_review')
  assert.equal(result.mandate.status, 'awaiting_agent_review')
})
