import assert from 'node:assert/strict'
import { buildAttorneyWorkflowActionCommand } from '../src/constants/attorneyWorkflowUsability.js'

const fixedNow = '2026-07-06T00:00:00.000Z'

function verifyDocumentWorkPacket() {
  const command = buildAttorneyWorkflowActionCommand(
    {
      id: 'seller_id_document_request',
      type: 'request_document',
      label: 'Request Seller ID Document',
      description: 'Seller FICA is required before transfer documents can be prepared.',
      target: 'seller',
      priority: 'medium',
      laneKey: 'transfer',
      stageKey: 'fica_received',
    },
    { now: fixedNow },
  )

  assert.equal(command.commandType, 'request_document')
  assert.equal(command.workPacket.title, 'Seller ID Document')
  assert.equal(command.workPacket.laneLabel, 'Transfer Attorney')
  assert.equal(command.workPacket.stageLabel, 'Seller FICA Received')
  assert.equal(command.workPacket.audienceLabel, 'Seller')
  assert.equal(command.workPacket.priority, 'required')
  assert.equal(command.workPacket.visibility, 'client_visible')
  assert.equal(command.workPacket.dueDate, '2026-07-09')
  assert.equal(command.draft.priority, 'required')
  assert.equal(command.draft.visibility, 'client_visible')
  assert.equal(command.draft.dueDate, '2026-07-09')
  assert.equal(command.draft.workPacket, command.workPacket)
  assert.equal(command.workPacket.checklist.length >= 2, true)
}

function verifyCorrectedDocumentIsUrgent() {
  const command = buildAttorneyWorkflowActionCommand(
    {
      id: 'buyer_fica_correct_document',
      type: 'request_corrected_document',
      label: 'Request corrected Buyer FICA Pack',
      description: 'The uploaded copy is expired.',
      target: 'buyer',
      laneKey: 'transfer',
      stageKey: 'fica_received',
    },
    { now: fixedNow },
  )

  assert.equal(command.draft.priority, 'urgent')
  assert.equal(command.draft.visibility, 'client_visible')
  assert.equal(command.draft.dueDate, '2026-07-07')
  assert.match(command.workPacket.checklist.join(' '), /corrected/)
}

function verifyProfessionalRequestVisibility() {
  const command = buildAttorneyWorkflowActionCommand(
    {
      id: 'guarantee_request',
      type: 'request_document',
      label: 'Request Bank Guarantee Wording',
      description: 'Guarantees must match the transfer attorney requirements.',
      target: 'bank',
      priority: 'high',
      laneKey: 'bond',
      stageKey: 'guarantees_issued',
    },
    { now: fixedNow },
  )

  assert.equal(command.workPacket.laneLabel, 'Bond Attorney')
  assert.equal(command.workPacket.audienceLabel, 'Bank')
  assert.equal(command.workPacket.priority, 'urgent')
  assert.equal(command.workPacket.visibility, 'professional_shared')
  assert.equal(command.workPacket.dueDate, '2026-07-08')
  assert.equal(command.draft.requestedFrom, 'bank')
}

function verifyNonDocumentPackets() {
  const signingCommand = buildAttorneyWorkflowActionCommand(
    {
      id: 'buyer_signature_follow_up',
      type: 'manage_signing',
      label: 'Follow up Buyer Transfer Documents Signature',
      target: 'buyer',
      priority: 'high',
      laneKey: 'transfer',
      stageKey: 'buyer_signed_transfer_documents',
    },
    { now: fixedNow },
  )

  assert.equal(signingCommand.commandType, 'schedule_signing')
  assert.equal(signingCommand.workPacket.priority, 'urgent')
  assert.equal(signingCommand.workPacket.visibility, 'internal')
  assert.equal(signingCommand.workPacket.checklist.some((item) => /availability/i.test(item)), true)
  assert.equal(signingCommand.draft.workPacket, signingCommand.workPacket)

  const evidenceCommand = buildAttorneyWorkflowActionCommand(
    {
      id: 'lodgement_complete',
      type: 'complete_stage_evidence',
      label: 'Complete Lodged at Deeds Office',
      target: 'attorney',
      laneKey: 'transfer',
      stageKey: 'lodgement_submitted',
    },
    { now: fixedNow },
  )

  assert.equal(evidenceCommand.commandType, 'complete_step')
  assert.equal(evidenceCommand.workPacket.stageLabel, 'Lodged at Deeds Office')
  assert.equal(evidenceCommand.draft.workPacket, evidenceCommand.workPacket)
}

verifyDocumentWorkPacket()
verifyCorrectedDocumentIsUrgent()
verifyProfessionalRequestVisibility()
verifyNonDocumentPackets()

console.log('Attorney workflow Phase 4 work packet verification passed.')
