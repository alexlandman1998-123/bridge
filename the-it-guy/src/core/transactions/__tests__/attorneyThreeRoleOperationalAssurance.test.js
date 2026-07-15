import assert from 'node:assert/strict'
import {
  buildAttorneyThreeRoleOperationalAssurance,
  serializeAttorneyThreeRoleAssuranceEvidence,
} from '../attorneyThreeRoleOperationalAssurance.js'

function role(roleKey, { assigned = true, blockerCount = 0, escalation = false } = {}) {
  return {
    roleKey,
    blockerCount,
    primaryAction: { id: `${roleKey}_next` },
    cockpit: {
      status: 'in_progress',
      readiness: { assignment: { complete: assigned } },
      dependencies: escalation ? [{ id: `${roleKey}_late`, escalationNeeded: true }] : [],
    },
    workflow: {
      required: true,
      lane: {
        laneKey: roleKey,
        permissions: { canView: true, canUpdateStage: roleKey === 'transfer' },
        workflowUsability: { readinessChecklist: [] },
        timeline: [],
      },
    },
  }
}

const readyRoom = {
  roles: [role('transfer'), role('bond')],
  crossLaneWriteAllowed: false,
  totalBlockers: 0,
  totalOpenDependencies: 0,
  jointLodgementReady: false,
  linkedRegistrationComplete: false,
}
const ready = buildAttorneyThreeRoleOperationalAssurance({
  workflows: [{ required: true }, { required: true }, { required: false }],
  registrationRoom: readyRoom,
  now: '2026-07-15T12:00:00.000Z',
})
assert.equal(ready.decision, 'ready')
assert.equal(ready.platformReady, true)
assert.equal(ready.evidence.generatedAt, '2026-07-15T12:00:00.000Z')
assert.match(serializeAttorneyThreeRoleAssuranceEvidence(ready), /required_lane_coverage/)

const observeRoom = {
  ...readyRoom,
  roles: [role('transfer'), role('bond', { assigned: false, blockerCount: 1, escalation: true })],
  totalBlockers: 1,
  totalOpenDependencies: 1,
}
const observe = buildAttorneyThreeRoleOperationalAssurance({
  workflows: [{ required: true }, { required: true }],
  registrationRoom: observeRoom,
  now: '2026-07-15T12:00:00.000Z',
})
assert.equal(observe.decision, 'observe')
assert.equal(observe.failedCriticalCount, 0)
assert.equal(observe.failedWarningCount, 3)

const brokenRole = role('transfer')
delete brokenRole.workflow.lane.permissions
const blocked = buildAttorneyThreeRoleOperationalAssurance({
  workflows: [{ required: true }, { required: true }],
  registrationRoom: { ...readyRoom, roles: [brokenRole], crossLaneWriteAllowed: true },
  now: '2026-07-15T12:00:00.000Z',
})
assert.equal(blocked.decision, 'blocked')
assert.equal(blocked.platformReady, false)
assert.ok(blocked.failedCriticalCount >= 2)

console.log('Attorney three-role Phase 7 operational assurance tests passed.')

