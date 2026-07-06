import assert from 'node:assert/strict'
import { buildAttorneyLaneUsabilitySnapshot } from '../src/constants/attorneyWorkflowUsability.js'

function dataRequirement(id, label, complete = false, extra = {}) {
  return {
    id,
    label,
    required: true,
    complete,
    status: complete ? 'complete' : 'missing',
    severity: extra.severity || 'medium',
    owner: extra.owner || 'attorney',
    description: extra.description || `${label} is required.`,
  }
}

function documentRequirement(id, label, status = 'missing', extra = {}) {
  return {
    id,
    label,
    required: true,
    affectsReadiness: true,
    complete: ['approved', 'completed'].includes(status),
    status,
    category: extra.category || 'transaction_documents',
    requiredFrom: extra.requiredFrom || 'client',
    reason: extra.reason || `${label} is required.`,
  }
}

function signatureRequirement(id, label, extra = {}) {
  return {
    id,
    label,
    required: true,
    signerType: extra.signerType || 'client',
  }
}

function verifyAssignmentFirst() {
  const snapshot = buildAttorneyLaneUsabilitySnapshot({
    laneKey: 'transfer',
    label: 'Transfer Attorney',
    assignment: null,
    laneStatus: 'in_progress',
    currentStage: 'matter_opened',
    summary: { completionPercent: 2 },
    steps: [{ stepKey: 'matter_opened', status: 'in_progress' }],
    dataRequirements: [dataRequirement('matter_number', 'Matter Number', false, { severity: 'high' })],
    documentRequirements: [documentRequirement('sales_agreement_or_otp', 'Sales Agreement / OTP')],
    signingRequirements: [],
  })

  assert.equal(snapshot.primaryNextAction.type, 'assign_attorney')
  assert.equal(snapshot.primaryNextAction.priority, 'critical')
  assert.equal(snapshot.readinessChecklist.some((item) => item.id === 'assignment' && !item.complete), true)
  assert.equal(snapshot.evidenceChecklist.length > 0, true)
}

function verifyMissingDataBeforeDocuments() {
  const snapshot = buildAttorneyLaneUsabilitySnapshot({
    laneKey: 'cancellation',
    label: 'Cancellation Attorney',
    assignment: { id: 'assignment' },
    laneStatus: 'in_progress',
    currentStage: 'cancellation_bank_captured',
    summary: { completionPercent: 10 },
    steps: [{ stepKey: 'cancellation_bank_captured', status: 'in_progress' }],
    dataRequirements: [
      dataRequirement('cancellation_bank', 'Cancellation Bank', false, { severity: 'high', owner: 'seller' }),
      dataRequirement('cancellation_bond_account_number', 'Bond Account Number', false, { severity: 'high', owner: 'seller' }),
    ],
    documentRequirements: [documentRequirement('cancellation_figures', 'Cancellation Figures')],
    signingRequirements: [],
  })

  assert.equal(snapshot.primaryNextAction.type, 'update_matter_data')
  assert.equal(snapshot.primaryNextAction.label, 'Capture Cancellation Bank')
  assert.equal(snapshot.missingData.length, 2)
  assert.equal(snapshot.outstandingDocuments.length, 1)
  assert.equal(snapshot.readinessChecklist.find((item) => item.id === 'data')?.missingCount, 2)
}

function verifySignaturesAndEvidence() {
  const snapshot = buildAttorneyLaneUsabilitySnapshot({
    laneKey: 'transfer',
    label: 'Transfer Attorney',
    assignment: { id: 'assignment' },
    laneStatus: 'in_progress',
    currentStage: 'buyer_signed_transfer_documents',
    summary: { completionPercent: 60 },
    steps: [
      { stepKey: 'buyer_signing_scheduled', status: 'completed' },
      { stepKey: 'buyer_signed_transfer_documents', status: 'in_progress' },
    ],
    dataRequirements: [dataRequirement('matter_number', 'Matter Number', true)],
    documentRequirements: [documentRequirement('buyer_signed_transfer_documents', 'Buyer Signed Transfer Documents', 'approved')],
    signingRequirements: [signatureRequirement('buyer_transfer_documents_signature', 'Buyer Transfer Documents Signature', { signerType: 'buyer' })],
  })

  assert.equal(snapshot.primaryNextAction.type, 'manage_signing')
  assert.equal(snapshot.outstandingSignatures.length, 1)
  assert.equal(snapshot.evidenceChecklist.some((item) => item.stageKey === 'buyer_signed_transfer_documents' && !item.complete), true)
}

function verifyReviewWhenClear() {
  const snapshot = buildAttorneyLaneUsabilitySnapshot({
    laneKey: 'bond',
    label: 'Bond Attorney',
    assignment: { id: 'assignment' },
    laneStatus: 'completed',
    currentStage: 'bond_close_out_complete',
    summary: { completionPercent: 100, allComplete: true },
    steps: [{ stepKey: 'bond_close_out_complete', status: 'completed' }],
    dataRequirements: [dataRequirement('bond_bank', 'Bond Bank', true)],
    documentRequirements: [documentRequirement('bond_instruction', 'Bond Instruction', 'approved')],
    signingRequirements: [],
  })

  assert.equal(snapshot.primaryNextAction.type, 'review_workflow')
  assert.equal(snapshot.primaryNextAction.priority, 'low')
  assert.equal(snapshot.workflowState, 'complete')
  assert.equal(snapshot.readinessChecklist.every((item) => item.complete), true)
}

verifyAssignmentFirst()
verifyMissingDataBeforeDocuments()
verifySignaturesAndEvidence()
verifyReviewWhenClear()

console.log('Attorney workflow Phase 2 usability verification passed.')
