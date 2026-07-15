import assert from 'node:assert/strict'
import { buildCancellationAttorneyCockpit } from '../attorneyCancellationWorldClassCockpit.js'

const cockpit = buildCancellationAttorneyCockpit({
  progressPercent: 58,
  lane: {
    currentStage: 'cancellation_guarantees_received',
    laneStatus: 'in_progress',
    permissions: { canUpdateStage: true },
    workflowUsability: {
      workflowState: 'ready',
      currentStageLabel: 'Cancellation Guarantees Received',
      primaryNextAction: { id: 'accept_guarantees', label: 'Accept cancellation guarantees' },
      readinessChecklist: [
        { id: 'assignment', complete: true, missingCount: 0 },
        { id: 'data', complete: false, missingCount: 1 },
        { id: 'documents', complete: true, missingCount: 0 },
        { id: 'signatures', complete: false, missingCount: 1 },
      ],
    },
    coordinationSummary: {
      counts: { total: 1, waiting: 1, blocked: 0 },
      items: [{ id: 'transfer_guarantees', laneKey: 'transfer', laneLabel: 'Transfer Attorney', title: 'Guarantee wording confirmation', status: 'waiting' }],
    },
  },
})

assert.equal(cockpit.version, 'attorney_cancellation_cockpit_phase5_v1')
assert.equal(cockpit.canAct, true)
assert.equal(cockpit.metrics.missingData, 1)
assert.equal(cockpit.metrics.openSignatures, 1)
assert.equal(cockpit.metrics.openDependencies, 1)
assert.equal(cockpit.domains.find((item) => item.key === 'guarantees_coordination').status, 'waiting')
assert.equal(cockpit.domains.find((item) => item.key === 'figures_validity').status, 'completed')
assert.equal(cockpit.dependencies[0].editable, false)

const blocked = buildCancellationAttorneyCockpit({
  lane: {
    currentStage: 'cancellation_lodgement_ready',
    permissions: { canUpdateStage: false, readOnlyReason: 'cross_lane_visibility' },
    coordinationSummary: { counts: { blocked: 1 }, items: [{ id: 'transfer_not_ready', laneKey: 'transfer', status: 'blocked', escalationNeeded: true }] },
  },
})
assert.equal(blocked.canAct, false)
assert.equal(blocked.readOnlyReason, 'cross_lane_visibility')
assert.equal(blocked.domains.find((item) => item.key === 'lodgement_registration').status, 'blocked')
assert.equal(blocked.healthy, false)

const complete = buildCancellationAttorneyCockpit({
  progressPercent: 100,
  lane: { currentStage: 'cancellation_close_out_complete', summary: { status: 'complete' }, workflowUsability: { workflowState: 'complete' } },
})
assert.ok(complete.domains.every((item) => item.status === 'completed'))

console.log('Attorney three-role Phase 5 cancellation cockpit tests passed.')

