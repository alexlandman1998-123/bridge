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
assert.equal(assessMvpAtomicTransactionCreation({
  result: { transaction: { ...result.transaction, originating_lead_id: null, originating_buyer_lead_id: null, buyer_contact_id: 'contact-1' } },
  ...expected,
  leadId: '',
  sellerLeadId: null,
  buyerContactId: 'contact-1',
}).ready, true, 'an accepted offer can link a buyer contact without inventing a lead')
assert.ok(assessMvpAtomicTransactionCreation({
  result: { transaction: { ...result.transaction, originating_seller_lead_id: 'wrong-seller-lead' } },
  ...expected,
  sellerLeadId: null,
}).issues.includes('seller_lead_mismatch'))
assert.ok(assessMvpAtomicTransactionCreation({
  result,
  ...expected,
  buyerContactId: 'expected-contact',
}).issues.includes('buyer_contact_mismatch'))
assert.throws(
  () => assertMvpAtomicTransactionCreation({ result: { transaction: { ...result.transaction, accepted_offer_id: 'other-offer' } }, ...expected }),
  (error) => error.code === 'MVP_ATOMIC_TRANSACTION_CREATION_UNVERIFIED',
)

const lifecycleSource = fs.readFileSync('src/lib/transactionLifecycleService.js', 'utf8')
const migrationSource = fs.readFileSync('../supabase/migrations/202607180046_mvp_atomic_transaction_creation_phase2a.sql', 'utf8')
const handoffMigrationSource = fs.readFileSync('../supabase/migrations/20260927084256_transaction_source_handoff_phase2.sql', 'utf8')
const offerConversionSource = fs.readFileSync('src/lib/buyerLifecycleService.js', 'utf8')
assert.match(lifecycleSource, /bridge_create_mvp_transaction/)
assert.match(lifecycleSource, /assertMvpAtomicTransactionCreation/)
assert.match(migrationSource, /pg_advisory_xact_lock/)
assert.match(migrationSource, /bridge_seed_mvp_transaction_participants/)
assert.match(migrationSource, /bridge_seed_mvp_transaction_documents/)
assert.match(migrationSource, /bridge_seed_mvp_transaction_workflow_lanes/)
assert.match(handoffMigrationSource, /v_offer_lead_id is null and v_offer_contact_id is null/)
assert.match(handoffMigrationSource, /v_offer_lead_id is distinct from v_lead_id/)
assert.match(handoffMigrationSource, /sourceContinuity/)
assert.match(handoffMigrationSource, /sellerOnboardingId/)
assert.match(handoffMigrationSource, /add column if not exists originating_seller_lead_id uuid/)
assert.match(handoffMigrationSource, /v_listing_id, v_lead_id, v_lead_id, v_seller_lead_id, v_offer_id/)
assert.match(handoffMigrationSource, /previous\.buyer_contact_id = v_buyer_contact_id/)
assert.match(handoffMigrationSource, /v_transaction\.originating_buyer_lead_id is distinct from v_lead_id/)
assert.match(handoffMigrationSource, /bridge_offer_wet_ink_execution_ready/)
assert.doesNotMatch(handoffMigrationSource, /lower\(email\) = v_buyer_email/)
assert.match(offerConversionSource, /let canonicalOffer = mapOfferDbRow\(offerRow\)/)
assert.match(offerConversionSource, /const canonicalListing = \{\s*\.\.\.listingQuery\.data,/)
assert.doesNotMatch(offerConversionSource, /canonicalListing = \{ \.\.\.listingQuery\.data, \.\.\.\(listing \|\| \{\}\) \}/)
console.log('mvp-atomic-transaction-creation: passed')
