import assert from 'node:assert/strict'
import { evaluateMvpScaleProgression } from '../the-it-guy/src/core/transactions/mvpScaleProgression.js'

const cleanTransactions = Array.from({ length: 10 }, (_, index) => ({
  transactionId: `tx-${index}`, idempotencyKey: `key-${index}`,
  participantBootstrapComplete: true, documentBootstrapComplete: true, workflowBootstrapComplete: true,
}))
assert.equal(evaluateMvpScaleProgression({ currentCapacity: 10, transactions: cleanTransactions, completedBatchAudits: 1 }).decision, 'advance_rollout')
assert.equal(evaluateMvpScaleProgression({ currentCapacity: 10, transactions: cleanTransactions, completedBatchAudits: 0 }).decision, 'pause_rollout')
assert.equal(evaluateMvpScaleProgression({ currentCapacity: 25, transactions: [...cleanTransactions, cleanTransactions[0]], completedBatchAudits: 1 }).decision, 'pause_rollout')
assert.equal(evaluateMvpScaleProgression({ currentCapacity: 100, transactions: cleanTransactions, completedBatchAudits: 1 }).decision, 'maintain_mvp_capacity')

console.log('MVP scale progression tests passed.')
