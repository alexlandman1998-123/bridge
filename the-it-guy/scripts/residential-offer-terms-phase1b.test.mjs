import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import {
  RESIDENTIAL_OFFER_TERMS_BUCKETS,
  RESIDENTIAL_OFFER_TERMS_VERSION,
  buildResidentialOfferTermsSnapshot,
  mergeResidentialOfferTermsIntoConditions,
} from '../src/core/offers/residentialOfferTerms.js'
import { buildAgentAssistedOfferEntry } from '../src/lib/agentAssistedOfferEntry.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:residential-offer-terms-phase1b'],
  'node scripts/residential-offer-terms-phase1b.test.mjs',
  'package.json should expose the Phase 1B residential offer terms contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-chapter1']?.includes('test:residential-offer-terms-phase1b'),
  'Chapter 1 verification should include the Phase 1B residential offer terms contract.',
)

const buyerSubmission = {
  fullName: 'Test Buyer',
  email: 'BUYER@EXAMPLE.TEST',
  phone: '0820000000',
  idNumber: '8001015009087',
  purchaserType: 'individual',
  offerAmount: '2500000',
  depositAmount: '250000',
  financeType: 'hybrid',
  bondAmount: '2250000',
  cashContribution: '250000',
  proofOfFundsReference: 'Bank pre-approval',
  subjectToSale: true,
  subjectSaleProperty: '12 Old Street',
  subjectSaleTimeline: '90 days',
  occupationDate: '2026-10-01',
  occupationalRent: true,
  occupationalRentAmount: '18000',
  includedFixtures: 'Curtains and alarm system',
  excludedFixtures: '',
  specialConditions: 'House needs to be repainted before occupation.',
  acknowledgeSellerReview: true,
  acknowledgeLegalDisclaimer: true,
  acknowledgeInfoAccuracy: true,
}

const snapshot = buildResidentialOfferTermsSnapshot(buyerSubmission, {
  source: 'phase1b_test',
  captureMethod: 'buyer_self_service',
  capturedAt: '2026-07-29T10:00:00.000Z',
})
assert.equal(snapshot.version, RESIDENTIAL_OFFER_TERMS_VERSION)
assert.deepEqual(snapshot.dataBuckets, RESIDENTIAL_OFFER_TERMS_BUCKETS)
assert.equal(snapshot.buyer.email, 'buyer@example.test')
assert.equal(snapshot.finance.financeType, 'combination')
assert.equal(snapshot.finance.offerAmount, 2500000)
assert.equal(snapshot.terms.subjectToSale, true)
assert.equal(snapshot.conditionRequests.reviewRequired, true)
assert.ok(snapshot.conditionRequests.reviewFields.includes('specialConditions'))
assert.ok(snapshot.conditionRequests.reviewFields.includes('subjectToSale'))
assert.equal(snapshot.readiness.agentReviewRequired, true)
assert.equal(snapshot.readiness.readyForOtpGeneration, false)

const merged = mergeResidentialOfferTermsIntoConditions(
  { agentName: 'Agent One', clientIntakePreference: 'digital_portal' },
  buyerSubmission,
  { source: 'canonical_buyer_offer_link', capturedAt: '2026-07-29T10:00:00.000Z' },
)
assert.equal(merged.agentName, 'Agent One')
assert.equal(merged.specialConditions, buyerSubmission.specialConditions)
assert.equal(merged.occupationalRentPayable, true)
assert.equal(merged.residentialOfferTermsVersion, RESIDENTIAL_OFFER_TERMS_VERSION)
assert.equal(merged.residentialOfferTerms.finance.financeType, 'combination')
assert.equal(merged.otpPreGenerationReview.status, 'agent_review_required')

const cleanSubmission = {
  fullName: 'Clean Buyer',
  email: 'clean@example.test',
  phone: '0820000001',
  offerAmount: '2000000',
  financeType: 'cash',
}
const cleanTerms = buildResidentialOfferTermsSnapshot(cleanSubmission)
assert.equal(cleanTerms.readiness.agentReviewRequired, false)
assert.equal(cleanTerms.readiness.readyForOtpGeneration, true)

const assisted = buildAgentAssistedOfferEntry({
  buyer: { name: 'Manual Buyer', email: 'manual@example.test', phone: '0820000002' },
  draft: { offerAmount: '1900000', depositAmount: '100000', financeType: 'bond', specialConditions: 'Subject to bond approval.' },
  now: '2026-07-29T11:00:00.000Z',
})
assert.equal(assisted.ok, true)
assert.equal(assisted.payload.conditionsJson.residentialOfferTerms.version, RESIDENTIAL_OFFER_TERMS_VERSION)
assert.equal(assisted.payload.conditionsJson.otpPreGenerationReview.status, 'agent_review_required')

const listingOffersServiceSource = await readFile(new URL('../src/lib/listingOffersService.js', import.meta.url), 'utf8')
const buyerLifecycleServiceSource = await readFile(new URL('../src/lib/buyerLifecycleService.js', import.meta.url), 'utf8')
assert.match(listingOffersServiceSource, /buildResidentialOfferTermsSnapshot/)
assert.match(listingOffersServiceSource, /mergeResidentialOfferTermsIntoConditions/)
assert.match(buyerLifecycleServiceSource, /mergeResidentialOfferTermsIntoConditions/)

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const listingOffers = await server.ssrLoadModule('/src/lib/listingOffersService.js')
  const buyerLifecycle = await server.ssrLoadModule('/src/lib/buyerLifecycleService.js')
  assert.equal(typeof listingOffers.submitBuyerOffer, 'function')
  assert.equal(typeof buyerLifecycle.submitCanonicalBuyerOffer, 'function')
} finally {
  await server.close()
}

console.log('Residential offer terms Phase 1B contract passed.')
