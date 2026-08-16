import assert from 'node:assert/strict'
import {
  assessMvpAcceptedOfferConversionReceipt,
  assertMvpAcceptedOfferConversionReceipt,
} from '../src/core/transactions/mvpAcceptedOfferConversionReceipt.js'

const candidate = {
  status: 'ready',
  acceptedOfferId: 'offer-1',
}
const created = assessMvpAcceptedOfferConversionReceipt({
  candidate,
  result: {
    transactionId: 'transaction-1',
    persisted: true,
    existing: false,
    atomicCreation: { ready: true },
    transactionRow: {
      transaction: {
        id: 'transaction-1',
        accepted_offer_id: 'offer-1',
        creation_idempotency_key: 'mvp_tx_org_offer_offer-1',
      },
    },
  },
})
assert.equal(created.ready, true)
assert.equal(created.status, 'created')
assert.equal(created.atomicVerified, true)
assert.equal(created.transactionAcceptedOfferId, 'offer-1')
assert.equal(created.idempotencyKey, 'mvp_tx_org_offer_offer-1')

const reused = assessMvpAcceptedOfferConversionReceipt({
  candidate: { ...candidate, status: 'converted' },
  result: {
    transactionId: 'transaction-1',
    persisted: true,
    existing: true,
    transactionRow: {
      transaction: {
        id: 'transaction-1',
        accepted_offer_id: 'offer-1',
        creation_idempotency_key: 'mvp_tx_org_offer_offer-1',
      },
    },
  },
})
assert.equal(reused.ready, true)
assert.equal(reused.status, 'reused')

const mismatchedReuse = assessMvpAcceptedOfferConversionReceipt({
  candidate: { ...candidate, status: 'converted' },
  result: {
    transactionId: 'transaction-1',
    persisted: true,
    existing: true,
    transactionRow: {
      transaction: {
        id: 'transaction-1',
        accepted_offer_id: 'offer-2',
        creation_idempotency_key: 'mvp_tx_org_offer_offer-2',
      },
    },
  },
})
assert.equal(mismatchedReuse.ready, false)
assert.ok(mismatchedReuse.issues.includes('accepted_offer_mismatch'))

const missingIdempotencyReuse = assessMvpAcceptedOfferConversionReceipt({
  candidate: { ...candidate, status: 'converted' },
  result: {
    transactionId: 'transaction-1',
    persisted: true,
    existing: true,
    transactionRow: {
      transaction: {
        id: 'transaction-1',
        accepted_offer_id: 'offer-1',
      },
    },
  },
})
assert.equal(missingIdempotencyReuse.ready, false)
assert.ok(missingIdempotencyReuse.issues.includes('idempotency_key_missing'))

assert.throws(
  () => assertMvpAcceptedOfferConversionReceipt({
    candidate,
    result: { transactionId: 'transaction-1', persisted: true, existing: false, atomicCreation: { ready: false } },
  }),
  (error) => error?.code === 'MVP_ACCEPTED_OFFER_CONVERSION_UNCONFIRMED',
)

console.log('Accepted-offer transaction conversion receipt checks passed.')
