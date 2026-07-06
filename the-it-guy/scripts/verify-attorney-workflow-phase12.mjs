import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildAttorneyWorkflowCoordinationCommand,
  buildAttorneyWorkflowCoordinationSummary,
} from '../src/constants/attorneyWorkflowUsability.js'

const requestNow = '2026-07-06T00:00:00.000Z'
const escalationNow = '2026-07-10T00:00:00.000Z'

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

function buildRequestedHandoffTimeline() {
  const initial = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane],
  })
  const handoff = initial.items.find((item) => item.id === 'bond_bond_lodgement_ready')
  const command = buildAttorneyWorkflowCoordinationCommand(handoff, {
    laneKey: 'transfer',
    stageKey: 'lodgement_ready',
    now: requestNow,
  })

  return [
    {
      id: 'update-bond-handoff',
      timestamp: '2026-07-06T12:00:00.000Z',
      message: 'Coordination request sent to bond attorney.',
      metadata: { workPacket: command.workPacket },
    },
  ]
}

function verifyOverdueHandoffNeedsEscalation() {
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane],
    timeline: buildRequestedHandoffTimeline(),
    now: escalationNow,
  })
  const item = summary.items.find((entry) => entry.id === 'bond_bond_lodgement_ready')

  assert.equal(summary.health, 'escalation')
  assert.equal(summary.counts.actioned, 1)
  assert.equal(summary.counts.escalationNeeded, 1)
  assert.equal(summary.counts.escalated, 0)
  assert.equal(summary.primaryDependency.id, 'bond_bond_lodgement_ready')
  assert.equal(item.actioned, true)
  assert.equal(item.status, 'waiting')
  assert.equal(item.statusLabel, 'Escalation Due')
  assert.equal(item.escalationNeeded, true)
  assert.equal(item.actionedDueDate, '2026-07-09')
  assert.equal(item.actionedDueInDays, -1)
  assert.equal(item.actionedAgeDays, 4)
}

function verifyEscalationCommand() {
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane],
    timeline: buildRequestedHandoffTimeline(),
    now: escalationNow,
  })
  const item = summary.items.find((entry) => entry.id === 'bond_bond_lodgement_ready')
  const command = buildAttorneyWorkflowCoordinationCommand(item, {
    laneKey: 'transfer',
    stageKey: 'lodgement_ready',
    now: escalationNow,
  })

  assert.equal(command.label, 'Escalate Handoff')
  assert.equal(command.commandType, 'add_note')
  assert.equal(command.coordinationId, undefined)
  assert.equal(command.workPacket.commandType, 'escalate_coordination')
  assert.equal(command.workPacket.priority, 'urgent')
  assert.equal(command.workPacket.sourceCoordinationId, 'bond_bond_lodgement_ready')
  assert.equal(command.workPacket.sourceCoordinationStatus, 'escalated')
  assert.equal(command.workPacket.dueDate, '2026-07-11')
  assert.match(command.draft.message, /Escalation for Bond Attorney/)
  assert.match(command.draft.message, /Requested response date was 2026-07-09/)
}

function verifySavedEscalationClosesEscalationButton() {
  const requestedTimeline = buildRequestedHandoffTimeline()
  const requestedSummary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane],
    timeline: requestedTimeline,
    now: escalationNow,
  })
  const item = requestedSummary.items.find((entry) => entry.id === 'bond_bond_lodgement_ready')
  const escalationCommand = buildAttorneyWorkflowCoordinationCommand(item, {
    laneKey: 'transfer',
    stageKey: 'lodgement_ready',
    now: escalationNow,
  })
  const summary = buildAttorneyWorkflowCoordinationSummary({
    laneKey: 'transfer',
    lanes: [transferLane, bondLane],
    timeline: [
      ...requestedTimeline,
      {
        id: 'update-bond-escalation',
        timestamp: '2026-07-10T09:00:00.000Z',
        message: 'Escalated unresolved bond lodgement readiness.',
        metadata: { workPacket: escalationCommand.workPacket },
      },
    ],
    now: '2026-07-12T00:00:00.000Z',
  })
  const escalated = summary.items.find((entry) => entry.id === 'bond_bond_lodgement_ready')

  assert.equal(summary.counts.actioned, 1)
  assert.equal(summary.counts.escalationNeeded, 0)
  assert.equal(summary.counts.escalated, 1)
  assert.equal(escalated.escalated, true)
  assert.equal(escalated.escalationNeeded, false)
  assert.equal(escalated.statusLabel, 'Escalated')
  assert.equal(escalated.escalatedAt, '2026-07-10T09:00:00.000Z')
}

function verifyPhase12Wiring() {
  const usabilitySource = readFileSync(new URL('../src/constants/attorneyWorkflowUsability.js', import.meta.url), 'utf8')
  const serviceSource = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
  const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

  assert.match(usabilitySource, /function daysSince/)
  assert.match(usabilitySource, /function buildCoordinationEscalationCommand/)
  assert.match(usabilitySource, /escalationNeeded/)
  assert.match(serviceSource, /coordinationSummaryNow/)
  assert.match(serviceSource, /coordinationTimeline:\s*laneTimeline/)
  assert.match(serviceSource, /timeline:\s*lane\.coordinationTimeline \|\| lane\.timeline/)
  assert.match(serviceSource, /now:\s*coordinationSummaryNow/)
  assert.match(pageSource, /counts\.escalationNeeded/)
  assert.match(pageSource, /item\.escalationNeeded \? 'escalation' : item\.status/)
  assert.match(pageSource, /\(!item\.actioned \|\| item\.escalationNeeded\)/)
  assert.match(pageSource, /Escalation due/)
}

verifyOverdueHandoffNeedsEscalation()
verifyEscalationCommand()
verifySavedEscalationClosesEscalationButton()
verifyPhase12Wiring()

console.log('Attorney workflow Phase 12 coordination escalation verification passed.')
