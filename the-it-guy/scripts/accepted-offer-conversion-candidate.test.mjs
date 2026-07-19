import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { buildAcceptedOfferConversionCandidate } = await server.ssrLoadModule('/src/lib/buyerLifecycleService.js')
  const ready = buildAcceptedOfferConversionCandidate({
    id: 'offer-1', organisationId: 'org-1', listingId: 'listing-1', buyerLeadId: 'buyer-1',
    offerAmount: 2_500_000, financeType: 'bond', conditions: { clientIntakePreference: 'digital_portal' },
  }, { now: '2026-07-19T08:00:00.000Z' })
  assert.equal(ready.status, 'ready')
  assert.equal(ready.candidateKey, 'org-1:offer-1')

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
} finally {
  await server.close()
}
const lifecycleSource = fs.readFileSync('src/lib/buyerLifecycleService.js', 'utf8')
assert.match(lifecycleSource, /ensureAcceptedOfferConversionCandidate\(\{\n      organisationId: scopedOrganisationId/)
assert.match(lifecycleSource, /ACCEPTED_OFFER_CONVERSION_CANDIDATE_BLOCKED/)
assert.match(lifecycleSource, /ACCEPTED_OFFER_TRANSACTION_CREATE_UNCONFIRMED/)
console.log('accepted-offer-conversion-candidate: passed')
