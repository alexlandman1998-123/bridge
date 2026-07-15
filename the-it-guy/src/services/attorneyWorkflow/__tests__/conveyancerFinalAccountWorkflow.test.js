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
  CONVEYANCER_FINANCIAL_RECONCILIATION_COMMANDS as RC,
  CONVEYANCER_FINANCIAL_RECONCILIATION_CONTROLS,
  buildConveyancerFinancialReconciliationCommand,
  executeConveyancerFinancialReconciliation,
  startConveyancerFinancialReconciliation,
} from '../conveyancerFinancialReconciliation.js'
import {
  CONVEYANCER_FINAL_ACCOUNT_COMMANDS as COMMAND,
  CONVEYANCER_FINAL_ACCOUNT_CONTROLS,
  CONVEYANCER_FINAL_ACCOUNT_STATUSES as STATUS,
  buildConveyancerFinalAccountCommand,
  buildConveyancerFinalAccountProjection,
  executeConveyancerFinalAccount,
  startConveyancerFinalAccount,
  validateConveyancerFinalAccount,
} from '../conveyancerFinalAccountWorkflow.js'

function test(name, fn) { try { fn(); console.log(`ok - ${name}`) } catch (error) { console.error(`not ok - ${name}`); throw error } }

const HASH = 'f'.repeat(64)
const accounts = { role: R.accounts, userId: 'accounts-d7' }
const attorney = { role: R.transferAttorney, userId: 'attorney-d7' }
const reviewer = { role: R.transferAttorney, userId: 'reviewer-d7' }
const source = (type, referenceId) => ({ type, referenceId, evidenceHash: HASH, effectiveAt: '2026-07-15T08:00:00.000Z' })
const controls = (items) => Object.fromEntries(items.map((item) => [item.key, true]))

function financialLine(lineId, lineClass, lineType, amount, overrides = {}) {
  return { lineId, lineClass, lineType, label: lineId, liableParty: lineClass === LC.sellerDeduction ? 'seller' : 'buyer', recipientParty: lineClass === LC.funding ? 'trust_account' : 'attorney', amount, status: LS.confirmed, source: source(lineClass === LC.funding ? 'bank_confirmation' : 'invoice', `source:${lineId}`), ...overrides }
}

function model() {
  const result = buildConveyancerFinancialModel({
    modelVersion: CONVEYANCER_FINANCIAL_MODEL_VERSION, financialModelId: 'financial-model:d7', revision: 1,
    planId: 'plan:d7', planVersion: 1, transactionId: 'transaction:d7', organisationId: 'organisation:d7', lane: 'transfer', currency: 'ZAR',
    consideration: { purchasePrice: '1000.00', taxTreatment: 'transfer_duty', source: source('signed_agreement', 'otp:d7') },
    lines: [
      financialLine('deposit', LC.funding, LT.deposit, '200.00', { status: LS.received, source: source('receipt', 'deposit:d7') }),
      financialLine('guarantee', LC.funding, LT.guarantee, '800.00', { source: source('guarantee', 'guarantee:d7') }),
      financialLine('transfer_cost', LC.buyerCharge, LT.professionalFee, '100.00'),
      financialLine('bond_settlement', LC.sellerDeduction, LT.bondSettlement, '300.00', { recipientParty: 'bank', source: source('bank_confirmation', 'settlement:d7') }),
    ],
    preparedAt: '2026-07-15T09:00:00.000Z', preparedBy: accounts,
    approval: { decisionReferenceId: 'approval:d7:model', summary: 'D5 approved.', approvedAt: '2026-07-15T10:00:00.000Z', approvedBy: attorney },
  }, { asOf: '2026-07-15T10:30:00.000Z' })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  return result.model
}

