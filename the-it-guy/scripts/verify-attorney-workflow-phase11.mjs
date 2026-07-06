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

function verifyActionedCoordinationState() {
  const initial = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane],
  })
  const handoff = initial.items.find((item) => item.id === 'bond_bond_lodgement_ready')
  const command = buildAttorneyWorkflowCoordinationCommand(handoff, {
    laneKey: 'transfer',
    stageKey: 'lodgement_ready',
    now: fixedNow,
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane],
    timeline: [
      {
        id: 'update-bond-handoff',
        timestamp: '2026-07-06T12:00:00.000Z',
        message: 'Coordination request sent to bond attorney.',
        metadata: { workPacket: command.workPacket },
      },
    ],
  })
  const actioned = summary.items.find((item) => item.id === 'bond_bond_lodgement_ready')

  assert.equal(summary.counts.actioned, 1)
  assert.deepEqual(summary.actionedCoordinationIds, ['bond_bond_lodgement_ready'])
  assert.equal(actioned.actioned, true)
  assert.equal(actioned.status, 'waiting')
  assert.equal(actioned.statusLabel, 'Handoff Requested')
  assert.equal(actioned.actionedLabel, 'Handoff Requested')
  assert.equal(actioned.actionedAt, '2026-07-06T12:00:00.000Z')
  assert.equal(summary.primaryDependency.id, 'bond_bond_lodgement_ready')
}

function verifyUnactionedDependencyStaysPrimary() {
  const initial = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane],
  })
  const handoff = initial.items.find((item) => item.id === 'bond_bond_guarantees_issued')
  const command = buildAttorneyWorkflowCoordinationCommand(handoff, {
    laneKey: 'transfer',
    stageKey: 'lodgement_ready',
    now: fixedNow,
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane],
    timeline: [
      {
        id: 'update-guarantee-handoff',
        timestamp: '2026-07-06T10:00:00.000Z',
        message: 'Coordination request sent.',
        metadata: { workPacket: command.workPacket },
      },
    ],
  })

  assert.equal(summary.counts.actioned, 1)
  assert.equal(summary.primaryDependency.id, 'bond_bond_lodgement_ready')
  assert.equal(summary.items.find((item) => item.id === 'bond_bond_guarantees_issued').actioned, true)
  assert.equal(summary.items.find((item) => item.id === 'bond_bond_lodgement_ready').actioned, undefined)
}

function verifyPhase11Wiring() {
  const usabilitySource = readFileSync(new URL('../src/constants/attorneyWorkflowUsability.js', import.meta.url), 'utf8')
  const serviceSource = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
  const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

  assert.match(usabilitySource, /function buildCoordinationActionIndex/)
  assert.match(usabilitySource, /actionedCoordinationIds/)
  assert.match(serviceSource, /timeline:\s*lane\.coordinationTimeline \|\| lane\.timeline/)
  assert.match(pageSource, /counts\.actioned/)
  assert.match(pageSource, /item\.status !== 'ready' && \(!item\.actioned \|\| item\.escalationNeeded\)/)
  assert.match(pageSource, /Requested \{formatShortDayMonth\(item\.actionedAt\)\}/)
}

verifyActionedCoordinationState()
verifyUnactionedDependencyStaysPrimary()
verifyPhase11Wiring()

console.log('Attorney workflow Phase 11 coordination close-loop verification passed.')
