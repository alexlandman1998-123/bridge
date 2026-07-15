import assert from 'node:assert/strict'
import {
  BOND_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID,
  BOND_BANK_CONDITION_BLOCKER_STATES,
  BOND_BANK_CONDITION_CONTROL_BOUNDARY,
  BOND_BANK_CONDITION_DUE_STATES,
  BOND_BANK_CONDITION_OWNER_ROLES,
  BOND_BANK_CONDITION_STATUSES,
  buildBondAttorneyPhase5BaselineReport,
  buildBondConditionNextActions,
  buildBondConditionRegister,
  buildBondConditionScheduleModel,
  validateBondConditionRegister,
} from '../bondAttorneyModulePhase5.js'
import { buildBondPackWorkspace } from '../bondAttorneyModulePhase3.js'

const verified = (value, overrides = {}) => ({
  value,
  sourceId: overrides.sourceId || 'source-bank-pack-1',
  capturedAt: overrides.capturedAt || '2026-07-10T09:00:00.000Z',
  verifiedAt: overrides.verifiedAt || '2026-07-10T10:00:00.000Z',
  verifiedBy: overrides.verifiedBy || { role: 'bond_attorney', userId: 'bond-attorney-1' },
  expiresAt: overrides.expiresAt || null,
})

const openStructuredConditions = [
  {
    key: 'insurance',
    type: 'insurance',
    label: 'Homeowners insurance confirmation',
    ownerRole: 'buyer',
    dueDate: '2026-07-18',
    status: 'satisfied',
    bankBlocking: true,
    evidenceRequirements: [{ key: 'insurance_confirmation', type: 'document', requiresApproval: true }],
    evidence: [{ requirementKey: 'insurance_confirmation', status: 'approved', referenceId: 'doc-insurance-1', capturedAt: '2026-07-11T09:00:00.000Z', reviewedAt: '2026-07-11T10:00:00.000Z' }],
  },
  {
    key: 'debit_order_mandate',
    type: 'debit_order',
    label: 'Debit-order mandate outstanding',
    ownerRole: 'bank',
    dueDate: '2026-07-16',
    status: 'open',
    bankBlocking: true,
  },
  {
    key: 'valuation',
    type: 'valuation',
    label: 'Valuation report follow-up',
    ownerRole: 'bond_attorney',
    dueDate: '2026-07-14',
    status: 'in_progress',
    bankBlocking: false,
    evidence: [{ requirementKey: 'valuation_report', status: 'provided', referenceId: 'doc-valuation-1', capturedAt: '2026-07-13T09:00:00.000Z' }],
  },
]

const readyStructuredConditions = openStructuredConditions.map((condition) => {
  if (condition.key === 'debit_order_mandate') {
    return {
      ...condition,
      status: 'satisfied',
      evidence: [{ requirementKey: 'debit_order_mandate', status: 'approved', referenceId: 'doc-debit-order-1', capturedAt: '2026-07-12T09:00:00.000Z', reviewedAt: '2026-07-12T10:00:00.000Z' }],
    }
  }
  if (condition.key === 'valuation') return { ...condition, status: 'satisfied' }
  return condition
})

const completeEvidence = (bankConditions = openStructuredConditions) => ({
  bank_name: verified('Nedbank'),
  bank_reference: verified('NB-2026-001'),
  approved_bond_amount: verified(1850000),
  mortgagor_identity_and_capacity: verified({ name: 'Alex Buyer', capacity: 'individual mortgagor' }),
  mortgagee_identity: verified({ name: 'Nedbank Limited', registrationNumber: '1951/000009/06' }),
  property_legal_description: verified('Erf 1234 Cape Town, City of Cape Town'),
  title_deed_or_deeds_office_reference: verified('T12345/2021'),
  buyer_marital_or_entity_authority: verified({ status: 'unmarried', authority: 'self' }),
  bank_conditions: verified(bankConditions),
  guarantee_values_and_expiry: verified([{ amount: 1850000, expiresAt: '2026-09-30' }]),
  signing_method_and_signed_pack_status: verified({ method: 'wet_ink', status: 'signed_originals_received' }),
  bank_submission_reference: verified('BANK-SUB-77'),
  approval_to_lodge_reference: verified('ATL-2026-22'),
  lodgement_reference: verified('LODGE-2026-101'),
  registration_date: verified('2026-08-02'),
})

function containsForbiddenAuditPayload(value) {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, nested]) => {
    if (['conditions', 'facts', 'value', 'renderModel', 'body', 'sections'].includes(String(key))) return true
    return containsForbiddenAuditPayload(nested)
  })
}

assert.equal(BOND_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID, 'bank_conditions_not_structured')
assert.equal(BOND_BANK_CONDITION_CONTROL_BOUNDARY.generatesBankApproval, false)
assert.equal(BOND_BANK_CONDITION_CONTROL_BOUNDARY.submitsToBankPortal, false)
assert.equal(BOND_BANK_CONDITION_CONTROL_BOUNDARY.generatesLegalInstrument, false)

const workspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase5' },
  evidence: completeEvidence(),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
assert.equal(workspace.canonicalData.factsByKey.bank_conditions.status, 'verified')

