import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { resolveOtpDocumentVariant } from '../src/core/documents/otpRouteUniverse.js'
import { buildResidentialOfferConditionReviewPatch } from '../src/core/offers/residentialOfferConditionReview.js'
import {
  RESIDENTIAL_OFFER_TERMS_BUCKETS,
  RESIDENTIAL_OFFER_TERMS_VERSION,
  buildResidentialOfferTermsSnapshot,
  flattenResidentialOfferTerms,
  mergeResidentialOfferTermsIntoConditions,
} from '../src/core/offers/residentialOfferTerms.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:residential-offer-link-phase3'],
  'node scripts/residential-offer-link-phase3.test.mjs',
  'package.json should expose the Phase 3 buyer offer link contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-chapter1']?.includes('test:residential-offer-link-phase3'),
  'Chapter 1 verification should include the Phase 3 buyer offer link contract.',
)

assert.equal(RESIDENTIAL_OFFER_TERMS_VERSION, 'residential_offer_terms_phase3_v1')
assert.ok(RESIDENTIAL_OFFER_TERMS_BUCKETS.includes('otp_route'))

const resaleSubmission = {
  fullName: 'Route Buyer',
  email: 'route@example.test',
  phone: '0820000000',
  idNumber: '8001015009087',
  purchaserType: 'individual',
  offerAmount: '2500000',
  depositAmount: '250000',
  financeType: 'bond',
  bondAmount: '2250000',
  depositDueDate: '2026-08-07',
  bondApprovalDeadline: '2026-08-30',
  guaranteeDeliveryDeadline: '2026-09-10',
  subjectToSale: true,
  subjectSaleProperty: '12 Old Street, Johannesburg',
  subjectSaleMinimumPrice: '2100000',
  subjectSaleFulfilmentDate: '2026-09-20',
  occupationDate: '2026-10-01',
  occupationalRent: true,
  occupationalRentAmount: '18000',
  includedFixtures: 'Curtains and alarm system',
  suspensiveConditions: 'Subject to the purchaser receiving written HOA consent.',
  specialConditions: 'Seller to repaint before occupation.',
}

const resaleSnapshot = buildResidentialOfferTermsSnapshot(resaleSubmission, {
  source: 'phase3_test',
  captureMethod: 'buyer_self_service',
  capturedAt: '2026-08-02T10:00:00.000Z',
  sourceContext: {
    invite: { otpDocumentVariant: 'normal_sale' },
    listing: { propertyType: 'House' },
  },
})
assert.equal(resaleSnapshot.otpDocumentVariant, 'resale_existing_property')
assert.equal(resaleSnapshot.finance.depositDueDate, '2026-08-07')
assert.equal(resaleSnapshot.finance.bondApprovalDeadline, '2026-08-30')
assert.equal(resaleSnapshot.finance.guaranteeDeliveryDeadline, '2026-09-10')
assert.equal(resaleSnapshot.terms.subjectSaleMinimumPrice, 2100000)
assert.equal(resaleSnapshot.terms.occupationalRentAmount, 18000)
assert.deepEqual(
  resaleSnapshot.conditionRequests.structuredConditions.map((condition) => condition.conditionType),
  ['bond_approval', 'subject_to_sale', 'guarantee_delivery', 'other_suspensive_condition'],
)
assert.ok(resaleSnapshot.conditionRequests.reviewFields.includes('subjectToSale'))
assert.equal(resaleSnapshot.readiness.readyForOtpGeneration, false)

const flatResale = flattenResidentialOfferTerms(resaleSnapshot)
assert.equal(flatResale.otpDocumentVariant, 'resale_existing_property')
assert.equal(flatResale.subjectSaleFulfilmentDate, '2026-09-20')
assert.equal(flatResale.guaranteeDeliveryDeadline, '2026-09-10')
assert.equal(flatResale.structuredSuspensiveConditions.length, 4)

const mergedDevelopment = mergeResidentialOfferTermsIntoConditions(
  { agentName: 'Agent One' },
  {
    fullName: 'Development Buyer',
    email: 'dev@example.test',
    phone: '0820000001',
    idNumber: '9001015009087',
    offerAmount: '1800000',
    depositAmount: '50000',
    financeType: 'bond',
    bondAmount: '1750000',
    acknowledgeDevelopmentRules: true,
    acknowledgeNhbrcWarranty: true,
    acknowledgeBodyCorporateRules: true,
    acknowledgeUtilityConnectionCharges: true,
  },
  {
    sourceContext: {
      listing: { developmentId: 'dev-junoah', transactionType: 'development_sale' },
    },
    capturedAt: '2026-08-02T11:00:00.000Z',
  },
)
assert.equal(mergedDevelopment.agentName, 'Agent One')
assert.equal(mergedDevelopment.otpDocumentVariant, 'new_development')
assert.equal(mergedDevelopment.residentialOfferTerms.otpDocumentVariant, 'new_development')
assert.equal(mergedDevelopment.residentialOfferTerms.acknowledgements.nhbrcWarranty, true)

const approvedPatch = buildResidentialOfferConditionReviewPatch({
  offer: {
    offerAmount: 2500000,
    financeType: 'bond',
    conditions: mergeResidentialOfferTermsIntoConditions({}, resaleSubmission, {
      sourceContext: { invite: { otpDocumentVariant: 'resale_existing_property' } },
      capturedAt: '2026-08-02T12:00:00.000Z',
    }),
  },
  decision: 'approve',
  revisedConditions: {
    specialConditions: 'The Seller shall repaint the interior before occupation.',
    subjectSaleTimeline: 'The Purchaser must sell 12 Old Street by 20 September 2026.',
  },
  actor: { id: 'agent-1', name: 'Agent One', email: 'agent@example.test' },
  now: '2026-08-02T13:00:00.000Z',
})
assert.equal(approvedPatch.conditions_json.otpDocumentVariant, 'resale_existing_property')
assert.equal(approvedPatch.conditions_json.guaranteeDeliveryDeadline, '2026-09-10')
assert.equal(approvedPatch.conditions_json.structuredSuspensiveConditions.length, 4)
assert.equal(approvedPatch.conditions_json.otpPreGenerationReview.status, 'ready_to_generate_otp')

assert.equal(resolveOtpDocumentVariant({ sourceContext: { listing: { developmentId: 'dev-1' } } }), 'new_development')

const buyerOfferPage = await readFile(new URL('../src/pages/BuyerOfferSubmission.jsx', import.meta.url), 'utf8')
for (const token of [
  'otpDocumentVariant',
  'Guarantee Delivery Deadline',
  'Bond Approval Deadline',
  'Cash Proof Deadline',
  'Subject to sale of another property',
  'acknowledgeNhbrcWarranty',
]) {
  assert.ok(buyerOfferPage.includes(token), `BuyerOfferSubmission should include ${token}.`)
}

const listingOffersService = await readFile(new URL('../src/lib/listingOffersService.js', import.meta.url), 'utf8')
assert.match(listingOffersService, /otpDocumentVariant/)
assert.match(listingOffersService, /sourceContext: \{ invite, listing \}/)

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const pageModule = await server.ssrLoadModule('/src/pages/BuyerOfferSubmission.jsx')
  assert.equal(typeof pageModule.default, 'function')
} finally {
  await server.close()
}

console.log('Residential offer link Phase 3 contract passed.')
