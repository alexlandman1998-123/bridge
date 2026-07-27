import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const {
    assertAcceptedOfferConversionFinalGate,
    assessAcceptedOfferConversionFinalGate,
    buildAcceptedOfferConversionCandidate,
  } = await server.ssrLoadModule('/src/lib/buyerLifecycleService.js')
  const ready = buildAcceptedOfferConversionCandidate({
    id: 'offer-1', organisationId: 'org-1', listingId: 'listing-1', buyerLeadId: 'buyer-1',
    offerAmount: 2_500_000, financeType: 'bond', conditions: { clientIntakePreference: 'digital_portal' },
  }, { now: '2026-07-19T08:00:00.000Z' })
  assert.equal(ready.status, 'ready')
  assert.equal(ready.candidateKey, 'org-1:offer-1')
  assert.equal(
    assessAcceptedOfferConversionFinalGate({
      candidate: ready,
      offer: { id: 'offer-1', organisationId: 'org-1', listingId: 'listing-1', buyerLeadId: 'buyer-1', offerAmount: 2_500_000 },
      payload: { acceptedOfferId: 'offer-1', organisationId: 'org-1', listingId: 'listing-1', originatingBuyerLeadId: 'buyer-1', purchasePrice: 2_500_000 },
    }).ready,
    true,
  )

  const converted = buildAcceptedOfferConversionCandidate({
    id: 'offer-1', organisationId: 'org-1', listingId: 'listing-1', buyerLeadId: 'buyer-1',
    offerAmount: 2_500_000, status: 'converted_to_transaction', transactionId: 'transaction-1',
  })
  assert.equal(converted.status, 'converted')
  assert.equal(converted.transactionId, 'transaction-1')

  const blocked = buildAcceptedOfferConversionCandidate({ id: 'offer-1', organisationId: 'org-1', listingId: 'listing-1' })
  assert.equal(blocked.status, 'needs_attention')
  assert.ok(blocked.blockers.includes('buyer_missing'))
  assert.ok(blocked.blockers.includes('offer_amount_missing'))

  assert.throws(
    () => assertAcceptedOfferConversionFinalGate({
      candidate: { ...ready, listingId: 'stale-listing-1' },
      offer: { id: 'offer-1', organisationId: 'org-1', listingId: 'listing-1', buyerLeadId: 'buyer-1', offerAmount: 2_500_000 },
      payload: { acceptedOfferId: 'offer-1', organisationId: 'org-1', listingId: 'listing-1', originatingBuyerLeadId: 'buyer-1', purchasePrice: 2_500_000 },
    }),
    (error) => error?.code === 'ACCEPTED_OFFER_CONVERSION_FINAL_GATE_BLOCKED' &&
      error?.details?.issues?.includes('listing_mismatch'),
  )
} finally {
  await server.close()
}
const lifecycleSource = fs.readFileSync('src/lib/buyerLifecycleService.js', 'utf8')
assert.match(lifecycleSource, /const candidateResult = await ensureAcceptedOfferConversionCandidate\(\{[\s\S]*?organisationId: scopedOrganisationId/)
assert.match(lifecycleSource, /const finalGateDiagnostic = assertAcceptedOfferConversionFinalGate\(\{[\s\S]*?const created = await createTransactionFromLeadOverride/)
assert.match(lifecycleSource, /ACCEPTED_OFFER_CONVERSION_CANDIDATE_BLOCKED/)
assert.match(lifecycleSource, /ACCEPTED_OFFER_CONVERSION_FINAL_GATE_BLOCKED/)
assert.match(lifecycleSource, /ACCEPTED_OFFER_TRANSACTION_CREATE_UNCONFIRMED/)
console.log('accepted-offer-conversion-candidate: passed')
