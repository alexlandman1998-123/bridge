import test from 'node:test'
import assert from 'node:assert/strict'
import { isFinalCompletionReady, normalizeFinalCompletionState } from '../finalCompletionTruth.js'

test('downgrades contradictory completed-everywhere status when delivery is pending', () => {
  const result = normalizeFinalCompletionState({
    ready: true,
    stage: 'completed_everywhere',
    deliveryReady: false,
    deliveryStage: 'recipient_delivery_pending',
    retryable: false,
    finalArtifactPath: 'signed/final.pdf',
    transactionDocumentId: 'document-1',
    recipientCount: 2,
    deliveredRecipientCount: 0,
  })
  assert.equal(result.ready, false)
  assert.equal(result.stage, 'awaiting_recipient_delivery')
  assert.equal(result.retryable, true)
  assert.equal(result.deliveryReady, false)
  assert.equal(result.recipientCount, 2)
  assert.equal(result.deliveredRecipientCount, 0)
})

test('accepts completed status only when delivery evidence is complete', () => {
  const result = normalizeFinalCompletionState({
    ready: true,
    stage: 'completed_everywhere',
    deliveryReady: true,
    recipientCount: 2,
    deliveredRecipientCount: 2,
  })
  assert.equal(result.ready, true)
  assert.equal(result.stage, 'completed_everywhere')
  assert.equal(isFinalCompletionReady(result), true)
})

test('does not trust deliveryReady without matching recipient counts', () => {
  const result = normalizeFinalCompletionState({
    ready: true,
    stage: 'completed_everywhere',
    deliveryReady: true,
    recipientCount: 2,
    deliveredRecipientCount: 1,
  })
  assert.equal(result.ready, false)
  assert.equal(result.stage, 'awaiting_recipient_delivery')
  assert.equal(result.deliveryReady, false)
})
