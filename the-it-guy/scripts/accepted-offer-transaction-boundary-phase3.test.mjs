import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assessMvpAcceptedOfferConversionReceipt,
} from '../src/core/transactions/mvpAcceptedOfferConversionReceipt.js'

const transactionLifecycleSource = readFileSync(new URL('../src/lib/transactionLifecycleService.js', import.meta.url), 'utf8')
const buyerLifecycleSource = readFileSync(new URL('../src/lib/buyerLifecycleService.js', import.meta.url), 'utf8')

const validReuse = assessMvpAcceptedOfferConversionReceipt({
  acceptedOfferId: 'offer-phase3',
  candidate: { status: 'converted', acceptedOfferId: 'offer-phase3' },
  result: {
    transactionId: 'transaction-phase3',
    existing: true,
    persisted: true,
    transactionRow: {
      transaction: {
        id: 'transaction-phase3',
        accepted_offer_id: 'offer-phase3',
        creation_idempotency_key: 'mvp_tx_org_offer_offer-phase3',
      },
    },
  },
})
assert.equal(validReuse.ready, true, 'matching accepted-offer reuse should produce a receipt')
assert.equal(validReuse.status, 'reused')

const wrongOfferReuse = assessMvpAcceptedOfferConversionReceipt({
  acceptedOfferId: 'offer-phase3',
  candidate: { status: 'converted', acceptedOfferId: 'offer-phase3' },
  result: {
    transactionId: 'transaction-phase3',
    existing: true,
    persisted: true,
    transactionRow: {
      transaction: {
        id: 'transaction-phase3',
        accepted_offer_id: 'offer-other',
        creation_idempotency_key: 'mvp_tx_org_offer_offer-other',
      },
    },
  },
})
assert.equal(wrongOfferReuse.ready, false, 'wrong accepted-offer linkage must block reuse')
assert.ok(wrongOfferReuse.issues.includes('accepted_offer_mismatch'))

const missingIdempotencyReuse = assessMvpAcceptedOfferConversionReceipt({
  acceptedOfferId: 'offer-phase3',
  candidate: { status: 'converted', acceptedOfferId: 'offer-phase3' },
  result: {
    transactionId: 'transaction-phase3',
    existing: true,
    persisted: true,
    transactionRow: {
      transaction: {
        id: 'transaction-phase3',
        accepted_offer_id: 'offer-phase3',
      },
    },
  },
})
assert.equal(missingIdempotencyReuse.ready, false, 'reused conversions must expose an idempotency key')
assert.ok(missingIdempotencyReuse.issues.includes('idempotency_key_missing'))

assert.match(
  transactionLifecycleSource,
  /const duplicate = !acceptedOfferId\s*\?\s*await findExistingTransactionForLead/s,
  'accepted-offer conversions must not reuse by broad buyer-lead duplicate lookup',
)
assert.match(
  transactionLifecycleSource,
  /const TRANSACTION_IDENTITY_SELECT = .*creation_idempotency_key.*buyer_contact_id.*assigned_agent_id/s,
  'transaction identity lookup must include conversion continuity fields',
)
assert.match(
  transactionLifecycleSource,
  /export async function findTransactionIdentityById/,
  'linked offer.transaction_id reuse must be able to fetch the transaction identity row',
)
assert.equal(
  (buyerLifecycleSource.match(/assertMvpAcceptedOfferConversionReceipt/g) || []).length >= 3,
  true,
  'fresh and reused accepted-offer conversion paths should assert receipts',
)
assert.match(
  buyerLifecycleSource,
  /findTransactionIdentityById/,
  'linked transaction reuse should verify persisted transaction identity before success',
)

console.log('Accepted-offer transaction boundary Phase 3 checks passed.')