function reconciliation(financialModel = model()) {
  const statement = { statementId: 'statement:d7', accountReferenceHash: 'a'.repeat(64), periodStart: '2026-07-01T00:00:00.000Z', periodEnd: '2026-07-15T10:30:00.000Z', openingBalance: '800.00', closingBalance: '0.00', evidenceHash: 'b'.repeat(64), capturedAt: '2026-07-15T11:00:00.000Z', capturedBy: accounts }
  const entry = (entryId, entryKind, direction, amount, character, sourceType = 'trust_statement') => ({ entryId, entryKind, direction, amount, occurredAt: '2026-07-15T10:15:00.000Z', sourceType, sourceReferenceHash: character.repeat(64), evidenceHash: 'e'.repeat(64) })
  const entries = [entry('entry:deposit', 'cash', 'inflow', '200.00', '1'), entry('entry:guarantee', 'instrument', 'inflow', '800.00', '2', 'guarantee'), entry('entry:cost-in', 'cash', 'inflow', '100.00', '3'), entry('entry:cost-out', 'cash', 'outflow', '100.00', '4'), entry('entry:settlement', 'cash', 'outflow', '300.00', '5'), entry('entry:seller', 'cash', 'outflow', '700.00', '6')]
  const pairs = [['deposit', 'entry:deposit', 'line:deposit', '200.00'], ['guarantee', 'entry:guarantee', 'line:guarantee', '800.00'], ['cost-in', 'entry:cost-in', 'line:transfer_cost:collection', '100.00'], ['cost-out', 'entry:cost-out', 'line:transfer_cost:disbursement', '100.00'], ['settlement', 'entry:settlement', 'line:bond_settlement', '300.00'], ['seller', 'entry:seller', 'position:seller_base_proceeds', '700.00']]
  const allocations = pairs.map(([id, entryId, targetId, amount]) => ({ allocationId: `allocation:${id}`, entryId, targetId, amount, evidenceReferenceId: `evidence:${id}` }))
  const started = startConveyancerFinancialReconciliation({ financialModel, statement, entries, allocations, actor: accounts, occurredAt: '2026-07-15T12:00:00.000Z', commandId: 'start-reconciliation:d7' })
  assert.equal(started.ok, true, JSON.stringify(started.errors))
  const recommendation = buildConveyancerFinancialReconciliationCommand(started.reconciliation, RC.recommend, { controls: controls(CONVEYANCER_FINANCIAL_RECONCILIATION_CONTROLS), summary: 'Reconciled.' })
  const recommended = executeConveyancerFinancialReconciliation({ reconciliation: started.reconciliation, command: recommendation, actor: accounts, occurredAt: '2026-07-15T12:15:00.000Z' })
  const approval = buildConveyancerFinancialReconciliationCommand(recommended.reconciliation, RC.approve, { decisionReferenceId: 'approval:d7:reconciliation', summary: 'D6 approved.' })
  const approved = executeConveyancerFinancialReconciliation({ reconciliation: recommended.reconciliation, command: approval, actor: attorney, occurredAt: '2026-07-15T12:30:00.000Z' })
  assert.equal(approved.ok, true, JSON.stringify(approved.errors))
  return approved.reconciliation
}

function template(overrides = {}) { return { templateKey: 'final_account', templateVersionId: 'final-account-template:v1', templateFingerprint: 'fnv1a_12345678', contentHash: 'c'.repeat(64), outputFormat: 'pdf', locale: 'en-ZA', ...overrides } }
function parties(overrides = {}) { return { buyerPartyReferenceHash: 'd'.repeat(64), sellerPartyReferenceHash: 'e'.repeat(64), ...overrides } }
function start(overrides = {}) {
  const financialModel = overrides.model || model()
  return startConveyancerFinalAccount({ financialModel, reconciliation: overrides.reconciliation || reconciliation(financialModel), parties: overrides.parties || parties(), template: overrides.template || template(), actor: overrides.actor || accounts, occurredAt: '2026-07-15T13:00:00.000Z', commandId: overrides.commandId || 'start:d7', existingFinalAccounts: overrides.existingFinalAccounts || [] })
}
function execute(value, type, performedBy, payload = {}, at = '2026-07-15T13:30:00.000Z', events = []) { return executeConveyancerFinalAccount({ finalAccount: value, command: buildConveyancerFinalAccountCommand(value, type, payload), actor: performedBy, occurredAt: at, existingEvents: events }) }

test('derives balanced buyer and seller accounts from D5 and D6', () => {
  const financialModel = model(); const reconciled = reconciliation(financialModel)
  const projection = buildConveyancerFinalAccountProjection({ financialModel, reconciliation: reconciled, parties: parties() })
  assert.equal(projection.summary.allAccountsBalanced, true)
  assert.equal(projection.summary.buyerBalanceMinor, 0)
  assert.equal(projection.summary.sellerBalanceMinor, 0)
  assert.equal(projection.accounts.find((item) => item.accountRole === 'buyer').totalDebitMinor, 110000)
  assert.equal(projection.accounts.find((item) => item.accountRole === 'seller').totalCreditMinor, 100000)
})

