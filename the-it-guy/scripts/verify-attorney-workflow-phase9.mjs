import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAttorneyWorkflowCoordinationSummary } from '../src/constants/attorneyWorkflowUsability.js'

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
  currentStage: 'guarantees_received',
  steps: [
    { stepKey: 'instruction_received', status: 'completed' },
    { stepKey: 'guarantees_received', status: 'completed' },
    { stepKey: 'transfer_guarantees_accepted', status: 'waiting' },
    { stepKey: 'lodgement_ready', status: 'not_started' },
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
    { stepKey: 'cancellation_guarantees_accepted', status: 'not_started' },
    { stepKey: 'cancellation_lodgement_ready', status: 'not_started' },
  ],
})

function verifyTransferCoordination() {
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane, cancellationLane],
  })

  assert.equal(summary.health, 'blocked')
  assert.equal(summary.counts.total, 4)
  assert.equal(summary.counts.ready, 1)
  assert.equal(summary.counts.waiting, 1)
  assert.equal(summary.counts.blocked, 2)
  assert.equal(summary.primaryDependency.laneKey, 'cancellation')
  assert.equal(summary.items.find((item) => item.id === 'bond_bond_guarantees_issued').status, 'ready')
  assert.equal(summary.items.find((item) => item.id === 'bond_bond_lodgement_ready').status, 'waiting')
  assert.equal(summary.items.find((item) => item.id === 'cancellation_cancellation_guarantees_accepted').status, 'blocked')
}

function verifyBondCoordination() {
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'bond',
    lanes: [transferLane, bondLane],
  })

  assert.equal(summary.health, 'waiting')
  assert.equal(summary.counts.total, 2)
  assert.equal(summary.counts.waiting, 2)
  assert.equal(summary.primaryDependency.title, 'Transfer guarantee acceptance')
}

function verifyReadyCoordination() {
  const readyTransfer = lane('transfer', {
    currentStage: 'lodgement_ready',
    steps: [
      { stepKey: 'instruction_received', status: 'completed' },
      { stepKey: 'transfer_guarantees_accepted', status: 'completed' },
      { stepKey: 'lodgement_ready', status: 'completed' },
    ],
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'bond',
    lanes: [readyTransfer, bondLane],
  })

  assert.equal(summary.health, 'ready')
  assert.equal(summary.counts.ready, 2)
  assert.equal(summary.items.every((item) => item.status === 'ready'), true)
}

function verifyNoDependencyLaneIsClear() {
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane],
  })

  assert.equal(summary.health, 'clear')
  assert.equal(summary.counts.total, 0)
  assert.equal(summary.primaryDependency, null)
}

function verifyPhase9Wiring() {
  const usabilitySource = readFileSync(new URL('../src/constants/attorneyWorkflowUsability.js', import.meta.url), 'utf8')
  const serviceSource = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
  const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

  assert.match(usabilitySource, /export function buildAttorneyWorkflowCoordinationSummary/)
  assert.match(usabilitySource, /COORDINATION_RULES/)
  assert.match(serviceSource, /buildAttorneyWorkflowCoordinationSummary/)
  assert.match(serviceSource, /coordinationSummary:/)
  assert.match(pageSource, /function LegalWorkflowCoordinationPanel/)
  assert.match(pageSource, /summary=\{lane\.coordinationSummary\}/)
  assert.match(pageSource, /summary=\{lane\?\.coordinationSummary\}/)
}

verifyTransferCoordination()
verifyBondCoordination()
verifyReadyCoordination()
verifyNoDependencyLaneIsClear()
verifyPhase9Wiring()

console.log('Attorney workflow Phase 9 coordination verification passed.')
