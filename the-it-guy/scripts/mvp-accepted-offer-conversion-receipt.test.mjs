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
  },
})
assert.equal(created.ready, true)
assert.equal(created.status, 'created')
assert.equal(created.atomicVerified, true)

const reused = assessMvpAcceptedOfferConversionReceipt({
  candidate: { ...candidate, status: 'converted' },
  result: {
    transactionId: 'transaction-1',
    persisted: true,
    existing: true,
  },
})
assert.equal(reused.ready, true)
assert.equal(reused.status, 'reused')

assert.throws(
  () => assertMvpAcceptedOfferConversionReceipt({
    candidate,
    result: { transactionId: 'transaction-1', persisted: true, existing: false, atomicCreation: { ready: false } },
  }),
  (error) => error?.code === 'MVP_ACCEPTED_OFFER_CONVERSION_UNCONFIRMED',
)

console.log('Accepted-offer transaction conversion receipt checks passed.')
