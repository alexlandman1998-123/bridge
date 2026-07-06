import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildAttorneyWorkflowActionCommand,
  normalizeAttorneyWorkflowWorkPacket,
} from '../src/constants/attorneyWorkflowUsability.js'

function verifyWorkPacketNormalization() {
  const packet = normalizeAttorneyWorkflowWorkPacket({
    title: '  Request Seller ID Document  ',
    laneKey: 'transfer_attorney',
    stageKey: 'fica_received',
    commandType: 'request_document',
    audience: 'seller',
    audienceLabel: 'Seller',
    priority: 'urgent',
    visibility: 'client',
    dueDate: '2026-07-07',
    checklist: [' Confirm document name. ', '', ' Check routing. ', 'Store audit context.', 'Too much 1', 'Too much 2', 'Too much 3'],
  })

  assert.equal(packet.title, 'Request Seller ID Document')
  assert.equal(packet.laneKey, 'transfer')
  assert.equal(packet.stageLabel, 'Seller FICA Received')
  assert.equal(packet.priorityLabel, 'Urgent')
  assert.equal(packet.visibility, 'client_visible')
  assert.equal(packet.visibilityLabel, 'Client Visible')
  assert.equal(packet.checklist.length, 6)
  assert.equal(packet.checklist[0], 'Confirm document name.')
}

function verifyCommandSharesNormalizedPacket() {
  const command = buildAttorneyWorkflowActionCommand(
    {
      id: 'bank_guarantee_request',
      type: 'request_document',
      label: 'Request Bank Guarantee Wording',
      target: 'bank',
      priority: 'high',
      laneKey: 'bond',
      stageKey: 'guarantees_issued',
    },
    { now: '2026-07-06T00:00:00.000Z' },
  )

  assert.equal(command.workPacket.laneLabel, 'Bond Attorney')
  assert.equal(command.workPacket.visibility, 'professional_shared')
  assert.equal(command.workPacket.priority, 'urgent')
  assert.equal(command.draft.workPacket, command.workPacket)
}

function verifyPersistenceWiring() {
  const serviceSource = readFileSync(new URL('../src/services/attorneyWorkflow/attorneyWorkflowLaneService.js', import.meta.url), 'utf8')
  const pageSource = readFileSync(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')

  assert.match(serviceSource, /normalizeAttorneyWorkflowWorkPacket/)
  assert.match(serviceSource, /function buildWorkPacketMetadata/)
  assert.match(serviceSource, /workPacketMetadata/)
  assert.match(serviceSource, /metadata:\s*\{ stepId:[\s\S]*\.\.\.workPacketMetadata/)
  assert.match(serviceSource, /eventData:\s*\{[\s\S]*\.\.\.workPacketMetadata/)
  assert.match(pageSource, /workPacket:\s*workflowStepDraft\.workPacket/)
  assert.match(pageSource, /workPacket:\s*workflowNoteDraft\.workPacket/)
  assert.match(pageSource, /workPacket:\s*workflowDocumentDraft\.workPacket/)
  assert.match(pageSource, /function WorkflowActivityPacketMeta/)
}

verifyWorkPacketNormalization()
verifyCommandSharesNormalizedPacket()
verifyPersistenceWiring()

console.log('Attorney workflow Phase 5 audit packet verification passed.')
