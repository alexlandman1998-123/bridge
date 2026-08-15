import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildAttorneyWorkflowCoordinationCommand,
  buildAttorneyWorkflowCoordinationSummary,
} from '../src/constants/attorneyWorkflowUsability.js'
import {
  CANCELLATION_LANE_PHASE5_LODGEMENT_COORDINATION_VERSION,
  buildCancellationLanePhase5LodgementCoordinationPlan,
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
  const plan = buildCancellationLanePhase5LodgementCoordinationPlan()

  assert.equal(plan.version, CANCELLATION_LANE_PHASE5_LODGEMENT_COORDINATION_VERSION)
  assert.equal(plan.status, 'ready_for_phase6')
  assert.equal(plan.phase4Version, 'cancellation-lane-phase4-guarantee-coordination-v1')
  assert.deepEqual(plan.structuralBlockers, [])
  assert.equal(plan.handoff.key, 'cancellation_to_lodgement_coordination')
  assert.equal(plan.pairs.length, 2)
  assert.equal(plan.pairs.every((pair) => pair.commandPresetCovered), true)
  assert.equal(plan.pairs.every((pair) => pair.handoffCovered), true)
  assert.equal(plan.pairs.every((pair) => pair.cancellationStageCovered), true)
  assert.equal(plan.pairs.every((pair) => pair.transferStageCovered), true)
  assert.equal(plan.pairs.every((pair) => pair.cancellationActionCovered), true)
  assert.ok(plan.pairs.find((pair) => pair.coordinationItemId === 'cancellation_cancellation_lodgement_ready'))
  assert.ok(plan.pairs.find((pair) => pair.coordinationItemId === 'transfer_transfer_lodgement_ready'))
  assert.equal(plan.skippedPhase3Dependency.phase3Implemented, false)
}

function verifyTransferRequestsCancellationReadiness() {
  const transferLane = lane('transfer', {
    currentStage: 'lodgement_ready',
    steps: [
      { stepKey: 'transfer_guarantees_accepted', status: 'completed' },
      { stepKey: 'lodgement_ready', status: 'waiting' },
    ],
  })
  const cancellationLane = lane('cancellation', {
    currentStage: 'cancellation_guarantees_accepted',
    steps: [
      { stepKey: 'cancellation_figures_received', status: 'completed' },
      { stepKey: 'figures_expiry_captured', status: 'completed' },
      { stepKey: 'cancellation_guarantees_accepted', status: 'completed' },
      { stepKey: 'cancellation_documents_prepared', status: 'completed' },
      { stepKey: 'cancellation_lodgement_ready', status: 'waiting' },
    ],
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, cancellationLane],
    now: fixedNow,
  })
  const item = summary.items.find((candidate) => candidate.id === 'cancellation_cancellation_lodgement_ready')
  const command = buildAttorneyWorkflowCoordinationCommand(item, {
    laneKey: 'transfer',
    stageKey: 'lodgement_ready',
    now: fixedNow,
  })

  assert.equal(item.status, 'waiting')
  assert.equal(command.commandType, 'add_note')
  assert.equal(command.label, 'Request Cancellation Readiness')
  assert.equal(command.workPacket.visibility, 'professional_shared')
  assert.equal(command.workPacket.sourceCoordinationId, 'cancellation_cancellation_lodgement_ready')
  assert.equal(command.workPacket.sourceCoordinationLaneKey, 'cancellation')
  assert.equal(command.workPacket.sourceCoordinationTargetStage, 'cancellation_lodgement_ready')
  assert.match(command.draft.message, /Simultaneous lodgement request for Cancellation Attorney/)
  assert.match(command.workPacket.checklist.join(' '), /valid for the target lodgement date/)
  assert.match(command.workPacket.checklist.join(' '), /cancellation pack is ready/)
}

function verifyCancellationRequestsTransferReadiness() {
  const transferLane = lane('transfer', {
    currentStage: 'transfer_guarantees_accepted',
    steps: [
      { stepKey: 'transfer_guarantees_accepted', status: 'completed' },
      { stepKey: 'lodgement_ready', status: 'waiting' },
    ],
  })
  const cancellationLane = lane('cancellation', {
    currentStage: 'cancellation_lodgement_ready',
    steps: [
      { stepKey: 'cancellation_figures_received', status: 'completed' },
      { stepKey: 'figures_expiry_captured', status: 'completed' },
      { stepKey: 'cancellation_guarantees_accepted', status: 'completed' },
      { stepKey: 'cancellation_lodgement_ready', status: 'waiting' },
    ],
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'cancellation',
    lanes: [transferLane, cancellationLane],
    now: fixedNow,
  })
  const item = summary.items.find((candidate) => candidate.id === 'transfer_transfer_lodgement_ready')
  const command = buildAttorneyWorkflowCoordinationCommand(item, {
    laneKey: 'cancellation',
    stageKey: 'cancellation_lodgement_ready',
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
  assert.match(command.workPacket.checklist.join(' '), /transfer lodgement pack readiness/)
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
  const cancellationLane = lane('cancellation', {
    currentStage: 'cancellation_lodgement_ready',
    steps: [
      { stepKey: 'cancellation_figures_received', status: 'completed' },
      { stepKey: 'figures_expiry_captured', status: 'completed' },
      { stepKey: 'cancellation_guarantees_accepted', status: 'completed' },
      { stepKey: 'cancellation_lodgement_ready', status: 'completed' },
    ],
  })

  const transferSummary = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'transfer', lanes: [transferLane, cancellationLane] })
  const cancellationSummary = buildAttorneyWorkflowCoordinationSummary({ laneKey: 'cancellation', lanes: [transferLane, cancellationLane] })

  assert.equal(transferSummary.items.find((item) => item.id === 'cancellation_cancellation_lodgement_ready').status, 'ready')
  assert.equal(cancellationSummary.items.find((item) => item.id === 'transfer_transfer_lodgement_ready').status, 'ready')
}

function verifyDoc() {
  const docSource = readFileSync(new URL('../docs/attorney-cancellation-lane-phase5-lodgement-coordination.md', import.meta.url), 'utf8')
  assert.match(docSource, /Cancellation Lane Phase 5 Lodgement Coordination/)
  assert.match(docSource, /cancellation\.cancellation_lodgement_ready/)
  assert.match(docSource, /transfer\.lodgement_ready/)
  assert.match(docSource, /Request Cancellation Readiness/)
  assert.match(docSource, /node scripts\/verify-attorney-cancellation-lane-phase5\.mjs/)
}

verifyPlan()
verifyTransferRequestsCancellationReadiness()
verifyCancellationRequestsTransferReadiness()
verifyReadyBothWays()
verifyDoc()

console.log('Attorney cancellation lane Phase 5 lodgement coordination verification passed.')
