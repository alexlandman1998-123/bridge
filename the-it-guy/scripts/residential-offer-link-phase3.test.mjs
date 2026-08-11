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

const buyerVerificationPage = await readFile(new URL('../src/pages/BuyerOfferSubmission.jsx', import.meta.url), 'utf8')
for (const token of [
  'otpDocumentVariant',
  "['landing', 'onboarding', 'review', 'complete']",
  'Start Verification',
  'Buyer Verification',
  'BuyerVerificationSubmission',
  'BUYER_VERIFICATION_STAGES',
  'readBuyerVerificationDraft',
  'Expected Purchase Amount',
  'Bond Support',
  "goToStage('onboarding')",
  'handleSubmitVerification',
  'submitCanonicalBuyerVerification',
  'submitBuyerVerification',
  'canSubmitCanonicalVerification',
]) {
  assert.ok(buyerVerificationPage.includes(token), `buyer verification page should include ${token}.`)
}
for (const blockedToken of [
  'Enter the expected purchase amount before continuing.',
  'Enter the expected purchase amount before submitting.',
  'Choose whether you will manage your bond yourself or need help with your bond.',
  "key: 'signature'",
  'Final Check',
  'handleSubmitOffer',
  'submitCanonicalBuyerOffer({ token, submission })',
  'submitBuyerOffer({ token',
  'buyer_offer_submitted_agent',
  'canSubmitCanonicalOffer',
  'BUYER_OFFER_STAGES',
  'readBuyerOfferDraft',
]) {
  assert.equal(buyerVerificationPage.includes(blockedToken), false, `buyer verification page should not include ${blockedToken}.`)
}

const appShell = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
assert.match(appShell, /path="\/client\/buyer-verification\/:token"/, 'buyer verification should have the canonical public route')
assert.match(appShell, /path="\/client\/offer\/:token"/, 'legacy buyer offer links should remain routable')
assert.match(appShell, /BuyerVerificationSubmission/, 'public buyer route component should use verification naming')

const listingOffersService = await readFile(new URL('../src/lib/listingOffersService.js', import.meta.url), 'utf8')
assert.match(listingOffersService, /otpDocumentVariant/)
assert.match(listingOffersService, /sourceContext: \{ invite, listing \}/)
assert.match(listingOffersService, /export function buildBuyerVerificationInviteLink/)
assert.match(listingOffersService, /\/client\/buyer-verification\/\$\{token\}/)
assert.match(listingOffersService, /export function buildOfferInviteLink[\s\S]*return getInviteLink\(token, baseUrl\)/, 'legacy invite helper should remain as a compatibility alias')
assert.match(listingOffersService, /export async function submitBuyerVerification/)
assert.match(listingOffersService, /buyerVerificationSubmittedAt/)
assert.equal(listingOffersService.includes('Buyer details and offer amount are required.'), false)
const submitBuyerVerificationSource = listingOffersService.slice(
  listingOffersService.indexOf('export async function submitBuyerVerification'),
  listingOffersService.indexOf('export async function submitBuyerOffer'),
)
assert.equal(
  submitBuyerVerificationSource.includes('writeOfferRecords'),
  false,
  'Verification-only submit must not write offer records.',
)
assert.equal(
  submitBuyerVerificationSource.includes('updateCanonicalOfferStatus'),
  false,
  'Verification-only submit must not advance canonical offer status.',
)

const buyerLifecycleService = await readFile(new URL('../src/lib/buyerLifecycleService.js', import.meta.url), 'utf8')
assert.match(buyerLifecycleService, /export async function submitCanonicalBuyerVerification/)
assert.match(buyerLifecycleService, /buyerVerificationSubmittedAt/)
const submitCanonicalBuyerVerificationSource = buyerLifecycleService.slice(
  buyerLifecycleService.indexOf('export async function submitCanonicalBuyerVerification'),
  buyerLifecycleService.indexOf('function statusToEvent'),
)
assert.equal(
  submitCanonicalBuyerVerificationSource.includes('updateCanonicalOfferStatus'),
  false,
  'Canonical verification submit must not use offer lifecycle status updates.',
)

const buyerLinkEmailHandler = await readFile(new URL('../../supabase/functions/send-email/handlers/buyerOfferLink.ts', import.meta.url), 'utf8')
for (const token of [
  'buyer_verification_link',
  'Your secure buyer verification link',
  'Buyer Verification Summary',
  'Open Buyer Verification',
  'Buyer Verification Ready',
  'Secure Buyer Verification',
]) {
  assert.ok(buyerLinkEmailHandler.includes(token), `Buyer link email should include ${token}.`)
}
for (const blockedToken of [
  'Offer Link Ready',
  'Offer Link Summary',
  'Open Secure Offer Link',
  'start an offer',
  'submitting an offer',
  'secure offer link for',
]) {
  assert.equal(buyerLinkEmailHandler.includes(blockedToken), false, `Buyer link email should not include ${blockedToken}.`)
}

const agentListingDetailSource = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const agentLeadsSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
const agencyPipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
assert.match(agentListingDetailSource, /type: 'buyer_verification_link'/)
assert.match(agentListingDetailSource, /communicationType: 'buyer_verification_link'/)
assert.match(agentLeadsSource, /type: 'buyer_verification_link'/)
assert.match(agentLeadsSource, /\['buyer_verification_link', 'buyer_offer_link'\]/)
assert.match(agencyPipelineSource, /type: 'buyer_verification_link'/)
assert.match(agencyPipelineSource, /buyerVerificationSubmittedAt/)
assert.match(agencyPipelineSource, /selectedLeadOfferBuyerVerification\.formData/)

const transactionHandoffHealthSource = await readFile(new URL('../src/core/transactions/transactionHandoffHealth.js', import.meta.url), 'utf8')
assert.match(transactionHandoffHealthSource, /getOfferBuyerVerificationArtifacts/)
assert.match(transactionHandoffHealthSource, /hasOfferBuyerVerificationSubmitted/)

const buyerProcessDefinitionSource = await readFile(new URL('../src/services/buyerProcessDefinitionService.js', import.meta.url), 'utf8')
assert.match(buyerProcessDefinitionSource, /buyer_verification_link/)
assert.match(buyerProcessDefinitionSource, /buyer_verification_link_sent/)

const notificationAutomationSource = await readFile(new URL('../src/services/notificationAutomationContract.js', import.meta.url), 'utf8')
assert.match(notificationAutomationSource, /'buyer_verification_link'/)

const deliveryCompatibilityMigration = await readFile(new URL('../../supabase/migrations/202608100002_buyer_verification_link_delivery_compat.sql', import.meta.url), 'utf8')
assert.match(deliveryCompatibilityMigration, /buyer_verification_link/)
assert.match(deliveryCompatibilityMigration, /communication_type in \('buyer_verification_link', 'buyer_offer_link', 'offer_link', 'post_viewing_offer_link'\)/)

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const pageModule = await server.ssrLoadModule('/src/pages/BuyerOfferSubmission.jsx')
  assert.equal(typeof pageModule.default, 'function')
} finally {
  await server.close()
}

console.log('Residential offer link Phase 3 contract passed.')
