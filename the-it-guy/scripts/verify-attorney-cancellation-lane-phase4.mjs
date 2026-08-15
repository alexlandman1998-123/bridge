import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildAttorneyWorkflowCoordinationCommand,
  buildAttorneyWorkflowCoordinationSummary,
} from '../src/constants/attorneyWorkflowUsability.js'
import {
  CANCELLATION_LANE_PHASE4_GUARANTEE_COORDINATION_VERSION,
  buildCancellationLanePhase4GuaranteeCoordinationPlan,
} from '../src/services/attorneyWorkflow/cancellationLaneJourneyMap.js'

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
  const plan = buildCancellationLanePhase4GuaranteeCoordinationPlan()

  assert.equal(plan.version, CANCELLATION_LANE_PHASE4_GUARANTEE_COORDINATION_VERSION)
  assert.equal(plan.status, 'ready_for_phase5')
  assert.equal(plan.phase2Version, 'cancellation-lane-phase2-action-audit-v1')
  assert.deepEqual(plan.structuralBlockers, [])
  assert.equal(plan.handoff.key, 'cancellation_to_transfer_guarantee_alignment')
  assert.equal(plan.pairs.length, 2)
  assert.equal(plan.pairs.every((pair) => pair.commandPresetCovered), true)
  assert.equal(plan.pairs.every((pair) => pair.handoffCovered), true)
  assert.equal(plan.pairs.every((pair) => pair.cancellationStageCovered), true)
  assert.equal(plan.pairs.every((pair) => pair.transferStageCovered), true)
  assert.equal(plan.pairs.every((pair) => pair.cancellationActionCovered), true)
  assert.ok(plan.pairs.find((pair) => pair.coordinationItemId === 'cancellation_cancellation_guarantees_accepted'))
  assert.ok(plan.pairs.find((pair) => pair.coordinationItemId === 'transfer_transfer_cancellation_alignment'))
  assert.equal(plan.skippedPhase3Dependency.phase3Implemented, false)
}

function verifyTransferRequestsCancellationAcceptance() {
  const transferLane = lane('transfer', {
    currentStage: 'transfer_guarantees_accepted',
    steps: [
      { stepKey: 'guarantees_received', status: 'completed' },
      { stepKey: 'transfer_guarantees_accepted', status: 'waiting' },
    ],
  })
  const cancellationLane = lane('cancellation', {
    currentStage: 'cancellation_guarantees_received',
    steps: [
      { stepKey: 'cancellation_instruction_received', status: 'completed' },
      { stepKey: 'cancellation_figures_received', status: 'completed' },
      { stepKey: 'figures_expiry_captured', status: 'completed' },
      { stepKey: 'cancellation_guarantees_received', status: 'waiting' },
      { stepKey: 'cancellation_guarantees_accepted', status: 'not_started' },
    ],
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, cancellationLane],
    now: fixedNow,
  })
  const item = summary.items.find((candidate) => candidate.id === 'cancellation_cancellation_guarantees_accepted')
  const command = buildAttorneyWorkflowCoordinationCommand(item, {
    laneKey: 'transfer',
    stageKey: 'transfer_guarantees_accepted',
    now: fixedNow,
  })

  assert.equal(item.status, 'waiting')
  assert.equal(command.commandType, 'add_note')
  assert.equal(command.label, 'Request Cancellation Acceptance')
  assert.equal(command.workPacket.visibility, 'professional_shared')
  assert.equal(command.workPacket.sourceCoordinationId, 'cancellation_cancellation_guarantees_accepted')
  assert.equal(command.workPacket.sourceCoordinationLaneKey, 'cancellation')
  assert.equal(command.workPacket.sourceCoordinationTargetStage, 'cancellation_guarantees_accepted')
  assert.match(command.draft.message, /Guarantee coordination request for Cancellation Attorney/)
  assert.match(command.workPacket.checklist.join(' '), /figures and expiry are current/)
  assert.match(command.workPacket.checklist.join(' '), /settlement shortfall/)
}

