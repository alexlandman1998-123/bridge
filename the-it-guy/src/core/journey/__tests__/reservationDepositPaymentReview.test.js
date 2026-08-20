import assert from 'node:assert/strict'
import {
  RESERVATION_DEPOSIT_MARK_PAID_SOURCE,
  RESERVATION_DEPOSIT_STAGE_KEY,
  buildReservationDepositMarkPaidOverrideRow,
  buildReservationDepositMarkPaidTransactionPatch,
  normalizeReservationDepositStatus,
  resolveReservationDepositPaymentReviewState,
} from '../reservationDepositPaymentReview.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const ORG_ID = '11111111-1111-4111-8111-111111111111'
const TRANSACTION_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const DOCUMENT_ID = '44444444-4444-4444-8444-444444444444'
const NOW = new Date('2026-08-20T10:15:30.000Z')

test('normalizes reservation status without making optional deposits look active', () => {
  assert.equal(normalizeReservationDepositStatus('paid', { required: false }), 'not_required')
  assert.equal(normalizeReservationDepositStatus('completed', { required: true }), 'paid')
  assert.equal(normalizeReservationDepositStatus('verified', { required: true }), 'verified')
  assert.equal(normalizeReservationDepositStatus('unknown', { required: true }), 'pending')
})

test('builds a paid transaction patch that never verifies the deposit', () => {
  const patch = buildReservationDepositMarkPaidTransactionPatch({
    paidDate: '2026-08-19',
    proofDocumentId: DOCUMENT_ID,
    now: NOW,
  })

  assert.equal(patch.reservation_status, 'paid')
  assert.equal(patch.reservation_paid_date, '2026-08-19')
  assert.equal(patch.reservation_proof_document, DOCUMENT_ID)
  assert.equal(patch.reservation_proof_uploaded_at, NOW.toISOString())
  assert.equal(patch.reservation_reviewed_at, null)
  assert.equal(patch.reservation_reviewed_by, null)
  assert.equal(patch.reservation_review_notes, null)
  assert.equal(Object.values(patch).includes('verified'), false)
})

test('serializes a transaction mark-paid override with internal-only audit metadata', () => {
  const result = buildReservationDepositMarkPaidOverrideRow({
    transaction: {
      id: TRANSACTION_ID,
      organisation_id: ORG_ID,
      reservation_required: true,
      reservation_amount: 25000,
      reservation_status: 'pending',
    },
    reason: 'Buyer paid while agent was on site.',
    reference: 'RES-UNIT-14',
    paidDate: '2026-08-20',
    proofDocumentId: DOCUMENT_ID,
    actorUserId: ACTOR_ID,
    now: NOW,
  })

  assert.equal(result.valid, true)
  assert.equal(result.row.entity_type, 'transaction')
  assert.equal(result.row.entity_id, TRANSACTION_ID)
  assert.equal(result.row.stage_key, RESERVATION_DEPOSIT_STAGE_KEY)
  assert.equal(result.row.action_type, 'mark_paid')
  assert.equal(result.row.notification_mode, 'internal_only')
  assert.equal(result.row.metadata.source, RESERVATION_DEPOSIT_MARK_PAID_SOURCE)
  assert.equal(result.row.metadata.amount, 25000)
  assert.equal(result.row.metadata.reference, 'RES-UNIT-14')
  assert.equal(result.row.metadata.proofDocumentId, DOCUMENT_ID)
  assert.equal(result.row.metadata.verificationRequired, true)
})

test('keeps paid deposits in review-required and progression-blocked state', () => {
  const state = resolveReservationDepositPaymentReviewState({
    reservation_required: true,
    reservation_status: 'paid',
    reservation_paid_date: '2026-08-20',
  })

  assert.equal(state.paid, true)
  assert.equal(state.verified, false)
  assert.equal(state.requiresReview, true)
  assert.equal(state.blocksProgression, true)
  assert.equal(state.canMarkPaid, true)
})

test('does not allow mark-paid once the reservation deposit is verified', () => {
  const state = resolveReservationDepositPaymentReviewState({
    reservation_required: true,
    reservation_status: 'verified',
  })

  assert.equal(state.canMarkPaid, false)
  assert.equal(state.requiresReview, false)
  assert.equal(state.blocksProgression, false)
})
