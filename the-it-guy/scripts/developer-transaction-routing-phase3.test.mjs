import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildTransactionLifecycleSummary,
  buildTransactionLifecycleSummaryFromRollup,
} from '../src/core/transactions/transactionLifecycle.js'

const appRoot = resolve(import.meta.dirname, '..')
const attorneyWorkspaceSource = readFileSync(resolve(appRoot, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')

const reservationSummary = buildTransactionLifecycleSummary({
  transaction: {
    id: 'tx-dev-reservation',
    transaction_type: 'developer_sale',
    current_main_stage: 'OTP',
    reservation_required: true,
    reservation_status: 'pending',
  },
})

assert.deepEqual(
  reservationSummary.stages.map((stage) => stage.key),
  ['confirmed', 'reservation_deposit_paid', 'otp', 'finance', 'transfer', 'registration'],
  'Developer transactions with required reservation deposits must include reservation before OTP.',
)
assert.equal(reservationSummary.currentStage, 'reservation_deposit_paid')

const standardSummary = buildTransactionLifecycleSummary({
  transaction: {
    id: 'tx-dev-no-reservation',
    transaction_type: 'developer_sale',
    current_main_stage: 'OTP',
    reservation_required: false,
  },
})

assert.deepEqual(
  standardSummary.stages.map((stage) => stage.key),
  ['confirmed', 'otp', 'finance', 'transfer', 'registration'],
  'Reservation deposit must not show when it is not relevant to the transaction.',
)

const rollupReservationSummary = buildTransactionLifecycleSummaryFromRollup(
  {
    transactionId: 'tx-dev-rollup-reservation',
    parentStage: 'SALES_OTP',
    parentStatus: 'blocked',
    progressPercent: 25,
  },
  {
    transaction: {
      id: 'tx-dev-rollup-reservation',
      transaction_type: 'developer_sale',
      reservation_required: true,
      reservation_status: 'pending',
    },
  },
)

assert.equal(rollupReservationSummary.currentStage, 'reservation_deposit_paid')
assert.deepEqual(
  rollupReservationSummary.blockersByStage.reservation_deposit_paid,
  ['Reservation deposit is not paid.'],
)

assert.match(
  attorneyWorkspaceSource,
  /buildTransactionLifecycleSummaryFromRollup\(transactionRollup,\s*\{\s*transactionId: transaction\?\.id,\s*transaction,/s,
  'Attorney transaction workspace must pass transaction into rollup lifecycle summary.',
)

assert.match(
  attorneyWorkspaceSource,
  /lifecycleProgress: displayedLifecycleProgress,/,
  'Agent/developer overview journey must use the displayed lifecycle progress.',
)

assert.match(
  attorneyWorkspaceSource,
  /reservation_deposit_paid: CircleDollarSign/,
  'Developer/agent journey must have a reservation deposit icon mapping.',
)

assert.match(
  attorneyWorkspaceSource,
  /Array\.isArray\(lifecycleProgress\?\.stages\) && lifecycleProgress\.stages\.length/,
  'Developer/agent journey must consume dynamic lifecycle stages from the lifecycle summary.',
)

console.log('developer transaction routing phase 3 test passed')
