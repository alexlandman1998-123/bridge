import assert from 'node:assert/strict'
import { MATTER_PLAN_OWNER_ROLES as R } from '../conveyancerMatterPlanContract.js'
import {
  CONVEYANCER_FINANCIAL_LINE_CLASSES as C,
  CONVEYANCER_FINANCIAL_LINE_STATUSES as S,
  CONVEYANCER_FINANCIAL_LINE_TYPES as T,
  CONVEYANCER_FINANCIAL_MODEL_STATUSES as MS,
  CONVEYANCER_FINANCIAL_MODEL_VERSION,
  buildConveyancerFinancialModel,
  compareConveyancerFinancialModelRevision,
  formatConveyancerMoneyFromMinor,
  parseConveyancerMoneyToMinor,
  validateConveyancerFinancialModel,
} from '../conveyancerFinancialModel.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const HASH = 'f'.repeat(64)
const AS_OF = '2026-07-15T12:00:00.000Z'
const accounts = { role: R.accounts, userId: 'accounts-d5' }
const attorney = { role: R.transferAttorney, userId: 'attorney-d5' }

function source(type, referenceId) {
  return { type, referenceId, evidenceHash: HASH, effectiveAt: '2026-07-15T09:00:00.000Z' }
}

function line(lineId, lineClass, lineType, amount, overrides = {}) {
  return {
    lineId,
    lineClass,
    lineType,
    label: lineId.replaceAll('_', ' '),
    liableParty: lineClass === C.sellerDeduction ? 'seller' : 'buyer',
    recipientParty: lineClass === C.funding ? 'trust_account' : 'attorney',
    amount,
    status: S.confirmed,
    source: source(lineClass === C.funding ? 'bank_confirmation' : 'invoice', `source:${lineId}`),
    ...overrides,
  }
}

function input(overrides = {}) {
  return {
    modelVersion: CONVEYANCER_FINANCIAL_MODEL_VERSION,
    financialModelId: 'financial-model:d5:1',
    revision: 1,
    planId: 'matter-plan:d5',
    planVersion: 3,
    transactionId: 'transaction-d5',
    organisationId: 'organisation-d5',
    lane: 'transfer',
    currency: 'ZAR',
    consideration: {
      purchasePrice: '3000000.00',
      taxTreatment: 'transfer_duty',
      source: source('signed_agreement', 'signed-otp:d5'),
    },
    lines: [
      line('deposit', C.funding, T.deposit, '300000.00', { source: source('receipt', 'deposit-receipt:d5'), status: S.received }),
      line('bond', C.funding, T.bondProceeds, '2500000.00', { source: source('guarantee', 'bank-guarantee:d5') }),
      line('cash', C.funding, T.cashContribution, '200000.00'),
      line('transfer_fee', C.buyerCharge, T.professionalFee, '45000.00', { netAmount: '39130.43', vatAmount: '5869.57' }),
      line('transfer_duty', C.buyerCharge, T.transferDuty, '88000.00', { recipientParty: 'sars', source: source('statutory_assessment', 'sars-assessment:d5') }),
      line('commission', C.sellerDeduction, T.commission, '150000.00', { recipientParty: 'estate_agent' }),
      line('bond_settlement', C.sellerDeduction, T.bondSettlement, '1200000.00', { recipientParty: 'bank', source: source('bank_confirmation', 'cancellation-figures:d5') }),
    ],
    preparedAt: '2026-07-15T10:00:00.000Z',
    preparedBy: accounts,
    ...overrides,
  }
}

function approved(overrides = {}) {
  return input({
    approval: {
      decisionReferenceId: 'financial-approval:d5',
      summary: 'Funding and party positions independently checked.',
      approvedAt: '2026-07-15T11:00:00.000Z',
      approvedBy: attorney,
    },
    ...overrides,
  })
}

test('uses exact minor-unit parsing and stable ZAR formatting', () => {
  assert.equal(parseConveyancerMoneyToMinor('0.10'), 10)
  assert.equal(parseConveyancerMoneyToMinor('2,500,000.55'), 250000055)
  assert.equal(parseConveyancerMoneyToMinor('1.001'), null)
  assert.equal(parseConveyancerMoneyToMinor('-1.00'), null)
  assert.equal(formatConveyancerMoneyFromMinor(250000055), 'ZAR 2500000.55')
})

