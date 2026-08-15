import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildAttorneyWorkflowCoordinationCommand,
  buildAttorneyWorkflowCoordinationSummary,
} from '../src/constants/attorneyWorkflowUsability.js'
import {
  BOND_LANE_PHASE5_LODGEMENT_COORDINATION_VERSION,
  buildBondLanePhase5LodgementCoordinationPlan,
} from '../src/services/attorneyWorkflow/bondLaneJourneyMap.js'

const fixedNow = '2026-07-06T00:00:00.000Z'

function lane(laneKey, {
  assignment = { firmName: 'Assigned Firm' },
  currentStage = '',
  laneStatus = 'in_progress',
  steps = [],
} = {}) {
  return {
    laneKey,
    assignment,
    currentStage,
    currentStageLabel: currentStage,
    laneStatus,
    steps: steps.map((step, index) => ({
      sortOrder: index + 1,
      ...step,
    })),
    summary: { currentStage, status: laneStatus },
  }
}

function verifyPlan() {
  const plan = buildBondLanePhase5LodgementCoordinationPlan()

  assert.equal(plan.version, BOND_LANE_PHASE5_LODGEMENT_COORDINATION_VERSION)
  assert.equal(plan.status, 'ready_for_phase6')
  assert.deepEqual(plan.structuralBlockers, [])
  assert.equal(plan.handoff.key, 'bond_attorney_to_lodgement_coordination')
  assert.equal(plan.pairs.length, 2)
  assert.equal(plan.pairs.every((pair) => pair.commandPresetCovered), true)
  assert.equal(plan.pairs.every((pair) => pair.handoffCovered), true)
  assert.ok(plan.pairs.find((pair) => pair.coordinationItemId === 'bond_bond_lodgement_ready'))
  assert.ok(plan.pairs.find((pair) => pair.coordinationItemId === 'transfer_transfer_lodgement_ready'))
}

function verifyTransferRequestsBondReadiness() {
  const transferLane = lane('transfer', {
    currentStage: 'lodgement_ready',
    steps: [
      { stepKey: 'transfer_guarantees_accepted', status: 'completed' },
      { stepKey: 'lodgement_ready', status: 'waiting' },
    ],
  })
  const bondLane = lane('bond', {
    currentStage: 'guarantees_issued',
    steps: [
      { stepKey: 'guarantees_issued', status: 'completed' },
      { stepKey: 'bond_lodgement_ready', status: 'waiting' },
    ],
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane],
    now: fixedNow,
  })
  const item = summary.items.find((candidate) => candidate.id === 'bond_bond_lodgement_ready')
  const command = buildAttorneyWorkflowCoordinationCommand(item, {
    laneKey: 'transfer',
    stageKey: 'lodgement_ready',
    now: fixedNow,
  })

  assert.equal(item.status, 'waiting')
  assert.equal(command.commandType, 'add_note')
  assert.equal(command.label, 'Request Bond Readiness')
  assert.equal(command.workPacket.visibility, 'professional_shared')
  assert.equal(command.workPacket.sourceCoordinationId, 'bond_bond_lodgement_ready')
  assert.equal(command.workPacket.sourceCoordinationLaneKey, 'bond')
  assert.equal(command.workPacket.sourceCoordinationTargetStage, 'bond_lodgement_ready')
  assert.match(command.draft.message, /Simultaneous lodgement request for Bond Attorney/)
  assert.match(command.workPacket.checklist.join(' '), /bank approval to lodge/)
}

function verifyBondRequestsTransferReadiness() {
  const transferLane = lane('transfer', {
    currentStage: 'transfer_guarantees_accepted',
    steps: [
      { stepKey: 'transfer_guarantees_accepted', status: 'completed' },
      { stepKey: 'lodgement_ready', status: 'waiting' },
    ],
  })
  const bondLane = lane('bond', {
    currentStage: 'bond_lodgement_ready',
    steps: [
      { stepKey: 'guarantees_issued', status: 'completed' },
      { stepKey: 'guarantee_wording_accepted', status: 'completed' },
      { stepKey: 'bond_lodgement_ready', status: 'waiting' },
    ],
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'bond',
    lanes: [transferLane, bondLane],
    now: fixedNow,
  })
  const item = summary.items.find((candidate) => candidate.id === 'transfer_transfer_lodgement_ready')
  const command = buildAttorneyWorkflowCoordinationCommand(item, {
    laneKey: 'bond',
    stageKey: 'bond_lodgement_ready',
    now: fixedNow,
  })

  assert.equal(item.status, 'waiting')
  assert.equal(command.commandType, 'add_note')
  assert.equal(command.label, 'Request Transfer Readiness')
  assert.equal(command.workPacket.visibility, 'professional_shared')
  assert.equal(command.workPacket.sourceCoordinationId, 'transfer_transfer_lodgement_ready')
  assert.equal(command.workPacket.sourceCoordinationLaneKey, 'transfer')
  assert.equal(command.workPacket.sourceCoordinationTargetStage, 'lodgement_ready')
  assert.match(command.draft.message, /Simultaneous lodgement request for Transfer Attorney/)
  assert.match(command.workPacket.checklist.join(' '), /target lodgement date/)
}

function verifyReadyBothWays() {
  const transferLane = lane('transfer', {
    currentStage: 'lodgement_ready',
    steps: [
      { stepKey: 'transfer_guarantees_accepted', status: 'completed' },
      { stepKey: 'lodgement_ready', status: 'completed' },
    ],
  })
  const bondLane = lane('bond', {
    currentStage: 'bond_lodgement_ready',
    steps: [
      { stepKey: 'guarantees_issued', status: 'completed' },
      { stepKey: 'bond_lodgement_ready', status: 'completed' },
    ],
  })

  const transferSummary = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'transfer', lanes: [transferLane, bondLane] })
  const bondSummary = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'bond', lanes: [transferLane, bondLane] })

  assert.equal(transferSummary.items.find((item) => item.id === 'bond_bond_lodgement_ready').status, 'ready')
  assert.equal(bondSummary.items.find((item) => item.id === 'transfer_transfer_lodgement_ready').status, 'ready')
}

function verifyDoc() {
  const docSource = readFileSync(new URL('../docs/attorney-bond-lane-phase5-lodgement-coordination.md', import.meta.url), 'utf8')
  assert.match(docSource, /Bond Lane Phase 5 Lodgement Coordination/)
  assert.match(docSource, /bond\.bond_lodgement_ready/)
  assert.match(docSource, /transfer\.lodgement_ready/)
  assert.match(docSource, /Request Transfer Readiness/)
  assert.match(docSource, /node scripts\/verify-attorney-bond-lane-phase5\.mjs/)
}

verifyPlan()
verifyTransferRequestsBondReadiness()
verifyBondRequestsTransferReadiness()
verifyReadyBothWays()
verifyDoc()

console.log('Attorney bond lane Phase 5 lodgement coordination verification passed.')
