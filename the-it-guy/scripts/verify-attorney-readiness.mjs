import assert from 'node:assert/strict'
import { calculateAttorneyReadinessForOperations } from '../src/services/attorneyWorkflow/attorneyReadinessEngine.js'

function makeLane({
  laneKey = 'transfer',
  attorneyRole = 'transfer_attorney',
  assignment = true,
  completionPercent = 50,
  documentRequirements = [],
  signingRequirements = [],
  completedSteps = [],
  laneStatus = 'in_progress',
} = {}) {
  const labelByLane = {
    transfer: 'Transfer Attorney',
    bond: 'Bond Attorney',
    cancellation: 'Cancellation Attorney',
  }
  return {
    laneKey,
    attorneyRole,
    label: labelByLane[laneKey],
    assignment: assignment ? { id: `${laneKey}-assignment` } : null,
    laneStatus,
    currentStage: completedSteps.at(-1) || '',
    updatedAt: new Date().toISOString(),
    summary: { completionPercent, allComplete: completionPercent === 100 },
    steps: completedSteps.map((stepKey, index) => ({
      stepKey,
      status: 'completed',
      sortOrder: index + 1,
    })),
    documentRequirements,
    signingRequirements,
  }
}

function requiredDoc(id, label, status = 'missing', extra = {}) {
  return {
    id,
    label,
    required: true,
    affectsReadiness: true,
    status,
    complete: ['approved', 'completed'].includes(status),
    laneKey: extra.laneKey || 'transfer',
    attorneyRole: extra.attorneyRole || 'transfer_attorney',
    category: extra.category || 'fica',
    requiredFrom: extra.requiredFrom || 'buyer',
    visibilityDefault: extra.visibilityDefault || 'client_visible',
  }
}

function calculate(operations, manualBlockers = []) {
  return calculateAttorneyReadinessForOperations(operations, manualBlockers)
}

function verifyCashExcludesBond() {
  const operations = {
    transaction: { id: 'cash-1' },
    workflow: { transactionId: 'cash-1', requiredAttorneyRoles: ['transfer_attorney'], warnings: [] },
    lanes: [
      makeLane({
        completionPercent: 70,
        documentRequirements: [
          requiredDoc('buyer_fica', 'Buyer FICA', 'approved'),
          requiredDoc('seller_fica', 'Seller FICA', 'approved', { requiredFrom: 'seller' }),
        ],
        signingRequirements: [
          { id: 'buyer_transfer_signature', label: 'Buyer Transfer Signature', required: true, laneKey: 'transfer', attorneyRole: 'transfer_attorney', signerType: 'buyer' },
          { id: 'seller_transfer_signature', label: 'Seller Transfer Signature', required: true, laneKey: 'transfer', attorneyRole: 'transfer_attorney', signerType: 'seller' },
        ],
        completedSteps: ['buyer_signed', 'seller_signed'],
      }),
    ],
  }
  const readiness = calculate(operations)
  assert.equal(readiness.lanes.bond_attorney.required, false)
  assert.equal(readiness.blockers.some((item) => item.attorneyRole === 'bond_attorney'), false)
}

function verifyMissingAssignmentAndDocuments() {
  const operations = {
    transaction: { id: 'bond-1' },
    workflow: { transactionId: 'bond-1', requiredAttorneyRoles: ['transfer_attorney', 'bond_attorney'], warnings: [] },
    lanes: [
      makeLane({
        assignment: false,
        documentRequirements: [requiredDoc('buyer_fica', 'Buyer FICA', 'missing')],
        signingRequirements: [{ id: 'buyer_transfer_signature', label: 'Buyer Transfer Signature', required: true, laneKey: 'transfer', attorneyRole: 'transfer_attorney', signerType: 'buyer' }],
      }),
      makeLane({
        laneKey: 'bond',
        attorneyRole: 'bond_attorney',
        assignment: false,
        documentRequirements: [requiredDoc('bond_instruction', 'Bond Instruction', 'missing', { laneKey: 'bond', attorneyRole: 'bond_attorney', category: 'bond_documents' })],
        signingRequirements: [{ id: 'buyer_bond_documents_signature', label: 'Buyer Bond Documents Signature', required: true, laneKey: 'bond', attorneyRole: 'bond_attorney', signerType: 'buyer' }],
      }),
    ],
  }
  const readiness = calculate(operations)
  assert.equal(readiness.atRisk, true)
  assert.equal(readiness.blockers.some((item) => item.category === 'missing_assignment' && item.attorneyRole === 'transfer_attorney'), true)
  assert.equal(readiness.blockers.some((item) => item.id.includes('buyer_fica')), true)
  assert.equal(readiness.blockers.some((item) => item.attorneyRole === 'bond_attorney'), true)
}

function verifyManualBlockerAndLodgement() {
  const operations = {
    transaction: { id: 'ready-1' },
    workflow: { transactionId: 'ready-1', requiredAttorneyRoles: ['transfer_attorney'], warnings: [] },
    lanes: [
      makeLane({
        completionPercent: 90,
        documentRequirements: [
          requiredDoc('buyer_fica', 'Buyer FICA', 'approved'),
          requiredDoc('seller_fica', 'Seller FICA', 'approved', { requiredFrom: 'seller' }),
        ],
        signingRequirements: [
          { id: 'buyer_transfer_signature', label: 'Buyer Transfer Signature', required: true, laneKey: 'transfer', attorneyRole: 'transfer_attorney', signerType: 'buyer' },
          { id: 'seller_transfer_signature', label: 'Seller Transfer Signature', required: true, laneKey: 'transfer', attorneyRole: 'transfer_attorney', signerType: 'seller' },
        ],
        completedSteps: ['buyer_signed', 'seller_signed', 'lodgement_ready'],
      }),
    ],
  }
  const ready = calculate(operations)
  assert.equal(ready.lodgement.ready, true)

  const blocked = calculate(operations, [{ id: 'manual-1', title: 'Guarantee wording needs partner review', laneKey: 'transfer', severity: 'critical', owner: 'attorney' }])
  assert.equal(blocked.atRisk, true)
  assert.equal(blocked.blockers.some((item) => item.manual && item.severity === 'critical'), true)
}

verifyCashExcludesBond()
verifyMissingAssignmentAndDocuments()
verifyManualBlockerAndLodgement()

console.log('Attorney readiness verification passed.')

