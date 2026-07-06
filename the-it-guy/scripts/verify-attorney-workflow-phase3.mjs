import assert from 'node:assert/strict'
import {
  buildAttorneyLaneUsabilitySnapshot,
  buildAttorneyWorkflowActionCommand,
} from '../src/constants/attorneyWorkflowUsability.js'

function verifyDocumentCommandFromSnapshot() {
  const snapshot = buildAttorneyLaneUsabilitySnapshot({
    laneKey: 'transfer',
    label: 'Transfer Attorney',
    assignment: { id: 'assignment' },
    laneStatus: 'in_progress',
    currentStage: 'fica_received',
    steps: [{ stepKey: 'fica_received', status: 'in_progress' }],
    dataRequirements: [{ id: 'matter_number', label: 'Matter Number', complete: true, required: true }],
    documentRequirements: [
      {
        id: 'seller_id_document',
        label: 'Seller ID Document',
        required: true,
        affectsReadiness: true,
        status: 'missing',
        requiredFrom: 'seller',
        reason: 'Seller FICA is required before transfer documents can be prepared.',
      },
    ],
    signingRequirements: [],
  })

  const command = buildAttorneyWorkflowActionCommand(snapshot.primaryNextAction)

  assert.equal(snapshot.primaryNextAction.type, 'request_document')
  assert.equal(command.commandType, 'request_document')
  assert.equal(command.label, 'Request Document')
  assert.equal(command.draft.title, 'Seller ID Document')
  assert.equal(command.draft.requestedFrom, 'seller')
  assert.match(command.draft.description, /Seller FICA is required/)
}

function verifyCorrectedDocumentCommand() {
  const command = buildAttorneyWorkflowActionCommand({
    id: 'buyer_fica_correct_document',
    type: 'request_corrected_document',
    label: 'Request corrected Buyer FICA Pack',
    description: 'The uploaded copy is expired.',
    target: 'buyer',
    laneKey: 'transfer',
    stageKey: 'fica_received',
  })

  assert.equal(command.commandType, 'request_document')
  assert.equal(command.label, 'Request Correction')
  assert.equal(command.draft.title, 'Buyer FICA Pack')
  assert.equal(command.draft.requestedFrom, 'buyer')
  assert.match(command.draft.description, /corrected Buyer FICA Pack/)
}

function verifySigningAndEvidenceCommands() {
  const signingCommand = buildAttorneyWorkflowActionCommand({
    id: 'buyer_signature_follow_up',
    type: 'manage_signing',
    label: 'Follow up Buyer Transfer Documents Signature',
    description: 'Required signing is still outstanding.',
    target: 'buyer',
    laneKey: 'transfer',
    stageKey: 'buyer_signed_transfer_documents',
  })

  assert.equal(signingCommand.commandType, 'schedule_signing')
  assert.equal(signingCommand.label, 'Schedule Signing')
  assert.equal(signingCommand.draft.visibility, 'internal')
  assert.match(signingCommand.draft.message, /Buyer Transfer Documents Signature/)

  const evidenceCommand = buildAttorneyWorkflowActionCommand({
    id: 'lodged_at_deeds_office_complete_evidence',
    type: 'complete_stage_evidence',
    label: 'Complete Lodged at Deeds Office',
    description: 'Capture lodgement receipt and deeds office tracking reference.',
    laneKey: 'transfer',
    stageKey: 'lodgement_submitted',
  })

  assert.equal(evidenceCommand.commandType, 'complete_step')
  assert.equal(evidenceCommand.label, 'Complete Stage')
  assert.equal(evidenceCommand.stageKey, 'lodged_at_deeds_office')
  assert.equal(evidenceCommand.draft.status, 'completed')
  assert.match(evidenceCommand.draft.note, /lodgement receipt/)
}

function verifyNotesAndAssignments() {
  const dataCommand = buildAttorneyWorkflowActionCommand({
    id: 'purchase_price_capture_data',
    type: 'update_matter_data',
    label: 'Capture Purchase Price',
    description: 'Required for transfer duty and statement of account.',
    target: 'attorney',
    laneKey: 'transfer',
  })

  assert.equal(dataCommand.commandType, 'add_note')
  assert.equal(dataCommand.label, 'Add Data Note')
  assert.match(dataCommand.draft.message, /Purchase Price/)

  const blockerCommand = buildAttorneyWorkflowActionCommand({
    id: 'bond_resolve_blocker',
    type: 'resolve_blocker',
    label: 'Resolve Guarantees Issued blocker',
    description: 'Bank guarantee wording must be corrected.',
    target: 'bond_attorney',
    laneKey: 'bond',
    stageKey: 'guarantees_issued',
  })

  assert.equal(blockerCommand.commandType, 'add_note')
  assert.equal(blockerCommand.laneKey, 'bond')
  assert.match(blockerCommand.draft.message, /guarantee wording/)

  const assignmentCommand = buildAttorneyWorkflowActionCommand({
    id: 'cancellation_assign_attorney',
    type: 'assign_attorney',
    label: 'Assign Cancellation Attorney',
    target: 'management',
    laneKey: 'cancellation',
  })

  assert.equal(assignmentCommand.commandType, 'open_assignments')
  assert.equal(assignmentCommand.label, 'Open Assignment')
}

verifyDocumentCommandFromSnapshot()
verifyCorrectedDocumentCommand()
verifySigningAndEvidenceCommands()
verifyNotesAndAssignments()

console.log('Attorney workflow Phase 3 command verification passed.')
