import assert from 'node:assert/strict'
import { MATTER_PLAN_OWNER_ROLES as R } from '../../../core/transactions/conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_FINANCIAL_LINE_CLASSES as LC,
  CONVEYANCER_FINANCIAL_LINE_STATUSES as LS,
  CONVEYANCER_FINANCIAL_LINE_TYPES as LT,
  CONVEYANCER_FINANCIAL_MODEL_VERSION,
  buildConveyancerFinancialModel,
} from '../../../core/transactions/conveyancerFinancialModel.js'
import {
  CONVEYANCER_FINANCIAL_RECONCILIATION_COMMANDS as COMMAND,
  CONVEYANCER_FINANCIAL_RECONCILIATION_CONTROLS,
  CONVEYANCER_FINANCIAL_RECONCILIATION_STATUSES as STATUS,
  buildConveyancerFinancialReconciliationCommand,
  executeConveyancerFinancialReconciliation,
  startConveyancerFinancialReconciliation,
  validateConveyancerFinancialReconciliation,
} from '../conveyancerFinancialReconciliation.js'

function test(name, fn) {
  try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error }
}

const HASH = 'f'.repeat(64)
const accounts = { role: R.accounts, userId: 'accounts-d6' }
const attorney = { role: R.transferAttorney, userId: 'attorney-d6' }
const otherAttorney = { role: R.transferAttorney, userId: 'attorney-reviewer-d6' }
const source = (type, referenceId) => ({ type, referenceId, evidenceHash: HASH, effectiveAt: '2026-07-15T08:00:00.000Z' })

function financialLine(lineId, lineClass, lineType, amount, overrides = {}) {
  return { lineId, lineClass, lineType, label: lineId, liableParty: lineClass === LC.sellerDeduction ? 'seller' : 'buyer', recipientParty: lineClass === LC.funding ? 'trust_account' : 'attorney', amount, status: LS.confirmed, source: source(lineClass === LC.funding ? 'bank_confirmation' : 'invoice', `source:${lineId}`), ...overrides }
}

function financialModel(overrides = {}) {
  const input = {
    modelVersion: CONVEYANCER_FINANCIAL_MODEL_VERSION,
    financialModelId: 'financial-model:d6', revision: 1, planId: 'plan:d6', planVersion: 1,
    transactionId: 'transaction:d6', organisationId: 'organisation:d6', lane: 'transfer', currency: 'ZAR',
    consideration: { purchasePrice: '1000.00', taxTreatment: 'transfer_duty', source: source('signed_agreement', 'otp:d6') },
    lines: [
      financialLine('deposit', LC.funding, LT.deposit, '200.00', { status: LS.received, source: source('receipt', 'deposit:d6') }),
      financialLine('guarantee', LC.funding, LT.guarantee, '800.00', { source: source('guarantee', 'guarantee:d6') }),
      financialLine('transfer_cost', LC.buyerCharge, LT.professionalFee, '100.00'),
      financialLine('bond_settlement', LC.sellerDeduction, LT.bondSettlement, '300.00', { recipientParty: 'bank', source: source('bank_confirmation', 'settlement:d6') }),
    ],
    preparedAt: '2026-07-15T09:00:00.000Z', preparedBy: accounts,
    approval: { decisionReferenceId: 'approval:d6', summary: 'D5 position approved.', approvedAt: '2026-07-15T10:00:00.000Z', approvedBy: attorney },
    ...overrides,
  }
  const result = buildConveyancerFinancialModel(input, { asOf: '2026-07-15T10:30:00.000Z' })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.model
}

function statement(overrides = {}) {
  return { statementId: 'statement:d6', accountReferenceHash: 'a'.repeat(64), periodStart: '2026-07-01T00:00:00.000Z', periodEnd: '2026-07-15T10:30:00.000Z', openingBalance: '800.00', closingBalance: '0.00', evidenceHash: 'b'.repeat(64), capturedAt: '2026-07-15T11:00:00.000Z', capturedBy: accounts, ...overrides }
}

