import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildAttorneyWorkflowFollowUpCommand,
  buildAttorneyWorkflowFollowUpSummary,
} from '../src/constants/attorneyWorkflowUsability.js'

const fixedNow = '2026-07-06T00:00:00.000Z'

function verifyCorrectionFollowUpCommand() {
  const summary = buildAttorneyWorkflowFollowUpSummary({
    laneKey: 'transfer',
    now: fixedNow,
    documentRequests: [
      {
        id: 'buyer-fica',
        title: 'Buyer FICA Pack',
        lane_key: 'transfer',
        requested_from: 'buyer',
        priority: 'required',
        review_status: 'rejected',
        rejected_reason: 'Proof of address is older than three months.',
        due_date: '2026-07-07',
        visibility_scope: 'client_visible',
      },
    ],
  })

  const followUp = summary.primaryFollowUp
  const command = buildAttorneyWorkflowFollowUpCommand(followUp, { now: fixedNow })

  assert.equal(followUp.title, 'Correct Buyer FICA Pack')
  assert.equal(command.commandType, 'request_document')
  assert.equal(command.label, 'Request Correction')
  assert.equal(command.followUpId, followUp.id)
  assert.equal(command.workPacket.title, 'Buyer FICA Pack')
  assert.equal(command.workPacket.priority, 'urgent')
  assert.equal(command.workPacket.visibility, 'client_visible')
  assert.equal(command.workPacket.dueDate, '2026-07-07')
  assert.equal(command.draft.title, 'Buyer FICA Pack')
  assert.equal(command.draft.requestedFrom, 'buyer')
  assert.equal(command.draft.priority, 'urgent')
  assert.equal(command.draft.visibility, 'client_visible')
  assert.equal(command.draft.dueDate, '2026-07-07')
  assert.equal(command.draft.workPacket, command.workPacket)
}

function verifySigningFollowUpCommand() {
  const command = buildAttorneyWorkflowFollowUpCommand(
    {
      id: 'packet_buyer_signing',
      source: 'work_packet',
      title: 'Buyer signing appointment',
      description: 'Confirm signer availability.',
      laneKey: 'transfer',
      stageKey: 'buyer_signing_scheduled',
      commandType: 'schedule_signing',
      audience: 'buyer',
      audienceLabel: 'Buyer',
      priority: 'required',
      priorityLabel: 'Required',
      visibility: 'internal',
      dueDate: '2026-07-08',
      status: 'due_soon',
      statusLabel: 'Due Soon',
      checklist: ['Confirm signer availability.', 'Confirm document pack is ready.'],
    },
    { now: fixedNow },
  )

  assert.equal(command.commandType, 'schedule_signing')
  assert.equal(command.label, 'Schedule Signing')
  assert.equal(command.followUpId, 'packet_buyer_signing')
  assert.equal(command.workPacket.title, 'Buyer signing appointment')
  assert.equal(command.workPacket.audience, 'buyer')
  assert.equal(command.workPacket.dueDate, '2026-07-08')
  assert.deepEqual(command.workPacket.checklist, ['Confirm signer availability.', 'Confirm document pack is ready.'])
  assert.equal(command.draft.visibility, 'internal')
  assert.equal(command.draft.workPacket, command.workPacket)
}

function verifyPhase7Wiring() {
  const usabilitySource = readFileSync(new URL('../src/constants/attorneyWorkflowUsability.js', import.meta.url), 'utf8')
  const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

  assert.match(usabilitySource, /export function buildAttorneyWorkflowFollowUpCommand/)
  assert.match(pageSource, /function LegalWorkflowFollowUpQueue\(\{ summary = null, compact = false, onExecuteFollowUp = null \}\)/)
  assert.match(pageSource, /buildAttorneyWorkflowFollowUpCommand\(item, \{ laneKey: summary\.laneKey \}\)/)
  assert.match(pageSource, /onClick=\{\(\) => onExecuteFollowUp\(item, command\)\}/)
  assert.match(pageSource, /function handleWorkflowFollowUpCommand/)
  assert.match(pageSource, /onExecuteFollowUp=\{\(followUp, command\) => handleWorkflowFollowUpCommand\(lane, followUp, command\)\}/)
  assert.match(pageSource, /onExecuteFollowUp=\{\(followUp, command\) => onExecuteFollowUp\?\.\(lane, followUp, command\)\}/)
  assert.match(pageSource, /onExecuteFollowUp=\{handleWorkflowFollowUpCommand\}/)
}

verifyCorrectionFollowUpCommand()
verifySigningFollowUpCommand()
verifyPhase7Wiring()

console.log('Attorney workflow Phase 7 triage action verification passed.')