function verifyCancellationRequestsTransferAlignment() {
  const transferLane = lane('transfer', {
    currentStage: 'guarantees_received',
    steps: [
      { stepKey: 'guarantees_received', status: 'completed' },
      { stepKey: 'transfer_guarantees_accepted', status: 'waiting' },
    ],
  })
  const cancellationLane = lane('cancellation', {
    currentStage: 'cancellation_guarantees_received',
    steps: [
      { stepKey: 'cancellation_figures_received', status: 'completed' },
      { stepKey: 'figures_expiry_captured', status: 'completed' },
      { stepKey: 'cancellation_guarantees_received', status: 'waiting' },
      { stepKey: 'cancellation_guarantees_accepted', status: 'not_started' },
    ],
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'cancellation',
    lanes: [transferLane, cancellationLane],
    now: fixedNow,
  })
  const item = summary.items.find((candidate) => candidate.id === 'transfer_transfer_cancellation_alignment')
  const command = buildAttorneyWorkflowCoordinationCommand(item, {
    laneKey: 'cancellation',
    stageKey: 'cancellation_guarantees_accepted',
    now: fixedNow,
  })

  assert.equal(item.status, 'waiting')
  assert.equal(command.commandType, 'add_note')
  assert.equal(command.label, 'Request Transfer Alignment')
  assert.equal(command.workPacket.visibility, 'professional_shared')
  assert.equal(command.workPacket.sourceCoordinationId, 'transfer_transfer_cancellation_alignment')
  assert.equal(command.workPacket.sourceCoordinationLaneKey, 'transfer')
  assert.equal(command.workPacket.sourceCoordinationTargetStage, 'transfer_guarantees_accepted')
  assert.match(command.draft.message, /Cancellation guarantee alignment request for Transfer Attorney/)
  assert.match(command.workPacket.checklist.join(' '), /cancellation settlement requirements/)
  assert.match(command.workPacket.checklist.join(' '), /target lodgement date/)
}

function verifyReadyBothWays() {
  const transferLane = lane('transfer', {
    currentStage: 'transfer_guarantees_accepted',
    steps: [
      { stepKey: 'guarantees_received', status: 'completed' },
      { stepKey: 'transfer_guarantees_accepted', status: 'completed' },
    ],
  })
  const cancellationLane = lane('cancellation', {
    currentStage: 'cancellation_guarantees_accepted',
    steps: [
      { stepKey: 'cancellation_figures_received', status: 'completed' },
      { stepKey: 'figures_expiry_captured', status: 'completed' },
      { stepKey: 'cancellation_guarantees_received', status: 'completed' },
      { stepKey: 'cancellation_guarantees_accepted', status: 'completed' },
    ],
  })

  const transferSummary = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'transfer', lanes: [transferLane, cancellationLane] })
  const cancellationSummary = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'cancellation', lanes: [transferLane, cancellationLane] })

  assert.equal(transferSummary.items.find((item) => item.id === 'cancellation_cancellation_guarantees_accepted').status, 'ready')
  assert.equal(cancellationSummary.items.find((item) => item.id === 'transfer_transfer_cancellation_alignment').status, 'ready')
}

function verifyDoc() {
  const docSource = readFileSync(new URL('../docs/attorney-cancellation-lane-phase4-guarantee-coordination.md', import.meta.url), 'utf8')
  assert.match(docSource, /Cancellation Lane Phase 4 Guarantee Coordination/)
  assert.match(docSource, /cancellation\.cancellation_guarantees_accepted/)
  assert.match(docSource, /transfer\.transfer_guarantees_accepted/)
  assert.match(docSource, /Request Transfer Alignment/)
  assert.match(docSource, /node scripts\/verify-attorney-cancellation-lane-phase4\.mjs/)
}

verifyPlan()
verifyTransferRequestsCancellationAcceptance()
verifyCancellationRequestsTransferAlignment()
verifyReadyBothWays()
verifyDoc()

console.log('Attorney cancellation lane Phase 4 guarantee coordination verification passed.')