function entry(entryId, entryKind, direction, amount, referenceCharacter, sourceType = 'trust_statement') {
  return { entryId, entryKind, direction, amount, occurredAt: '2026-07-15T10:15:00.000Z', sourceType, sourceReferenceHash: referenceCharacter.repeat(64), evidenceHash: 'e'.repeat(64) }
}

function evidence() {
  const entries = [
    entry('entry:deposit', 'cash', 'inflow', '200.00', '1'),
    entry('entry:guarantee', 'instrument', 'inflow', '800.00', '2', 'guarantee'),
    entry('entry:cost_collection', 'cash', 'inflow', '100.00', '3'),
    entry('entry:cost_payment', 'cash', 'outflow', '100.00', '4'),
    entry('entry:settlement', 'cash', 'outflow', '300.00', '5'),
    entry('entry:seller', 'cash', 'outflow', '700.00', '6'),
  ]
  const pairs = [
    ['deposit', 'entry:deposit', 'line:deposit', '200.00'],
    ['guarantee', 'entry:guarantee', 'line:guarantee', '800.00'],
    ['cost_collection', 'entry:cost_collection', 'line:transfer_cost:collection', '100.00'],
    ['cost_payment', 'entry:cost_payment', 'line:transfer_cost:disbursement', '100.00'],
    ['settlement', 'entry:settlement', 'line:bond_settlement', '300.00'],
    ['seller', 'entry:seller', 'position:seller_base_proceeds', '700.00'],
  ]
  const allocations = pairs.map(([id, entryId, targetId, amount]) => ({ allocationId: `allocation:${id}`, entryId, targetId, amount, evidenceReferenceId: `evidence:${id}` }))
  return { entries, allocations }
}

function start(overrides = {}) {
  const proof = overrides.proof || evidence()
  return startConveyancerFinancialReconciliation({ financialModel: overrides.model || financialModel(), statement: overrides.statement || statement(), entries: overrides.entries || proof.entries, allocations: overrides.allocations || proof.allocations, actor: overrides.actor || accounts, occurredAt: '2026-07-15T12:00:00.000Z', commandId: overrides.commandId || 'start:d6', existingReconciliations: overrides.existingReconciliations || [] })
}

function controls() { return Object.fromEntries(CONVEYANCER_FINANCIAL_RECONCILIATION_CONTROLS.map((item) => [item.key, true])) }
function execute(value, type, performedBy, payload = {}, at = '2026-07-15T12:30:00.000Z', events = []) { return executeConveyancerFinancialReconciliation({ reconciliation: value, command: buildConveyancerFinancialReconciliationCommand(value, type, payload), actor: performedBy, occurredAt: at, existingEvents: events }) }

test('starts a fully matched reconciliation from an approved D5 model', () => {
  const result = start()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.code, 'financial_reconciliation_started')
  assert.equal(result.reconciliation.findings.length, 0)
  assert.equal(result.reconciliation.checks.every((item) => item.status === 'passed'), true)
  assert.equal(Object.isFrozen(result.reconciliation), true)
})

