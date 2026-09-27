import assert from 'node:assert/strict'
import test from 'node:test'
import { createSellerOnboardingGeneratedDocuments } from '../sellerOnboardingGeneratedDocuments.js'

test('onboarding generates a disclosure draft without marking it signed', () => {
  const result = createSellerOnboardingGeneratedDocuments({ generatedAt: '2026-09-14T12:00:00.000Z' })
  assert.deepEqual(result.documents.map((document) => document.key), ['signed_disclosure_form'])
  assert.deepEqual(result.documents.map((document) => document.status), ['awaiting_agent_review'])
  assert.equal(result.ficaDeclaration.status, 'awaiting_agent_review')
  assert.equal(result.mandate.status, 'awaiting_agent_review')
})
