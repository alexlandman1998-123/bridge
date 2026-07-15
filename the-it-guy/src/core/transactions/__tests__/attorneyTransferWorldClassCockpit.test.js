import assert from 'node:assert/strict'
import { buildTransferAttorneyCockpit } from '../attorneyTransferWorldClassCockpit.js'

const cockpit = buildTransferAttorneyCockpit({
  progressPercent: 67,
  nextStep: 'Guarantees Received',
  blockers: [],
  lane: {
    laneKey: 'transfer',
    currentStage: 'guarantees_received',
    laneStatus: 'in_progress',
    permissions: { canUpdateStage: true },
    workflowUsability: {
      workflowState: 'ready',
      currentStageLabel: 'Guarantees Received',
      primaryNextAction: { id: 'accept_guarantees', label: 'Accept guarantees' },
      readinessChecklist: [
        { id: 'assignment', complete: true, missingCount: 0 },
        { id: 'data', complete: true, missingCount: 0 },
        { id: 'documents', complete: false, missingCount: 2 },
        { id: 'signatures', complete: true, missingCount: 0 },
      ],
    },
    coordinationSummary: {
      counts: { total: 2, ready: 1, waiting: 1, blocked: 0 },
      items: [
        { id: 'bond_guarantees', laneKey: 'bond', laneLabel: 'Bond Attorney', title: 'Guarantees issued', status: 'ready' },
        { id: 'cancellation_figures', laneKey: 'cancellation', laneLabel: 'Cancellation Attorney', title: 'Cancellation figures', status: 'waiting' },
      ],
    },
  },
})

assert.equal(cockpit.version, 'attorney_transfer_cockpit_phase3_v1')
assert.equal(cockpit.canAct, true)
assert.equal(cockpit.metrics.missingDocuments, 2)
assert.equal(cockpit.metrics.openDependencies, 1)
assert.equal(cockpit.domains.find((item) => item.key === 'financial_dependencies').status, 'waiting')
assert.equal(cockpit.domains.find((item) => item.key === 'drafting_signing').status, 'completed')
assert.equal(cockpit.dependencies[1].editable, false)
assert.equal(cockpit.primaryAction.id, 'accept_guarantees')

const blocked = buildTransferAttorneyCockpit({
  lane: {
    currentStage: 'guarantees_requested',
    laneStatus: 'in_progress',
    permissions: { canUpdateStage: false, readOnlyReason: 'cross_lane_visibility' },
    coordinationSummary: {
      counts: { blocked: 1 },
      items: [{ id: 'missing_bond_firm', laneKey: 'bond', status: 'blocked', escalationNeeded: true }],
    },
  },
})
assert.equal(blocked.canAct, false)
assert.equal(blocked.readOnlyReason, 'cross_lane_visibility')
assert.equal(blocked.metrics.blockedDependencies, 1)
assert.equal(blocked.healthy, false)
assert.match(blocked.blockers[0], /linked attorney dependency/)

const complete = buildTransferAttorneyCockpit({
  progressPercent: 100,
  lane: { currentStage: 'matter_closed', summary: { status: 'complete' }, workflowUsability: { workflowState: 'complete' } },
})
assert.ok(complete.domains.every((item) => item.status === 'completed'))

console.log('Attorney three-role Phase 3 transfer cockpit tests passed.')

