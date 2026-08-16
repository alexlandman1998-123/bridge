import assert from 'node:assert/strict'
import {
  buildTransactionLifecycleSummary,
  buildTransactionLifecycleSummaryFromRollup,
} from '../transactionLifecycle.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('adds reservation deposit stage only when reservation is required', () => {
  const standard = buildTransactionLifecycleSummary({
    transaction: {
      id: 'tx-standard',
      current_main_stage: 'OTP',
    },
  })
  assert.deepEqual(standard.stages.map((stage) => stage.key), [
    'confirmed',
    'otp',
    'finance',
    'transfer',
    'registration',
  ])

  const reservation = buildTransactionLifecycleSummary({
    transaction: {
      id: 'tx-reservation',
      current_main_stage: 'OTP',
      reservation_required: true,
      reservation_status: 'paid',
    },
  })
  assert.deepEqual(reservation.stages.map((stage) => stage.key), [
    'confirmed',
    'reservation_deposit_paid',
    'otp',
    'finance',
    'transfer',
    'registration',
  ])
})

test('holds the rollup timeline at reservation deposit until it is paid', () => {
  const summary = buildTransactionLifecycleSummaryFromRollup(
    {
      transactionId: 'tx-reservation',
      parentStage: 'SALES_OTP',
      parentStatus: 'blocked',
      progressPercent: 25,
    },
    {
      transaction: {
        id: 'tx-reservation',
        reservation_required: true,
        reservation_status: 'pending',
      },
    },
  )

  assert.equal(summary.currentStage, 'reservation_deposit_paid')
  assert.equal(summary.stages[1].label, 'Reservation Deposit Paid')
  assert.equal(summary.stages[1].state, 'blocked')
  assert.deepEqual(summary.blockersByStage.reservation_deposit_paid, ['Reservation deposit is not paid.'])
})

