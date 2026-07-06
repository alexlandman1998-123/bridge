import assert from 'node:assert/strict'
import {
  getAttorneyDataRequirementsForLane,
  getAttorneyEvidenceRequirementsForStage,
  getAttorneyReadinessGatesForLane,
  getAttorneyStageDefinitionsForLane,
  getAttorneyWorkflowStatusBucket,
  normalizeAttorneyStageKey,
  resolveAttorneyDataRequirementsForLane,
  resolveAttorneyWorkflowState,
} from '../src/constants/attorneyWorkflowStages.js'
import { getAttorneyUpdateType } from '../src/constants/attorneyUpdateTypes.js'
import { calculateAttorneyReadinessForOperations } from '../src/services/attorneyWorkflow/attorneyReadinessEngine.js'
import { resolveTransactionFacts } from '../src/services/attorneyWorkflow/transactionFactsResolver.js'

function keys(laneKey) {
  return getAttorneyStageDefinitionsForLane(laneKey).map((stage) => stage.key)
}

function assertIncludesAll(actual, expected, message) {
  for (const item of expected) {
    assert.equal(actual.includes(item), true, `${message}: missing ${item}`)
  }
}

function assertEveryStageHasEvidence(laneKey) {
  for (const stage of getAttorneyStageDefinitionsForLane(laneKey)) {
    assert.ok(stage.ownerRole, `${laneKey}:${stage.key} must have an owner role`)
    assert.ok(stage.statusBucket, `${laneKey}:${stage.key} must have a status bucket`)
    assert.ok(getAttorneyEvidenceRequirementsForStage(stage.key, laneKey).length, `${laneKey}:${stage.key} must have evidence requirements`)
  }
}

const transferKeys = keys('transfer')
const bondKeys = keys('bond')
const cancellationKeys = keys('cancellation')

assertIncludesAll(transferKeys, [
  'matter_opened',
  'otp_source_docs_checked',
  'buyer_fica_requested',
  'buyer_fica_received',
  'buyer_fica_approved',
  'seller_fica_requested',
  'seller_fica_received',
  'seller_fica_approved',
  'entity_authority_checked',
  'title_deed_checked',
  'existing_bond_confirmed',
  'transfer_duty_assessment_prepared',
  'transfer_duty_submitted',
  'transfer_duty_receipt_received',
  'rates_figures_requested',
  'rates_payment_confirmed',
  'rates_clearance_received',
  'compliance_certificates_received',
  'transfer_guarantees_accepted',
  'lodgement_pack_prepared',
  'registered',
  'final_accounts_prepared',
  'registration_letter_issued',
  'matter_closed',
], 'transfer phase 1 stages')

assertIncludesAll(bondKeys, [
  'bank_reference_captured',
  'bond_approval_letter_received',
  'bank_requirements_confirmed',
  'bank_conditions_outstanding',
  'bank_conditions_resolved',
  'buyer_bond_signing_scheduled',
  'bond_documents_sent_to_bank',
  'bank_approval_to_lodge_received',
  'guarantee_wording_accepted',
  'bond_lodgement_ready',
  'bond_registered',
  'bond_close_out_complete',
], 'bond phase 1 stages')

assertIncludesAll(cancellationKeys, [
  'cancellation_existing_bond_confirmed',
  'cancellation_bank_captured',
  'cancellation_bond_account_captured',
  'notice_period_captured',
  'figures_expiry_captured',
  'notice_penalty_risk_captured',
  'cancellation_guarantees_requested',
  'cancellation_guarantees_received',
  'cancellation_guarantees_accepted',
  'seller_cancellation_documents_signed',
  'cancellation_lodgement_ready',
  'settlement_proof_captured',
  'cancellation_close_out_complete',
], 'cancellation phase 1 stages')

assert.equal(transferKeys.at(-1), 'matter_closed')
assert.equal(bondKeys.at(-1), 'bond_close_out_complete')
assert.equal(cancellationKeys.at(-1), 'cancellation_close_out_complete')

for (const laneKey of ['transfer', 'bond', 'cancellation']) {
  assertEveryStageHasEvidence(laneKey)
}

