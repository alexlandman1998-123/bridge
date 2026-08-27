import assert from 'node:assert/strict'
import test from 'node:test'
import { buildBuyerFinancePresentationModel } from '../buyerFinancePresentationModel.js'

test('normalizes demo bond finance into one staged presentation model', () => {
  const model = buildBuyerFinancePresentationModel({
    source: 'demo',
    financeType: 'bond',
    status: 'Application being prepared',
    currentStage: 'application',
    purchasePrice: 'R 2 850 000',
    requestedAmount: 'R 2 280 000',
    loanToValue: '80%',
    requiredActions: [{ id: 'payslip', title: 'Upload latest payslip' }],
    bankApplications: [{ bankId: 'fnb', bankName: 'FNB', status: 'Awaiting response' }],
  })

  assert.equal(model.mode, 'bond')
  assert.equal(model.stageKey, 'application')
  assert.equal(model.stages[0].state, 'current')
  assert.equal(model.firstAction.title, 'Upload latest payslip')
  assert.equal(model.bankApplications[0].id, 'fnb')
  assert.equal(model.requestedAmountLabel, 'R 2 280 000')
})

test('derives a response stage and accepted lender state from production offers', () => {
  const model = buildBuyerFinancePresentationModel({
    source: 'production',
    financeType: 'hybrid',
    status: 'Under review',
    offers: [{ id: 'offer-1', bankName: 'ABSA', offeredAmount: 2200000, buyerDecision: 'accepted' }],
  })

  assert.equal(model.mode, 'hybrid')
  assert.equal(model.stageKey, 'approval')
  assert.equal(model.offers[0].isAccepted, true)
  assert.match(model.offers[0].amountLabel, /2.?200.?000/)
})

test('represents cash account state without inventing a bond journey', () => {
  const model = buildBuyerFinancePresentationModel({
    source: 'production',
    financeType: 'cash',
    accountCount: 1,
    accountSummary: { balanceDue: 125000, openRequests: 2, overdueRequests: 1, documentCount: 3 },
  })

  assert.equal(model.isCashFinance, true)
  assert.equal(model.status, 'Account published')
  assert.deepEqual(model.stages, [])
  assert.equal(model.account.openRequests, 2)
  assert.equal(model.hasAction, true)
})
