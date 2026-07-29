import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import {
  RESIDENTIAL_OFFER_CONDITION_REVIEW_VERSION,
  buildResidentialOfferConditionReviewPatch,
  resolveResidentialOfferConditionReview,
} from '../src/core/offers/residentialOfferConditionReview.js'
import { mergeResidentialOfferTermsIntoConditions } from '../src/core/offers/residentialOfferTerms.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:residential-offer-condition-review-phase1c'],
  'node scripts/residential-offer-condition-review-phase1c.test.mjs',
  'package.json should expose the Phase 1C condition review contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-chapter1']?.includes('test:residential-offer-condition-review-phase1c'),
  'Chapter 1 verification should include the Phase 1C condition review contract.',
)

const buyerConditions = mergeResidentialOfferTermsIntoConditions({}, {
  fullName: 'Test Buyer',
  email: 'buyer@example.test',
  phone: '0820000000',
  offerAmount: '2500000',
  financeType: 'bond',
  subjectToSale: true,
  subjectSaleProperty: '12 Old Street',
  subjectSaleTimeline: '90 days',
  specialConditions: 'House needs to be repainted before occupation.',
  includedFixtures: 'Curtains',
}, {
  source: 'buyer_offer_link',
  capturedAt: '2026-07-29T10:00:00.000Z',
})

const offer = {
  id: 'offer-1',
  offerAmount: 2500000,
  financeType: 'bond',
  conditions: buyerConditions,
}

const requiredReview = resolveResidentialOfferConditionReview(offer)
assert.equal(requiredReview.version, RESIDENTIAL_OFFER_CONDITION_REVIEW_VERSION)
assert.equal(requiredReview.status, 'agent_review_required')
assert.equal(requiredReview.reviewRequired, true)
assert.equal(requiredReview.readyForOtpGeneration, false)
assert.ok(requiredReview.reviewFields.includes('specialConditions'))
assert.ok(requiredReview.reviewFields.includes('subjectToSale'))

const approvedPatch = buildResidentialOfferConditionReviewPatch({
  offer,
  decision: 'approve',
  revisedConditions: {
    specialConditions: 'The Seller shall repaint the interior of the dwelling before occupation by the Purchaser.',
    subjectSaleTimeline: 'The Purchaser must sell the property at 12 Old Street within 90 days of acceptance.',
  },
  actor: { id: 'agent-1', name: 'Agent One', email: 'agent@example.test' },
  note: 'Professional wording approved.',
  now: '2026-07-29T11:00:00.000Z',
})

const approvedConditions = approvedPatch.conditions_json
assert.equal(approvedConditions.specialConditions, 'The Seller shall repaint the interior of the dwelling before occupation by the Purchaser.')
assert.equal(approvedConditions.approvedConditionWording.status, 'approved')
assert.equal(approvedConditions.approvedConditionWording.fields.specialConditions, approvedConditions.specialConditions)
assert.equal(approvedConditions.otpPreGenerationReview.status, 'ready_to_generate_otp')
assert.equal(approvedConditions.otpPreGenerationReview.agentReviewRequired, false)
assert.equal(approvedConditions.residentialOfferTerms.conditionRequests.approvedConditionWording.version, RESIDENTIAL_OFFER_CONDITION_REVIEW_VERSION)
assert.equal(approvedConditions.residentialOfferTerms.readiness.readyForOtpGeneration, true)

const readyReview = resolveResidentialOfferConditionReview({ ...offer, conditions: approvedConditions })
assert.equal(readyReview.status, 'ready_to_generate_otp')
assert.equal(readyReview.readyForOtpGeneration, true)

const changesPatch = buildResidentialOfferConditionReviewPatch({
  offer,
  decision: 'request_changes',
  actor: { id: 'agent-1', name: 'Agent One' },
  note: 'Buyer must clarify repaint scope.',
  now: '2026-07-29T12:00:00.000Z',
})
assert.equal(changesPatch.conditions_json.approvedConditionWording.status, 'changes_requested')
assert.equal(changesPatch.conditions_json.otpPreGenerationReview.status, 'changes_requested')
assert.equal(changesPatch.conditions_json.otpPreGenerationReview.agentReviewRequired, true)

const buyerLifecycleSource = await readFile(new URL('../src/lib/buyerLifecycleService.js', import.meta.url), 'utf8')
const listingOffersSource = await readFile(new URL('../src/lib/listingOffersService.js', import.meta.url), 'utf8')
assert.match(buyerLifecycleSource, /reviewCanonicalOfferConditions/)
assert.match(buyerLifecycleSource, /buildResidentialOfferConditionReviewPatch/)
assert.match(listingOffersSource, /approve_condition_wording/)
assert.match(listingOffersSource, /request_clarification/)

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const buyerLifecycle = await server.ssrLoadModule('/src/lib/buyerLifecycleService.js')
  const listingOffers = await server.ssrLoadModule('/src/lib/listingOffersService.js')
  assert.equal(typeof buyerLifecycle.reviewCanonicalOfferConditions, 'function')
  assert.equal(typeof listingOffers.markOfferAgentAction, 'function')
} finally {
  await server.close()
}

console.log('Residential offer condition review Phase 1C contract passed.')