assert.equal(normalizeAttorneyStageKey('fica_requested', 'transfer'), 'buyer_fica_requested')
assert.equal(normalizeAttorneyStageKey('fica_received', 'transfer'), 'seller_fica_received')
assert.equal(normalizeAttorneyStageKey('rates_clearance_requested', 'transfer'), 'rates_figures_requested')
assert.equal(normalizeAttorneyStageKey('bank_conditions_reviewed', 'bond'), 'bank_requirements_confirmed')
assert.equal(normalizeAttorneyStageKey('cancellation_complete', 'cancellation'), 'cancellation_close_out_complete')
assert.equal(getAttorneyUpdateType('cancellation_complete')?.id, 'cancellation_close_out_complete')

assert.equal(getAttorneyWorkflowStatusBucket('lodgement_ready', 'transfer'), 'ready')
assert.equal(getAttorneyWorkflowStatusBucket('lodged_at_deeds_office', 'transfer'), 'lodged')
assert.equal(getAttorneyWorkflowStatusBucket('registered', 'transfer'), 'registered')
assert.equal(getAttorneyWorkflowStatusBucket('matter_closed', 'transfer'), 'complete')
assert.equal(resolveAttorneyWorkflowState({ laneKey: 'transfer', laneStatus: 'in_progress', currentStage: 'lodged_at_deeds_office' }), 'lodged')

const facts = resolveTransactionFacts({
  id: 'phase-1',
  finance_type: 'bond',
  transaction_type: 'resale',
  buyer_entity_type: 'company',
  seller_entity_type: 'trust',
  seller_has_existing_bond: true,
  property_tenure: 'sectional_title',
})

assert.equal(getAttorneyDataRequirementsForLane('transfer', facts).some((item) => item.id === 'matter_number'), true)
assert.equal(getAttorneyDataRequirementsForLane('bond', facts).some((item) => item.id === 'bond_bank'), true)
assert.equal(getAttorneyDataRequirementsForLane('cancellation', facts).some((item) => item.id === 'cancellation_bank'), true)
assert.equal(getAttorneyReadinessGatesForLane('transfer').some((gate) => gate.key === 'lodgement_ready'), true)
assert.equal(getAttorneyReadinessGatesForLane('bond').some((gate) => gate.key === 'registration_ready'), true)
assert.equal(getAttorneyReadinessGatesForLane('cancellation').some((gate) => gate.key === 'lodgement_ready'), true)

const cancellationData = resolveAttorneyDataRequirementsForLane({
  laneKey: 'cancellation',
  transaction: {
    id: 'phase-1',
    seller_has_existing_bond: true,
  },
  facts,
})
assert.equal(cancellationData.summary.missing >= 2, true)
assert.equal(cancellationData.requirements.some((item) => item.id === 'cancellation_bank' && item.missing), true)
assert.equal(cancellationData.requirements.some((item) => item.id === 'cancellation_bond_account_number' && item.missing), true)

const readiness = calculateAttorneyReadinessForOperations({
  transaction: { id: 'phase-1' },
  workflow: { transactionId: 'phase-1', requiredAttorneyRoles: ['cancellation_attorney'], warnings: [] },
  lanes: [
    {
      laneKey: 'cancellation',
      attorneyRole: 'cancellation_attorney',
      label: 'Cancellation Attorney',
      assignment: { id: 'cancellation-assignment' },
      laneStatus: 'in_progress',
      currentStage: 'cancellation_bank_captured',
      updatedAt: new Date().toISOString(),
      summary: { completionPercent: 10, allComplete: false },
      steps: [],
      dataRequirements: cancellationData.requirements,
      documentRequirements: [],
      signingRequirements: [],
    },
  ],
})

assert.equal(readiness.blockers.some((item) => item.category === 'missing_data' && item.id === 'cancellation_bank_missing'), true)
assert.equal(readiness.lanes.cancellation_attorney.scoreBreakdown.data < 10, true)

console.log('Attorney workflow Phase 1 canonical model verification passed.')
