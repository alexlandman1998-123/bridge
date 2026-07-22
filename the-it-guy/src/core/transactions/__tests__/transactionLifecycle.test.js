import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildTransactionLifecycleSummary,
  buildTransactionLifecycleSummaryFromRollup,
  getVisibleMatterLifecycleStages,
  normalizeTransactionLifecycleStage,
} from '../transactionLifecycle.js'

test('normalizes legacy and backend lifecycle signals to attorney-facing stages', () => {
  assert.equal(normalizeTransactionLifecycleStage('confirmed'), 'instruction')
  assert.equal(normalizeTransactionLifecycleStage('buyer_onboarding'), 'instruction')
  assert.equal(normalizeTransactionLifecycleStage('missing FICA documents'), 'documents')
  assert.equal(normalizeTransactionLifecycleStage('bond application approved'), 'finance')
  assert.equal(normalizeTransactionLifecycleStage('rates clearance completed'), 'transfer_duty')
  assert.equal(normalizeTransactionLifecycleStage('lodged at deeds office'), 'lodgement')
  assert.equal(normalizeTransactionLifecycleStage('final report sent'), 'post_registration')
})

test('cash matters keep Finance visible as not required, never active', () => {
  const summary = buildTransactionLifecycleSummary({
    transaction: {
      id: 'tx-cash',
      finance_type: 'cash',
      current_main_stage: 'FIN',
      lifecycle_state: 'active',
    },
  })

  const financeStage = summary.stages.find((stage) => stage.key === 'finance')
  assert.equal(summary.currentStage, 'documents')
  assert.equal(financeStage.state, 'not_required')
  assert.equal(financeStage.statusLabel, 'Not Required')
})

test('bond matters show Finance as a real stage', () => {
  const summary = buildTransactionLifecycleSummary({
    transaction: {
      id: 'tx-bond',
      finance_type: 'bond',
      current_main_stage: 'FIN',
      lifecycle_state: 'active',
    },
  })

  const financeStage = summary.stages.find((stage) => stage.key === 'finance')
  assert.equal(summary.currentStage, 'finance')
  assert.equal(financeStage.state, 'current')
  assert.equal(financeStage.statusLabel, 'In Progress')
})

test('rollup transfer parent stage resolves to Transfer Duty stage', () => {
  const summary = buildTransactionLifecycleSummaryFromRollup(
    {
      transactionId: 'tx-transfer',
      parentStage: 'TRANSFER',
      parentStatus: 'active',
      progressPercent: 58,
      blockers: [{ workflowKey: 'attorney_transfer', message: 'Rates clearance outstanding' }],
    },
    {
      transaction: { id: 'tx-transfer', finance_type: 'bond' },
    },
  )

  assert.equal(summary.currentStage, 'transfer_duty')
  assert.equal(summary.stages.some((stage) => stage.key === 'lodgement'), true)
  assert.equal(summary.blockersByStage.transfer_duty[0], 'Rates clearance outstanding')
})

test('visible stage selector supports omitting cash Finance when required by a view', () => {
  const stages = getVisibleMatterLifecycleStages({
    transaction: { finance_type: 'cash' },
    currentStage: 'documents',
    cashFinanceMode: 'omit',
  })

  assert.equal(stages.some((stage) => stage.key === 'finance'), false)
})
