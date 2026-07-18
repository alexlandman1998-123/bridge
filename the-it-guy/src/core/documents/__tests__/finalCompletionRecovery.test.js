import test from 'node:test'
import assert from 'node:assert/strict'
import { assessFinalCompletionRecovery } from '../finalCompletionRecovery.js'

const complete = { contract: 'f5-v1', packetId: 'packet-1', versionId: 'version-1', ready: true, stage: 'completed_everywhere' }

test('accepts a completed-everywhere status', () => {
  assert.equal(assessFinalCompletionRecovery({ status: complete }).ready, true)
})

test('accepts a safe retry when the final artifact already exists', () => {
  const result = assessFinalCompletionRecovery({ status: { ...complete, ready: false, stage: 'awaiting_recipient_delivery', retryable: true, finalArtifactPath: 'signed/final.pdf' } })
  assert.equal(result.retryAvailable, true)
})

test('rejects concurrent retry attempts', () => {
  const result = assessFinalCompletionRecovery({ status: complete, retryAttempts: [{ status: 'processing' }, { status: 'processing' }] })
  assert.ok(result.reasons.includes('F5_CONCURRENT_RETRY_INVALID'))
})
