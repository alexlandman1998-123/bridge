import assert from 'node:assert/strict'
import { buildMvpPilotMetrics } from '../mvpPilotMetrics.js'
assert.equal(buildMvpPilotMetrics([{ transactionId: 'a', idempotencyKey: 'a', participantBootstrapComplete: true, documentBootstrapComplete: true, workflowBootstrapComplete: true }]).decision, 'continue_rollout')
assert.equal(buildMvpPilotMetrics([{ transactionId: 'a', idempotencyKey: 'a' }, { transactionId: 'a', idempotencyKey: 'a' }]).decision, 'pause_rollout')
console.log('mvp pilot metrics tests passed')
