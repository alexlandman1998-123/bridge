import assert from 'node:assert/strict'
import { createMvpRolloutOverride, isMvpRolloutOverrideActive } from '../mvpRolloutOverride.js'
const override = createMvpRolloutOverride({ operatorId: 'ops-1', reason: 'Reviewed duplicate test fixture', expiresAt: '2030-01-01T00:00:00.000Z', breaches: ['duplicate_identity_detected'] })
assert.equal(isMvpRolloutOverrideActive(override, '2029-01-01T00:00:00.000Z'), true)
assert.throws(() => createMvpRolloutOverride({ operatorId: 'ops-1', expiresAt: '2030-01-01T00:00:00.000Z' }), (error) => error?.code === 'mvp_rollout_override_reason_required')
console.log('mvp rollout override tests passed')