const register = buildBondConditionRegister({
  workspace,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase5-condition-register-1',
  generatedAt: '2026-07-15T09:00:00.000Z',
})
assert.equal(register.validation.valid, true, JSON.stringify(register.validation.errors, null, 2))
assert.equal(register.metrics.conditionCount, 3)
assert.equal(register.metrics.structuredConditionCount, 3)
assert.equal(register.metrics.resolvedCount, 1)
assert.equal(register.metrics.blockingOpenCount, 1)
assert.equal(register.metrics.overdueOpenCount, 1)
assert.equal(register.metrics.evidenceGapCount, 1)
assert.equal(register.readyForPhase6, false)

const debitOrder = register.conditions.find((condition) => condition.key === 'debit_order_mandate')
assert.equal(debitOrder.ownerRole, BOND_BANK_CONDITION_OWNER_ROLES.bank)
assert.equal(debitOrder.status, BOND_BANK_CONDITION_STATUSES.open)
assert.equal(debitOrder.dueState, BOND_BANK_CONDITION_DUE_STATES.dueSoon)
assert.equal(debitOrder.blockerState, BOND_BANK_CONDITION_BLOCKER_STATES.blocking)
assert.ok(debitOrder.blockers.some((blocker) => blocker.id === 'required_evidence_missing'))

const valuation = register.conditions.find((condition) => condition.key === 'valuation')
assert.equal(valuation.dueState, BOND_BANK_CONDITION_DUE_STATES.overdue)
assert.equal(valuation.blockerState, BOND_BANK_CONDITION_BLOCKER_STATES.attention)
assert.equal(valuation.evidenceContract.evidenceSatisfied, true)

const nextActions = buildBondConditionNextActions(register)
assert.equal(nextActions.length, 2)
assert.equal(nextActions[0].conditionKey, 'debit_order_mandate')
assert.equal(nextActions[0].actionLabel, 'Attach or approve required evidence')
assert.equal(nextActions[0].priority, 'high')

const scheduleModel = buildBondConditionScheduleModel(register)
assert.equal(scheduleModel.rows.length, 3)
assert.equal(scheduleModel.rows.find((row) => row.key === 'debit_order_mandate').nextAction, 'Attach or approve required evidence')
assert.equal(scheduleModel.rows.find((row) => row.key === 'insurance').nextAction, 'No action required')
assert.equal(register.auditEvent.eventType, 'bond_bank_conditions_structured')
assert.equal(register.auditEvent.releaseBlockerId, BOND_ATTORNEY_PHASE5_RELEASE_BLOCKER_ID)
assert.equal(register.auditEvent.conditionMetrics.conditionCount, 3)
assert.equal(containsForbiddenAuditPayload(register.auditEvent), false)

const readyWorkspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase5-ready' },
  evidence: completeEvidence(readyStructuredConditions),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const readyRegister = buildBondConditionRegister({
  workspace: readyWorkspace,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase5-condition-register-2',
  generatedAt: '2026-07-15T09:00:00.000Z',
})
assert.equal(readyRegister.validation.valid, true, JSON.stringify(readyRegister.validation.errors, null, 2))
assert.equal(readyRegister.metrics.blockingOpenCount, 0)
assert.equal(readyRegister.metrics.evidenceGapCount, 0)
assert.equal(readyRegister.readyForPhase6, true)

const malformedWorkspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase5-bad' },
  evidence: completeEvidence([{ key: 'insurance', status: 'satisfied' }]),
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const malformed = buildBondConditionRegister({
  workspace: malformedWorkspace,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase5-condition-register-3',
  generatedAt: '2026-07-15T09:00:00.000Z',
})
assert.equal(malformed.validation.valid, false)
assert.ok(malformed.validation.errors.includes('bank_condition_owner_required:insurance'))
assert.ok(malformed.validation.errors.includes('bank_condition_due_date_required:insurance'))
assert.ok(malformed.validation.errors.includes('satisfied_condition_evidence_incomplete:insurance'))
assert.equal(validateBondConditionRegister(malformed).valid, false)

const missingFactWorkspace = buildBondPackWorkspace({
  transaction: { id: 'tx-bond-phase5-missing' },
  evidence: { bank_name: verified('Nedbank') },
  generatedAt: '2026-07-15T08:00:00.000Z',
})
const missingFactRegister = buildBondConditionRegister({
  workspace: missingFactWorkspace,
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase5-condition-register-4',
  generatedAt: '2026-07-15T09:00:00.000Z',
})
assert.equal(missingFactRegister.validation.valid, false)
assert.ok(missingFactRegister.validation.errors.includes('bank_conditions_fact_not_verified'))
assert.equal(missingFactRegister.readyForPhase6, false)

const report = buildBondAttorneyPhase5BaselineReport({
  transaction: { id: 'tx-bond-phase5-report' },
  evidence: completeEvidence(readyStructuredConditions),
  actor: { role: 'bond_attorney', userId: 'bond-attorney-1' },
  commandId: 'phase5-report',
  generatedAt: '2026-07-15T09:00:00.000Z',
})
assert.equal(report.readyForPhase6, true, JSON.stringify(report, null, 2))
assert.equal(report.conditionCount, 3)
assert.equal(report.structuredConditionCount, 3)
assert.equal(report.blockingOpenCount, 0)
assert.equal(report.evidenceGapCount, 0)

console.log(`Bond attorney module Phase 5 bank-condition register passed (${report.conditionCount} structured conditions).`)
