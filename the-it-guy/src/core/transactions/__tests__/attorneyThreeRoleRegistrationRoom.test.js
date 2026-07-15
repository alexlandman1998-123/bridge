import assert from 'node:assert/strict'
import { buildAttorneyThreeRoleRegistrationRoom } from '../attorneyThreeRoleRegistrationRoom.js'

function workflow(key, laneKey, stage, progress, { canAct = false, blocked = 0, missing = 0, signatures = 0 } = {}) {
  return {
    key,
    required: true,
    progressPercent: progress,
    blockers: [],
    lane: {
      laneKey,
      currentStage: stage,
      laneStatus: blocked ? 'blocked' : 'in_progress',
      permissions: { canUpdateStage: canAct },
      workflowUsability: {
        currentStage: stage,
        workflowState: 'ready',
        primaryNextAction: { id: `${laneKey}_next`, label: `${laneKey} next` },
        readinessChecklist: [
          { id: 'assignment', complete: true, missingCount: 0 },
          { id: 'data', complete: missing === 0, missingCount: missing },
          { id: 'documents', complete: true, missingCount: 0 },
          { id: 'signatures', complete: signatures === 0, missingCount: signatures },
        ],
      },
      coordinationSummary: {
        counts: { blocked, waiting: 0 },
        items: blocked ? [{ id: `${laneKey}_dependency`, status: 'blocked', escalationNeeded: true }] : [],
      },
    },
  }
}

const room = buildAttorneyThreeRoleRegistrationRoom([
  workflow('transfer', 'transfer', 'transfer_guarantees_accepted', 75, { canAct: true }),
  workflow('bond_registration', 'bond', 'guarantee_wording_accepted', 70),
  workflow('bond_cancellation', 'cancellation', 'cancellation_guarantees_received', 55, { blocked: 1 }),
])

assert.equal(room.version, 'attorney_three_role_registration_room_phase6_v1')
assert.equal(room.requiredRoleCount, 3)
assert.equal(room.crossLaneWriteAllowed, false)
assert.equal(room.criticalPath.roleKey, 'cancellation')
assert.equal(room.totalBlockers, 1)
assert.equal(room.gates.find((gate) => gate.key === 'instruction').complete, true)
assert.equal(room.gates.find((gate) => gate.key === 'guarantees').status, 'blocked')
assert.equal(room.jointLodgementReady, false)

const transferOnly = buildAttorneyThreeRoleRegistrationRoom([
  workflow('transfer', 'transfer', 'lodgement_ready', 85, { canAct: true }),
])
assert.equal(transferOnly.requiredRoleCount, 1)
assert.equal(transferOnly.jointLodgementReady, true)
assert.equal(transferOnly.roles[0].canAct, true)

const completeRoom = buildAttorneyThreeRoleRegistrationRoom([
  { ...workflow('transfer', 'transfer', 'registered', 100), lane: { ...workflow('transfer', 'transfer', 'registered', 100).lane, summary: { status: 'complete' }, workflowUsability: { workflowState: 'complete', readinessChecklist: [] } } },
  { ...workflow('bond_registration', 'bond', 'bond_registered', 100), lane: { ...workflow('bond_registration', 'bond', 'bond_registered', 100).lane, summary: { status: 'complete' }, workflowUsability: { workflowState: 'complete', readinessChecklist: [] } } },
])
assert.equal(completeRoom.linkedRegistrationComplete, true)

console.log('Attorney three-role Phase 6 registration room tests passed.')
