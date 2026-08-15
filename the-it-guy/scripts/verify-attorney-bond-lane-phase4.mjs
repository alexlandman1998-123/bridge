import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildAttorneyWorkflowCoordinationCommand,
  buildAttorneyWorkflowCoordinationSummary,
} from '../src/constants/attorneyWorkflowUsability.js'
import {
  BOND_LANE_PHASE4_GUARANTEE_COORDINATION_VERSION,
  buildBondLanePhase4GuaranteeCoordinationPlan,
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
  const plan = buildBondLanePhase4GuaranteeCoordinationPlan()

  assert.equal(plan.version, BOND_LANE_PHASE4_GUARANTEE_COORDINATION_VERSION)
  assert.equal(plan.status, 'ready_for_phase5')
  assert.deepEqual(plan.structuralBlockers, [])
  assert.equal(plan.handoff.key, 'bond_attorney_to_transfer_attorney')
  assert.equal(plan.pairs.length, 2)
  assert.equal(plan.pairs.every((pair) => pair.commandPresetCovered), true)
  assert.equal(plan.pairs.every((pair) => pair.handoffCovered), true)
  assert.ok(plan.pairs.find((pair) => pair.coordinationItemId === 'bond_bond_guarantees_issued'))
  assert.ok(plan.pairs.find((pair) => pair.coordinationItemId === 'transfer_transfer_guarantee_acceptance'))
}

function verifyTransferRequestsBondGuarantees() {
  const transferLane = lane('transfer', {
    currentStage: 'guarantees_received',
    steps: [
      { stepKey: 'guarantees_requested', status: 'completed' },
      { stepKey: 'guarantees_received', status: 'waiting' },
      { stepKey: 'transfer_guarantees_accepted', status: 'not_started' },
    ],
  })
  const bondLane = lane('bond', {
    currentStage: 'bond_documents_sent_to_bank',
    steps: [
      { stepKey: 'bond_documents_sent_to_bank', status: 'completed' },
      { stepKey: 'guarantees_issued', status: 'waiting' },
    ],
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane],
    now: fixedNow,
  })
  const item = summary.items.find((candidate) => candidate.id === 'bond_bond_guarantees_issued')
  const command = buildAttorneyWorkflowCoordinationCommand(item, {
    laneKey: 'transfer',
    stageKey: 'guarantees_received',
    now: fixedNow,
  })

  assert.equal(item.status, 'waiting')
  assert.equal(command.commandType, 'add_note')
  assert.equal(command.label, 'Request Bond Guarantees')
  assert.equal(command.workPacket.visibility, 'professional_shared')
  assert.equal(command.workPacket.sourceCoordinationId, 'bond_bond_guarantees_issued')
  assert.equal(command.workPacket.sourceCoordinationLaneKey, 'bond')
  assert.equal(command.workPacket.sourceCoordinationTargetStage, 'guarantees_issued')
  assert.match(command.draft.message, /Guarantee coordination request for Bond Attorney/)
  assert.match(command.workPacket.checklist.join(' '), /guarantee wording and amounts/)
}

function verifyBondRequestsTransferAcceptance() {
  const transferLane = lane('transfer', {
    currentStage: 'guarantees_received',
    steps: [
      { stepKey: 'guarantees_received', status: 'completed' },
      { stepKey: 'transfer_guarantees_accepted', status: 'waiting' },
    ],
  })
  const bondLane = lane('bond', {
    currentStage: 'guarantees_issued',
    steps: [
      { stepKey: 'guarantees_issued', status: 'completed' },
      { stepKey: 'guarantee_wording_accepted', status: 'waiting' },
    ],
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'bond',
    lanes: [transferLane, bondLane],
    now: fixedNow,
  })
  const item = summary.items.find((candidate) => candidate.id === 'transfer_transfer_guarantee_acceptance')
  const command = buildAttorneyWorkflowCoordinationCommand(item, {
    laneKey: 'bond',
    stageKey: 'guarantee_wording_accepted',
    now: fixedNow,
  })

  assert.equal(item.status, 'waiting')
  assert.equal(command.commandType, 'add_note')
  assert.equal(command.label, 'Request Wording Acceptance')
  assert.equal(command.workPacket.visibility, 'professional_shared')
  assert.equal(command.workPacket.sourceCoordinationId, 'transfer_transfer_guarantee_acceptance')
  assert.equal(command.workPacket.sourceCoordinationLaneKey, 'transfer')
  assert.equal(command.workPacket.sourceCoordinationTargetStage, 'transfer_guarantees_accepted')
  assert.match(command.draft.message, /Guarantee wording request for Transfer Attorney/)
  assert.match(command.workPacket.checklist.join(' '), /wording and amount acceptance/)
}

function verifyReadyBothWays() {
  const transferLane = lane('transfer', {
    currentStage: 'transfer_guarantees_accepted',
    steps: [
      { stepKey: 'guarantees_received', status: 'completed' },
      { stepKey: 'transfer_guarantees_accepted', status: 'completed' },
    ],
  })
  const bondLane = lane('bond', {
    currentStage: 'guarantee_wording_accepted',
    steps: [
      { stepKey: 'guarantees_issued', status: 'completed' },
      { stepKey: 'guarantee_wording_accepted', status: 'completed' },
    ],
  })

  const transferSummary = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'transfer', lanes: [transferLane, bondLane] })
  const bondSummary = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'bond', lanes: [transferLane, bondLane] })

  assert.equal(transferSummary.items.find((item) => item.id === 'bond_bond_guarantees_issued').status, 'ready')
  assert.equal(bondSummary.items.find((item) => item.id === 'transfer_transfer_guarantee_acceptance').status, 'ready')
}

function verifyDoc() {
  const docSource = readFileSync(new URL('../docs/attorney-bond-lane-phase4-guarantee-coordination.md', import.meta.url), 'utf8')
  assert.match(docSource, /Bond Lane Phase 4 Guarantee Coordination/)
  assert.match(docSource, /bond\.guarantees_issued/)
  assert.match(docSource, /transfer\.transfer_guarantees_accepted/)
  assert.match(docSource, /Request Wording Acceptance/)
  assert.match(docSource, /node scripts\/verify-attorney-bond-lane-phase4\.mjs/)
}

verifyPlan()
verifyTransferRequestsBondGuarantees()
verifyBondRequestsTransferAcceptance()
verifyReadyBothWays()
verifyDoc()

console.log('Attorney bond lane Phase 4 guarantee coordination verification passed.')