test('builds an independently approved balanced financial model', () => {
  const result = buildConveyancerFinancialModel(approved(), { asOf: AS_OF })
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(result.code, MS.ready)
  assert.equal(result.model.summary.purchasePriceMinor, 300000000)
  assert.equal(result.model.summary.fundingSecuredMinor, 300000000)
  assert.equal(result.model.summary.buyerTotalExposureMinor, 313300000)
  assert.equal(result.model.summary.sellerNetProceedsMinor, 165000000)
  assert.equal(Object.isFrozen(result.model.lines), true)
})

test('blocks a purchase-price funding shortfall', () => {
  const draft = input({ lines: input().lines.filter((item) => item.lineId !== 'cash') })
  const result = buildConveyancerFinancialModel(draft, { asOf: AS_OF })
  assert.equal(result.ok, true)
  assert.equal(result.code, MS.blocked)
  assert.ok(result.model.assessment.blockers.includes('purchase_price_funding_shortfall'))
})

test('blocks purchase-price overfunding', () => {
  const draft = input()
  draft.lines[2].amount = '200000.01'
  const result = buildConveyancerFinancialModel(draft, { asOf: AS_OF })
  assert.equal(result.code, MS.blocked)
  assert.ok(result.model.assessment.blockers.includes('purchase_price_overfunded'))
})

test('distinguishes committed funding from secured funding', () => {
  const draft = input()
  draft.lines.find((item) => item.lineId === 'bond').status = S.quoted
  draft.lines.find((item) => item.lineId === 'bond').source = source('quote', 'bond-quote:d5')
  const result = buildConveyancerFinancialModel(draft, { asOf: AS_OF })
  assert.equal(result.code, MS.reviewRequired)
  assert.equal(result.model.summary.fundingCommitmentVarianceMinor, 0)
  assert.equal(result.model.summary.fundingSecurityVarianceMinor, -250000000)
})

test('blocks a deposit larger than the purchase price', () => {
  const draft = input({
    consideration: { purchasePrice: '3000000.00', taxTreatment: 'transfer_duty', source: source('signed_agreement', 'signed-otp:d5') },
    lines: [line('deposit', C.funding, T.deposit, '3100000.00', { status: S.received, source: source('receipt', 'deposit:d5') })],
  })
  const result = buildConveyancerFinancialModel(draft, { asOf: AS_OF })
  assert.ok(result.model.assessment.blockers.includes('deposit_exceeds_purchase_price'))
})