test('requires an approved ready D5 model', () => {
  const model = structuredClone(financialModel())
  model.approval = null
  model.fingerprint = undefined
  const result = startConveyancerFinancialReconciliation({ financialModel: model, statement: statement(), ...evidence(), actor: accounts, occurredAt: '2026-07-15T12:00:00.000Z', commandId: 'invalid-model:d6' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'd5_financial_model_invalid')
})

test('opens a critical finding when statement arithmetic does not balance', () => {
  const result = start({ statement: statement({ closingBalance: '1.00' }) })
  assert.equal(result.code, 'financial_reconciliation_started_with_findings')
  assert.ok(result.reconciliation.findings.some((item) => item.checkKey === 'statement_integrity' && item.severity === 'critical'))
})

test('detects incomplete funding evidence', () => {
  const proof = evidence()
  proof.allocations.find((item) => item.allocationId === 'allocation:guarantee').amount = '700.00'
  const result = start({ proof })
  assert.ok(result.reconciliation.findings.some((item) => item.checkKey === 'funding_coverage'))
})

test('detects incomplete buyer-cost collection or disbursement', () => {
  const proof = evidence()
  proof.allocations.find((item) => item.allocationId === 'allocation:cost_payment').amount = '99.00'
  const result = start({ proof })
  assert.ok(result.reconciliation.findings.some((item) => item.checkKey === 'cost_coverage'))
})

test('detects an unreconciled seller position', () => {
  const proof = evidence()
  proof.allocations.find((item) => item.allocationId === 'allocation:seller').amount = '699.00'
  const result = start({ proof })
  assert.ok(result.reconciliation.findings.some((item) => item.checkKey === 'seller_position'))
})

test('detects unallocated actual value and unknown targets', () => {
  const proof = evidence()
  proof.allocations.find((item) => item.allocationId === 'allocation:deposit').targetId = 'line:unknown'
  const result = start({ proof })
  assert.ok(result.reconciliation.findings.some((item) => item.checkKey === 'entry_allocation'))
})

test('detects wrong movement direction or evidence mode', () => {
  const proof = evidence()
  proof.entries.find((item) => item.entryId === 'entry:guarantee').direction = 'outflow'
  const result = start({ proof })
  assert.ok(result.reconciliation.findings.some((item) => item.checkKey === 'direction_and_mode'))
})

test('rejects malformed statement and entry provenance', () => {
  const invalidStatement = start({ statement: statement({ evidenceHash: 'not-a-hash' }) })
  assert.equal(invalidStatement.code, 'financial_reconciliation_evidence_invalid')
  const proof = evidence()
  proof.entries[0].sourceReferenceHash = 'bad'
  assert.equal(start({ proof }).code, 'financial_reconciliation_evidence_invalid')
})

test('rejects duplicate entry and allocation identities', () => {
  const proof = evidence()
  proof.entries.push(structuredClone(proof.entries[0]))
  assert.equal(start({ proof }).code, 'financial_reconciliation_evidence_invalid')
})

test('will not recommend reconciliation while findings remain', () => {
  const result = start({ statement: statement({ closingBalance: '1.00' }) })
  const recommended = execute(result.reconciliation, COMMAND.recommend, accounts, { controls: controls(), summary: 'Looks balanced.' })
  assert.equal(recommended.code, 'financial_reconciliation_findings_require_new_evidence')
})

test('requires every preparation control and a summary', () => {
  const value = start().reconciliation
  const incomplete = controls(); incomplete.statement_integrity = false
  assert.equal(execute(value, COMMAND.recommend, accounts, { controls: incomplete, summary: 'Checked.' }).code, 'financial_reconciliation_controls_incomplete')
  assert.equal(execute(value, COMMAND.recommend, accounts, { controls: controls() }).code, 'financial_reconciliation_summary_required')
})

test('supports accounts recommendation and independent legal approval', () => {
  const value = start().reconciliation
  const recommended = execute(value, COMMAND.recommend, accounts, { controls: controls(), summary: 'All actuals match D5.' })
  assert.equal(recommended.reconciliation.status, STATUS.reconciliationRecommended)
  const approved = execute(recommended.reconciliation, COMMAND.approve, attorney, { decisionReferenceId: 'approval:d6:final', summary: 'Reconciliation independently approved.' }, '2026-07-15T13:00:00.000Z')
  assert.equal(approved.ok, true, JSON.stringify(approved.errors))
  assert.equal(approved.reconciliation.status, STATUS.reconciled)
})

test('accounts cannot approve and the preparer cannot self-approve', () => {
  const recommended = execute(start().reconciliation, COMMAND.recommend, accounts, { controls: controls(), summary: 'Prepared.' })
  assert.equal(execute(recommended.reconciliation, COMMAND.approve, accounts, { decisionReferenceId: 'x', summary: 'x' }).code, 'financial_reconciliation_approval_not_authorised')
  const legalStart = start({ actor: attorney, commandId: 'legal-start:d6' }).reconciliation
  const legalRecommendation = execute(legalStart, COMMAND.recommend, attorney, { controls: controls(), summary: 'Prepared by legal.' })
  assert.equal(execute(legalRecommendation.reconciliation, COMMAND.approve, attorney, { decisionReferenceId: 'x', summary: 'x' }).code, 'independent_financial_reconciliation_approval_required')
  assert.equal(execute(legalRecommendation.reconciliation, COMMAND.approve, otherAttorney, { decisionReferenceId: 'y', summary: 'Independent.' }).ok, true)
})

test('supports correction requests and reasoned rejection', () => {
  const value = start().reconciliation
  const correction = execute(value, COMMAND.requestCorrection, attorney, { reasonCode: 'missing_receipt', decisionReferenceId: 'correction:d6', summary: 'Provide the receipt.' })
  assert.equal(correction.reconciliation.status, STATUS.changesRequested)
  const rejected = execute(start({ commandId: 'reject-start:d6' }).reconciliation, COMMAND.reject, attorney, { reasonCode: 'wrong_matter', decisionReferenceId: 'reject:d6', summary: 'Evidence belongs to another matter.' })
  assert.equal(rejected.reconciliation.status, STATUS.rejected)
})

test('enforces optimistic concurrency and idempotent replay', () => {
  const value = start().reconciliation
  const command = buildConveyancerFinancialReconciliationCommand(value, COMMAND.recommend, { controls: controls(), summary: 'Prepared.' })
  const applied = executeConveyancerFinancialReconciliation({ reconciliation: value, command, actor: accounts, occurredAt: '2026-07-15T12:30:00.000Z' })
  const replay = executeConveyancerFinancialReconciliation({ reconciliation: value, command, actor: accounts, occurredAt: '2026-07-15T12:30:00.000Z', existingEvents: [applied.event] })
  assert.equal(replay.duplicate, true)
  const stale = executeConveyancerFinancialReconciliation({ reconciliation: applied.reconciliation, command, actor: accounts, occurredAt: '2026-07-15T12:40:00.000Z' })
  assert.equal(stale.code, 'stale_financial_reconciliation_revision')
})

test('supports exact start replay and rejects changed evidence', () => {
  const first = start()
  const replay = start({ existingReconciliations: [{ reconciliation: first.reconciliation, event: first.event }] })
  assert.equal(replay.duplicate, true)
  const proof = evidence(); proof.allocations[0].amount = '199.00'
  assert.equal(start({ proof, existingReconciliations: [first.reconciliation] }).code, 'financial_reconciliation_start_command_id_conflict')
})

test('detects source and runtime tampering', () => {
  const value = start().reconciliation
  const sourceTamper = structuredClone(value); sourceTamper.entries[0].amountMinor += 1
  assert.ok(validateConveyancerFinancialReconciliation(sourceTamper).errors.includes('financial_reconciliation_binding_fingerprint_invalid'))
  const runtimeTamper = structuredClone(value); runtimeTamper.status = STATUS.reconciled
  assert.ok(validateConveyancerFinancialReconciliation(runtimeTamper).errors.includes('financial_reconciliation_fingerprint_invalid'))
})

test('keeps audit evidence redacted and all financial side effects outside D6', () => {
  const result = start()
  const serialized = JSON.stringify(result.event)
  assert.equal(serialized.includes('accountReferenceHash'), false)
  assert.equal(serialized.includes('sourceReferenceHash'), false)
  assert.equal(result.event.paymentPerformed, false)
  const tampered = structuredClone(result.reconciliation); tampered.trustPostingPerformed = true
  assert.ok(validateConveyancerFinancialReconciliation(tampered).errors.includes('financial_reconciliation_side_effect_boundary_violated'))
})

console.log('D6 financial-reconciliation tests passed.')
