import assert from 'node:assert/strict'
import {
  buildAttorneyThreeRoleInterventionQueue,
  serializeAttorneyThreeRoleInterventionQueue,
} from '../attorneyThreeRoleInterventionEngine.js'

const now = '2026-07-15T12:00:00.000Z'
const queue = buildAttorneyThreeRoleInterventionQueue({
  now,
  rollout: {
    decision: 'hold',
    interventions: [{
      matterId: 'matter-1', matterReference: 'MAT-1', actionHref: '/transactions/matter-1',
      missingRoles: ['bond_attorney', 'cancellation_attorney'], overdue: true, staleDays: 14, atRisk: true,
    }],
  },
})
assert.equal(queue.version, 'attorney_three_role_intervention_engine_phase9_v1')
assert.equal(queue.openCount, 5)
assert.equal(queue.counts.critical, 4)
assert.equal(queue.counts.high, 1)
assert.equal(queue.canExpandPilot, false)
assert.equal(queue.items[0].dueDate, '2026-07-16')
assert.ok(queue.items.every((item) => item.checklist.length === 3))
assert.match(serializeAttorneyThreeRoleInterventionQueue(queue), /assign_required_role/)

const clear = buildAttorneyThreeRoleInterventionQueue({ now, rollout: { decision: 'go', interventions: [] } })
assert.equal(clear.openCount, 0)
assert.equal(clear.canExpandPilot, true)

const observe = buildAttorneyThreeRoleInterventionQueue({
  now,
  rollout: { decision: 'observe', interventions: [{ matterId: 'matter-2', missingRoles: [], overdue: false, staleDays: 0, atRisk: true }] },
})
assert.equal(observe.openCount, 1)
assert.equal(observe.canExpandPilot, false)
assert.equal(observe.items[0].type, 'matter_risk_review')

console.log('Attorney three-role Phase 9 intervention engine tests passed.')