test('requires an exact net plus VAT split', () => {
  const draft = input()
  draft.lines.find((item) => item.lineId === 'transfer_fee').vatAmount = '5869.56'
  const result = buildConveyancerFinancialModel(draft, { asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('financial_line_tax_split_invalid:transfer_fee'))
})

test('requires provenance for confirmed, received, paid and reversed lines', () => {
  const draft = input()
  draft.lines[0].source.evidenceHash = null
  const result = buildConveyancerFinancialModel(draft, { asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('financial_line_evidence_invalid:deposit'))
})

test('keeps estimated or quoted lines in review', () => {
  const draft = input()
  draft.lines.find((item) => item.lineId === 'commission').status = S.estimated
  draft.lines.find((item) => item.lineId === 'commission').source = { type: 'calculation' }
  const result = buildConveyancerFinancialModel(draft, { asOf: AS_OF })
  assert.equal(result.code, MS.reviewRequired)
  assert.ok(result.model.assessment.reviewItems.includes('unconfirmed_financial_lines'))
})

test('does not permit approval while substantive review items remain', () => {
  const draft = approved()
  draft.lines.find((item) => item.lineId === 'commission').status = S.estimated
  draft.lines.find((item) => item.lineId === 'commission').source = { type: 'calculation' }
  const result = buildConveyancerFinancialModel(draft, { asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('financial_model_not_approvable'))
})

test('requires tax treatment confirmation before readiness', () => {
  const draft = input()
  draft.consideration.taxTreatment = 'unknown'
  const result = buildConveyancerFinancialModel(draft, { asOf: AS_OF })
  assert.equal(result.code, MS.reviewRequired)
  assert.ok(result.model.assessment.reviewItems.includes('tax_treatment_confirmation_required'))
})

test('blocks a negative seller proceeds position', () => {
  const draft = input()
  draft.lines.push(line('large_settlement', C.sellerDeduction, T.bondSettlement, '2000000.00', { recipientParty: 'bank' }))
  const result = buildConveyancerFinancialModel(draft, { asOf: AS_OF })
  assert.equal(result.code, MS.blocked)
  assert.ok(result.model.assessment.blockers.includes('seller_net_proceeds_negative'))
})

test('rejects duplicate line identities', () => {
  const draft = input()
  draft.lines.push(structuredClone(draft.lines[0]))
  const result = buildConveyancerFinancialModel(draft, { asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('financial_line_ids_invalid'))
})

test('requires authority evidence for adjustments', () => {
  const draft = input()
  draft.lines.push(line('manual_adjustment', C.buyerCredit, T.adjustment, '500.00', { liableParty: 'trust_account', recipientParty: 'buyer', source: source('manual', 'adjustment:d5') }))
  const result = buildConveyancerFinancialModel(draft, { asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('financial_adjustment_authority_required:manual_adjustment'))
})

test('enforces lane-specific capture authority', () => {
  const result = buildConveyancerFinancialModel(input({ preparedBy: { role: R.bondAttorney, userId: 'wrong-lane-d5' } }), { asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('financial_model_preparer_not_authorised'))
})

test('requires independent legal approval', () => {
  const result = buildConveyancerFinancialModel(approved({ preparedBy: attorney }), { asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('independent_financial_approval_required'))
})

test('does not let accounts approve the legal financial position', () => {
  const draft = approved()
  draft.approval.approvedBy = { role: R.accounts, userId: 'accounts-approver-d5' }
  const result = buildConveyancerFinancialModel(draft, { asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('financial_model_approval_invalid'))
})

test('binds an append-only revision to the exact previous model', () => {
  const previous = buildConveyancerFinancialModel(approved(), { asOf: AS_OF }).model
  const nextInput = approved({
    financialModelId: 'financial-model:d5:2',
    revision: 2,
    previousFinancialModelId: previous.financialModelId,
    previousFingerprint: previous.fingerprint,
    changeReason: 'Updated the confirmed municipal clearance amount.',
    preparedAt: '2026-07-16T10:00:00.000Z',
    approval: {
      decisionReferenceId: 'financial-approval:d5:2',
      summary: 'Revised position independently checked.',
      approvedAt: '2026-07-16T11:00:00.000Z',
      approvedBy: attorney,
    },
  })
  const next = buildConveyancerFinancialModel(nextInput, { asOf: '2026-07-16T12:00:00.000Z' }).model
  const comparison = compareConveyancerFinancialModelRevision(previous, next)
  assert.equal(comparison.valid, true, JSON.stringify(comparison.errors))
  const tampered = structuredClone(next)
  tampered.previousFingerprint = 'fnv1a_deadbeef'
  tampered.fingerprint = undefined
  assert.ok(compareConveyancerFinancialModelRevision(previous, tampered).errors.includes('financial_model_supersession_binding_invalid'))
})

test('detects summary and fingerprint tampering', () => {
  const model = buildConveyancerFinancialModel(approved(), { asOf: AS_OF }).model
  const tamperedSummary = structuredClone(model)
  tamperedSummary.summary.sellerNetProceedsMinor += 1
  assert.ok(validateConveyancerFinancialModel(tamperedSummary).errors.includes('financial_model_summary_stale'))
  const tamperedLine = structuredClone(model)
  tamperedLine.lines[0].amountMinor += 1
  assert.ok(validateConveyancerFinancialModel(tamperedLine).errors.includes('financial_model_fingerprint_invalid'))
})

test('keeps persistence, payments, trust posting, statements and registration outside D5', () => {
  const result = buildConveyancerFinancialModel(approved({ paymentPerformed: true }), { asOf: AS_OF })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('financial_model_side_effect_boundary_violated'))
})

test('rejects unsupported currencies and future source evidence', () => {
  const currency = buildConveyancerFinancialModel(input({ currency: 'USD' }), { asOf: AS_OF })
  assert.ok(currency.errors.includes('financial_model_currency_not_supported'))
  const future = input()
  future.lines[0].source.effectiveAt = '2026-07-16T09:00:00.000Z'
  assert.ok(buildConveyancerFinancialModel(future, { asOf: AS_OF }).errors.includes('financial_line_source_in_future:deposit'))
})

console.log('D5 conveyancer financial-model tests passed.')
