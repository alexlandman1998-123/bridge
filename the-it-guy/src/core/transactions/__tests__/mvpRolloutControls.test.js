import assert from 'node:assert/strict'
import { evaluateMvpRolloutControls } from '../mvpRolloutControls.js'
assert.equal(evaluateMvpRolloutControls({ transactionCount: 10 }).decision, 'continue_rollout')
assert.ok(evaluateMvpRolloutControls({ transactionCount: 11 }).breaches.includes('batch_limit_exceeded'))
assert.equal(evaluateMvpRolloutControls({ duplicateIdentities: 1 }).decision, 'pause_rollout')
console.log('mvp rollout controls tests passed')
