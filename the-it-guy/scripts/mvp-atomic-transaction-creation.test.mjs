import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assertMvpAtomicTransactionCreation, assessMvpAtomicTransactionCreation } from '../src/core/transactions/mvpAtomicTransactionCreation.js'

const expected = {
  organisationId: 'org-1', listingId: 'listing-1', leadId: 'lead-1', acceptedOfferId: 'offer-1', idempotencyKey: 'accepted-offer:offer-1',
}
const result = {
  transaction: {
    id: 'transaction-1', organisation_id: 'org-1', listing_id: 'listing-1', originating_lead_id: 'lead-1',
    originating_buyer_lead_id: 'lead-1', accepted_offer_id: 'offer-1', creation_idempotency_key: 'accepted-offer:offer-1',
  },
}
assert.equal(assessMvpAtomicTransactionCreation({ result, ...expected }).ready, true)
assert.equal(assertMvpAtomicTransactionCreation({ result, ...expected }).transactionId, 'transaction-1')
assert.throws(
  () => assertMvpAtomicTransactionCreation({ result: { transaction: { ...result.transaction, accepted_offer_id: 'other-offer' } }, ...expected }),
  (error) => error.code === 'MVP_ATOMIC_TRANSACTION_CREATION_UNVERIFIED',
)

const lifecycleSource = fs.readFileSync('src/lib/transactionLifecycleService.js', 'utf8')
const migrationSource = fs.readFileSync('../supabase/migrations/202607180046_mvp_atomic_transaction_creation_phase2a.sql', 'utf8')
assert.match(lifecycleSource, /bridge_create_mvp_transaction/)
assert.match(lifecycleSource, /assertMvpAtomicTransactionCreation/)
assert.match(migrationSource, /pg_advisory_xact_lock/)
assert.match(migrationSource, /bridge_seed_mvp_transaction_participants/)
assert.match(migrationSource, /bridge_seed_mvp_transaction_documents/)
assert.match(migrationSource, /bridge_seed_mvp_transaction_workflow_lanes/)
console.log('mvp-atomic-transaction-creation: passed')
