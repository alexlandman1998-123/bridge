import assert from 'node:assert/strict'
import { buildBondAttorneyCockpit } from '../attorneyBondWorldClassCockpit.js'

const cockpit = buildBondAttorneyCockpit({
  progressPercent: 71,
  lane: {
    currentStage: 'guarantees_issued',
    laneStatus: 'in_progress',
    permissions: { canUpdateStage: true },
    workflowUsability: {
      workflowState: 'ready',
      currentStageLabel: 'Guarantees Issued',
      primaryNextAction: { id: 'accept_wording', label: 'Confirm guarantee wording' },
      readinessChecklist: [
        { id: 'assignment', complete: true, missingCount: 0 },
        { id: 'data', complete: true, missingCount: 0 },
        { id: 'documents', complete: false, missingCount: 1 },
        { id: 'signatures', complete: true, missingCount: 0 },
      ],
    },
    coordinationSummary: {
      counts: { total: 1, waiting: 1, blocked: 0 },
      items: [{ id: 'transfer_lodgement', laneKey: 'transfer', laneLabel: 'Transfer Attorney', title: 'Transfer lodgement readiness', status: 'waiting' }],
    },
  },
})

assert.equal(cockpit.version, 'attorney_bond_cockpit_phase4_v1')
assert.equal(cockpit.canAct, true)
assert.equal(cockpit.metrics.missingDocuments, 1)
assert.equal(cockpit.metrics.openDependencies, 1)
assert.equal(cockpit.domains.find((item) => item.key === 'guarantees_coordination').status, 'waiting')
assert.equal(cockpit.domains.find((item) => item.key === 'bank_lodgement_authority').status, 'completed')
assert.equal(cockpit.dependencies[0].editable, false)
assert.equal(cockpit.primaryAction.id, 'accept_wording')

const blocked = buildBondAttorneyCockpit({
  lane: {
    currentStage: 'guarantees_issued',
    permissions: { canUpdateStage: false, readOnlyReason: 'cross_lane_visibility' },
    coordinationSummary: { counts: { blocked: 1 }, items: [{ id: 'transfer_missing', laneKey: 'transfer', status: 'blocked', escalationNeeded: true }] },
  },
})
assert.equal(blocked.canAct, false)
assert.equal(blocked.readOnlyReason, 'cross_lane_visibility')
assert.equal(blocked.metrics.blockedDependencies, 1)
assert.equal(blocked.healthy, false)

const complete = buildBondAttorneyCockpit({
  progressPercent: 100,
  lane: { currentStage: 'bond_close_out_complete', summary: { status: 'complete' }, workflowUsability: { workflowState: 'complete' } },
})
assert.ok(complete.domains.every((item) => item.status === 'completed'))

console.log('Attorney three-role Phase 4 bond cockpit tests passed.')

