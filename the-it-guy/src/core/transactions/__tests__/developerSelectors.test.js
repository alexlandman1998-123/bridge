import assert from 'node:assert/strict'
import {
  selectActiveTransactions,
  selectBottlenecks,
  selectDealBottleneckSummary,
} from '../developerSelectors.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function developmentRow(overrides = {}) {
  const { transaction: transactionOverrides = {}, unit: unitOverrides = {}, buyer: buyerOverrides = {}, ...rest } = overrides
  return {
    development: { id: 'dev-1', name: 'Junoah Estate' },
    unit: { id: 'unit-1', development_id: 'dev-1', unit_number: '006', price: 2500000, ...unitOverrides },
    buyer: { id: 'buyer-1', name: 'Client Buyer', ...buyerOverrides },
    transaction: {
      id: 'tx-1',
      unit_id: 'unit-1',
      buyer_id: 'buyer-1',
      transaction_type: 'developer_sale',
      current_main_stage: 'DEP',
      reservation_required: true,
      reservation_status: 'paid',
      onboarding_status: 'Complete',
      purchase_price: 2500000,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
      ...transactionOverrides,
    },
    ...rest,
  }
}

test('active developer transactions use readiness next actions', () => {
  const rows = selectActiveTransactions([developmentRow()])

  assert.equal(rows.length, 1)
  assert.equal(rows[0].nextAction, 'Review reservation proof of payment')
  assert.equal(rows[0].nextActionTargetMenu, 'financials')
  assert.equal(rows[0].nextActionPriority, 'High')
  assert.equal(rows[0].readinessHealth, 'Waiting')
  assert.equal(rows[0].readinessTone, 'warning')
})

test('developer bottlenecks use readiness next actions', () => {
  const bottlenecks = selectBottlenecks([developmentRow()], { DEP: 1 })

  assert.equal(bottlenecks.length, 1)
  assert.equal(bottlenecks[0].nextAction, 'Review reservation proof of payment')
  assert.equal(bottlenecks[0].nextActionTargetMenu, 'financials')
  assert.equal(bottlenecks[0].nextActionPriority, 'High')
})

test('active developer transactions preserve explicit stage progress while adding readiness', () => {
  const rows = selectActiveTransactions([
    developmentRow({
      transaction: {
        current_main_stage: 'FIN',
        reservation_status: 'verified',
        finance_type: 'bond',
      },
    }),
  ])

  assert.equal(rows[0].stageKey, 'FIN')
  assert.equal(rows[0].stageLabel, 'Finance')
  assert.equal(rows[0].financeType, 'bond')
  assert.equal(rows[0].nextAction, 'Progress developer transaction workflow')
})

test('developer bottleneck summary includes readiness-specific counters', () => {
  const summary = selectDealBottleneckSummary([
    developmentRow(),
    developmentRow({
      unit: { id: 'unit-2', development_id: 'dev-1', unit_number: '007', price: 3000000 },
      buyer: { id: 'buyer-2', name: 'Second Buyer' },
      transaction: {
        id: 'tx-2',
        unit_id: 'unit-2',
        buyer_id: 'buyer-2',
        current_main_stage: 'REG',
        reservation_status: 'verified',
        onboarding_status: 'Complete',
      },
      handover: {
        status: 'in_progress',
        inspectionCompleted: true,
      },
      snagSummary: {
        openCount: 1,
      },
    }),
  ])
  const byKey = Object.fromEntries(summary.items.map((item) => [item.key, item]))

  assert.equal(byKey.reservation_review.count, 1)
  assert.equal(byKey.handover_readiness.count, 1)
  assert.equal(summary.totalFlagged >= 2, true)
})
