import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDocumentOutcomeFeedback } from '../documentOutcomeFeedback.js'

test('turns document dispatch into a clear signing outcome', () => {
  const model = buildDocumentOutcomeFeedback({ message: 'Document sent for signature workflow.' })
  assert.equal(model.category, 'sent')
  assert.match(model.nextStep, /Track signer progress/)
})

test('distinguishes generation, follow-up and final-record outcomes', () => {
  assert.equal(buildDocumentOutcomeFeedback({ message: 'Mandate generated successfully.' }).category, 'generated')
  assert.equal(buildDocumentOutcomeFeedback({ message: 'Reminder sent to seller using the current secure link.' }).category, 'follow_up')
  assert.equal(buildDocumentOutcomeFeedback({ message: 'Final signed document archived and locked as immutable legal record.' }).category, 'completed')
})

test('gives a signer the correct remaining-field next step', () => {
  const model = buildDocumentOutcomeFeedback({ surface: 'signer_portal', message: 'Signature applied to page 3.', remainingFields: 2 })
  assert.equal(model.category, 'signer_field')
  assert.match(model.nextStep, /2 required fields remaining/)
})

test('gives a completed signer a safe terminal next step', () => {
  const model = buildDocumentOutcomeFeedback({ surface: 'signer_portal', message: 'Signing submitted. All required fields were securely recorded.' })
  assert.equal(model.category, 'signer_complete')
  assert.match(model.nextStep, /safely close this page/i)
})

test('does not present retry failures as success', () => {
  const model = buildDocumentOutcomeFeedback({ message: 'The signed PDF needs attention. Please retry.' })
  assert.equal(model.tone, 'attention')
})

test('removes token-like values and URLs from displayed outcomes', () => {
  const model = buildDocumentOutcomeFeedback({ message: 'Saved token=secret https://example.test/private' })
  assert.doesNotMatch(model.message, /secret|https|example\.test/)
})

test('returns no notice without a user-facing outcome', () => {
  assert.equal(buildDocumentOutcomeFeedback(), null)
})