test('prepares a content-addressed final-account packet', () => {
  const result = start()
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.code, 'final_account_prepared')
  assert.equal(result.finalAccount.status, STATUS.pendingReview)
  assert.match(result.finalAccount.contentHash, /^[a-f0-9]{64}$/)
  assert.equal(Object.isFrozen(result.finalAccount), true)
})

test('requires an approved D5 model and reconciled D6 record', () => {
  const financialModel = model(); const pending = structuredClone(reconciliation(financialModel)); pending.status = 'reconciliation_recommended'; pending.fingerprint = undefined
  const result = startConveyancerFinalAccount({ financialModel, reconciliation: pending, parties: parties(), template: template(), actor: accounts, occurredAt: '2026-07-15T13:00:00.000Z', commandId: 'pending:d7' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'd6_financial_reconciliation_invalid')
})

test('requires exact D5 to D6 binding', () => {
  const first = model(); const reconciled = reconciliation(first)
  const second = structuredClone(first); second.financialModelId = 'other-model:d7'; second.fingerprint = undefined
  const rebuilt = buildConveyancerFinancialModel(second, { asOf: second.asOf })
  assert.equal(rebuilt.ok, true)
  const result = startConveyancerFinalAccount({ financialModel: rebuilt.model, reconciliation: reconciled, parties: parties(), template: template(), actor: accounts, occurredAt: '2026-07-15T13:00:00.000Z', commandId: 'mismatch:d7' })
  assert.equal(result.code, 'd5_d6_financial_binding_mismatch')
})

test('requires a governed PDF final-account template', () => {
  assert.equal(start({ template: template({ contentHash: 'bad' }) }).code, 'governed_final_account_template_required')
  assert.equal(start({ template: template({ templateKey: 'invoice' }) }).code, 'governed_final_account_template_required')
})

test('requires hashed buyer and seller references', () => {
  assert.equal(start({ parties: parties({ buyerPartyReferenceHash: 'bad' }) }).code, 'final_account_party_references_invalid')
})

test('restricts preparation to accounts or the correct legal lane', () => {
  assert.equal(start({ actor: { role: R.bondAttorney, userId: 'wrong-lane-d7' } }).code, 'final_account_preparation_not_authorised')
  assert.equal(start({ actor: { role: R.secretary, userId: 'secretary-d7' } }).code, 'final_account_preparation_not_authorised')
})

test('requires every review control and recommendation summary', () => {
  const value = start().finalAccount
  const checked = controls(CONVEYANCER_FINAL_ACCOUNT_CONTROLS); checked.zero_balance = false
  assert.equal(execute(value, COMMAND.recommend, accounts, { controls: checked, summary: 'Checked.' }).code, 'final_account_controls_incomplete')
  assert.equal(execute(value, COMMAND.recommend, accounts, { controls: controls(CONVEYANCER_FINAL_ACCOUNT_CONTROLS) }).code, 'final_account_recommendation_summary_required')
})

test('supports accounts recommendation and independent legal approval', () => {
  const recommended = execute(start().finalAccount, COMMAND.recommend, accounts, { controls: controls(CONVEYANCER_FINAL_ACCOUNT_CONTROLS), summary: 'Both accounts balance.' })
  assert.equal(recommended.finalAccount.status, STATUS.approvalRecommended)
  const approved = execute(recommended.finalAccount, COMMAND.approve, attorney, { decisionReferenceId: 'approval:d7', summary: 'Final accounts approved.' }, '2026-07-15T14:00:00.000Z')
  assert.equal(approved.ok, true, JSON.stringify(approved.errors))
  assert.equal(approved.finalAccount.status, STATUS.approved)
})

test('accounts cannot approve and legal self-approval is blocked', () => {
  const recommended = execute(start().finalAccount, COMMAND.recommend, accounts, { controls: controls(CONVEYANCER_FINAL_ACCOUNT_CONTROLS), summary: 'Prepared.' })
  assert.equal(execute(recommended.finalAccount, COMMAND.approve, accounts, { decisionReferenceId: 'x', summary: 'x' }).code, 'final_account_approval_not_authorised')
  const legal = start({ actor: attorney, commandId: 'legal-start:d7' }).finalAccount
  const legalRecommended = execute(legal, COMMAND.recommend, attorney, { controls: controls(CONVEYANCER_FINAL_ACCOUNT_CONTROLS), summary: 'Prepared by legal.' })
  assert.equal(execute(legalRecommended.finalAccount, COMMAND.approve, attorney, { decisionReferenceId: 'x', summary: 'x' }).code, 'independent_final_account_approval_required')
  assert.equal(execute(legalRecommended.finalAccount, COMMAND.approve, reviewer, { decisionReferenceId: 'y', summary: 'Independent approval.' }).ok, true)
})

test('supports correction requests and reasoned rejection', () => {
  const correction = execute(start().finalAccount, COMMAND.requestCorrection, attorney, { reasonCode: 'description_error', decisionReferenceId: 'correction:d7', summary: 'Correct the line description.' })
  assert.equal(correction.finalAccount.status, STATUS.changesRequested)
  const rejected = execute(start({ commandId: 'reject-start:d7' }).finalAccount, COMMAND.reject, attorney, { reasonCode: 'wrong_parties', decisionReferenceId: 'reject:d7', summary: 'Wrong party account.' })
  assert.equal(rejected.finalAccount.status, STATUS.rejected)
})

test('enforces optimistic concurrency and secure idempotency', () => {
  const value = start().finalAccount
  const command = buildConveyancerFinalAccountCommand(value, COMMAND.recommend, { controls: controls(CONVEYANCER_FINAL_ACCOUNT_CONTROLS), summary: 'Prepared.' })
  const applied = executeConveyancerFinalAccount({ finalAccount: value, command, actor: accounts, occurredAt: '2026-07-15T13:30:00.000Z' })
  const replay = executeConveyancerFinalAccount({ finalAccount: value, command, actor: accounts, occurredAt: '2026-07-15T13:30:00.000Z', existingEvents: [applied.event] })
  assert.equal(replay.duplicate, true)
  assert.equal(executeConveyancerFinalAccount({ finalAccount: applied.finalAccount, command, actor: accounts, occurredAt: '2026-07-15T13:40:00.000Z' }).code, 'stale_final_account_revision')
})

test('supports exact start replay and rejects changed template or parties', () => {
  const first = start()
  assert.equal(start({ existingFinalAccounts: [{ finalAccount: first.finalAccount, event: first.event }] }).duplicate, true)
  assert.equal(start({ parties: parties({ sellerPartyReferenceHash: '9'.repeat(64) }), existingFinalAccounts: [first.finalAccount] }).code, 'final_account_start_command_id_conflict')
})

test('detects content, derivation, template and runtime tampering', () => {
  const value = start().finalAccount
  const lineTamper = structuredClone(value); lineTamper.accounts[0].lines[0].debitMinor += 1
  assert.ok(validateConveyancerFinalAccount(lineTamper).errors.includes('final_account_content_hash_invalid'))
  const totalTamper = structuredClone(value); totalTamper.accounts[0].totalDebitMinor += 1
  assert.ok(validateConveyancerFinalAccount(totalTamper).errors.includes('final_account_derivation_invalid'))
  const templateTamper = structuredClone(value); templateTamper.template.templateVersionId = 'forged'
  assert.ok(validateConveyancerFinalAccount(templateTamper).errors.includes('final_account_content_hash_invalid'))
  const runtimeTamper = structuredClone(value); runtimeTamper.status = STATUS.approved
  assert.ok(validateConveyancerFinalAccount(runtimeTamper).errors.includes('final_account_fingerprint_invalid'))
})

test('keeps audit metadata redacted and delivery side effects outside D7', () => {
  const result = start(); const serialized = JSON.stringify(result.event)
  assert.equal(serialized.includes('partyReferenceHash'), false)
  assert.equal(serialized.includes('totalDebitMinor'), false)
  assert.equal(result.event.deliveryPerformed, false)
  const tampered = structuredClone(result.finalAccount); tampered.deliveryPerformed = true
  assert.ok(validateConveyancerFinalAccount(tampered).errors.includes('final_account_side_effect_boundary_violated'))
})

console.log('D7 final-account workflow tests passed.')
