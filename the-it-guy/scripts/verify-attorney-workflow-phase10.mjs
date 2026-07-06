import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildAttorneyWorkflowCoordinationCommand,
  buildAttorneyWorkflowCoordinationSummary,
} from '../src/constants/attorneyWorkflowUsability.js'

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

const transferLane = lane('transfer', {
  currentStage: 'lodgement_ready',
  steps: [
    { stepKey: 'instruction_received', status: 'completed' },
    { stepKey: 'transfer_guarantees_accepted', status: 'completed' },
    { stepKey: 'lodgement_ready', status: 'waiting' },
  ],
})

const bondLane = lane('bond', {
  currentStage: 'guarantees_issued',
  steps: [
    { stepKey: 'bond_instruction_received', status: 'completed' },
    { stepKey: 'guarantees_issued', status: 'completed' },
    { stepKey: 'bond_lodgement_ready', status: 'waiting' },
  ],
})

const cancellationLane = lane('cancellation', {
  assignment: null,
  currentStage: 'cancellation_guarantees_received',
  steps: [
    { stepKey: 'cancellation_instruction_received', status: 'completed' },
    { stepKey: 'cancellation_guarantees_received', status: 'waiting' },
    { stepKey: 'cancellation_lodgement_ready', status: 'not_started' },
  ],
})

function verifyWaitingCoordinationCommand() {
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane],
  })
  const item = summary.items.find((entry) => entry.id === 'bond_bond_lodgement_ready')
  const command = buildAttorneyWorkflowCoordinationCommand(item, {
    laneKey: 'transfer',
    stageKey: 'lodgement_ready',
    now: fixedNow,
  })

  assert.equal(command.commandType, 'add_note')
  assert.equal(command.label, 'Request Handoff')
  assert.equal(command.laneKey, 'transfer')
  assert.equal(command.draft.visibility, 'professional_shared')
  assert.match(command.draft.message, /Coordination request for Bond Attorney/)
  assert.match(command.draft.message, /Needed: Bond Lodgement Pack Ready/)
  assert.equal(command.draft.workPacket, command.workPacket)
  assert.equal(command.workPacket.laneKey, 'transfer')
  assert.equal(command.workPacket.stageKey, 'lodgement_ready')
  assert.equal(command.workPacket.visibility, 'professional_shared')
  assert.equal(command.workPacket.sourceCoordinationId, 'bond_bond_lodgement_ready')
  assert.equal(command.workPacket.sourceCoordinationLaneKey, 'bond')
  assert.equal(command.workPacket.sourceCoordinationTargetStage, 'bond_lodgement_ready')
  assert.equal(command.workPacket.sourceCoordinationStatus, 'waiting')
}

function verifyBlockedCoordinationCommand() {
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, cancellationLane],
  })
  const item = summary.items.find((entry) => entry.id === 'cancellation_cancellation_lodgement_ready')
  const command = buildAttorneyWorkflowCoordinationCommand(item, {
    laneKey: 'transfer',
    stageKey: 'lodgement_ready',
    now: fixedNow,
  })

  assert.equal(command.commandType, 'open_assignments')
  assert.equal(command.label, 'Open Assignment')
  assert.equal(command.coordinationId, 'cancellation_cancellation_lodgement_ready')
  assert.equal(command.dependencyLaneKey, 'cancellation')
  assert.equal(command.workPacket.priority, 'urgent')
  assert.equal(command.workPacket.sourceCoordinationId, 'cancellation_cancellation_lodgement_ready')
  assert.equal(command.workPacket.sourceCoordinationLaneKey, 'cancellation')
  assert.equal(command.workPacket.sourceCoordinationStatus, 'blocked')
}

function verifyReadyCoordinationCommandIsInformational() {
  const readyBond = lane('bond', {
    currentStage: 'bond_lodgement_ready',
    steps: [
      { stepKey: 'guarantees_issued', status: 'completed' },
      { stepKey: 'bond_lodgement_ready', status: 'completed' },
    ],
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, readyBond],
  })
  const item = summary.items.find((entry) => entry.id === 'bond_bond_lodgement_ready')
  const command = buildAttorneyWorkflowCoordinationCommand(item, {
    laneKey: 'transfer',
    stageKey: 'lodgement_ready',
    now: fixedNow,
  })

  assert.equal(item.status, 'ready')
  assert.equal(command.commandType, 'add_note')
  assert.equal(command.label, 'Add Coordination Note')
  assert.equal(command.workPacket.sourceCoordinationStatus, 'ready')
}

function verifyPhase10Wiring() {
  const usabilitySource = readFileSync(new URL('../src/constants/attorneyWorkflowUsability.js', import.meta.url), 'utf8')
  const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

  assert.match(usabilitySource, /export function buildAttorneyWorkflowCoordinationCommand/)
  assert.match(usabilitySource, /sourceCoordinationId/)
  assert.match(pageSource, /buildAttorneyWorkflowCoordinationCommand\(item, \{ laneKey: summary\.laneKey, stageKey \}\)/)
  assert.match(pageSource, /item\.status !== 'ready'/)
  assert.match(pageSource, /function handleWorkflowCoordinationCommand/)
  assert.match(pageSource, /onExecuteCoordination=\{\(item, command\) => handleWorkflowCoordinationCommand\(lane, item, command\)\}/)
  assert.match(pageSource, /onExecuteCoordination=\{handleWorkflowCoordinationCommand\}/)
}

verifyWaitingCoordinationCommand()
verifyBlockedCoordinationCommand()
verifyReadyCoordinationCommandIsInformational()
verifyPhase10Wiring()

console.log('Attorney workflow Phase 10 coordination action verification passed.')
