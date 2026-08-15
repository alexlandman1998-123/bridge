import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import {
  RESIDENTIAL_OFFER_LIFECYCLE_VERSION,
  RESIDENTIAL_OFFER_STAGE_KEYS,
  canTransitionResidentialOfferStage,
  getResidentialOfferAllowedNextStages,
  getResidentialOfferStageLabel,
  normalizeResidentialOfferStageKey,
  resolveOfferOnboardingLinkExperience,
} from '../src/core/offers/residentialOfferLifecycle.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:residential-offer-lifecycle-phase1a'],
  'node scripts/residential-offer-lifecycle-phase1a.test.mjs',
  'package.json should expose the residential offer lifecycle Phase 1A contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-chapter1']?.includes('test:residential-offer-lifecycle-phase1a'),
  'Chapter 1 verification should include the Phase 1A lifecycle contract.',
)

assert.equal(RESIDENTIAL_OFFER_LIFECYCLE_VERSION, 'residential_offer_lifecycle_phase1a_v1')
assert.equal(normalizeResidentialOfferStageKey('New Lead'), RESIDENTIAL_OFFER_STAGE_KEYS.lead)
assert.equal(normalizeResidentialOfferStageKey('Offer Link Sent'), RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent)
assert.equal(normalizeResidentialOfferStageKey('Buyer Onboarding Sent'), RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent)
assert.equal(normalizeResidentialOfferStageKey('Offer + Onboarding Link Sent'), RESIDENTIAL_OFFER_STAGE_KEYS.offerOnboardingLinkSent)
assert.equal(normalizeResidentialOfferStageKey('Agent Conditions Review'), RESIDENTIAL_OFFER_STAGE_KEYS.agentReviewRequired)
assert.equal(normalizeResidentialOfferStageKey('Offer Accepted'), RESIDENTIAL_OFFER_STAGE_KEYS.signedByAllParties)
assert.equal(getResidentialOfferStageLabel('ready_to_generate_otp'), 'Ready to Generate OTP')

assert.ok(canTransitionResidentialOfferStage('Viewing Completed', 'Offer + Onboarding Link Sent'))
assert.ok(canTransitionResidentialOfferStage('Offer + Onboarding Link Sent', 'Offer Submitted'))
assert.ok(canTransitionResidentialOfferStage('Offer Submitted', 'Agent Review Required'))
assert.ok(canTransitionResidentialOfferStage('Agent Review Required', 'Ready to Generate OTP'))
assert.ok(canTransitionResidentialOfferStage('Ready to Generate OTP', 'OTP Generated'))
assert.ok(!canTransitionResidentialOfferStage('Offer Submitted', 'Transaction Live'))
assert.deepEqual(
  getResidentialOfferAllowedNextStages('Signed by All Parties'),
  [RESIDENTIAL_OFFER_STAGE_KEYS.transactionLive],
)

const experience = resolveOfferOnboardingLinkExperience()
assert.equal(experience.label, 'Offer + Onboarding Link')
assert.equal(experience.buyerFacingTitle, 'Make an Offer')
assert.deepEqual(experience.dataBuckets, ['otp_route', 'buyer_onboarding', 'residential_offer_terms', 'condition_requests'])

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const workflow = await server.ssrLoadModule('/src/lib/workflowEngine.js')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Offer Link Sent'), 'Transaction Setup')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Onboarding Sent'), 'Transaction Setup')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Ready for OTP generation'), 'Offer')
  assert.equal(workflow.normalizeBuyerWorkflowStage('Offer Accepted'), 'Offer')
  assert.ok(workflow.isBuyerWorkflowStage('Offer + Onboarding Link Sent'))
  assert.ok(!workflow.BUYER_WORKFLOW_STAGES.includes('Ready to Generate OTP'))

  const { resolveOfferLinkDeliveryPlan } = await server.ssrLoadModule('/src/lib/offerLinkDeliveryPlan.js')
  const plan = resolveOfferLinkDeliveryPlan({ email: 'buyer@example.test' })
  assert.equal(plan.experience.label, 'Offer + Onboarding Link')
  assert.equal(plan.experience.dataBuckets.includes('residential_offer_terms'), true)
} finally {
  await server.close()
}

const buyerOfferPage = await readFile(new URL('../src/pages/BuyerOfferSubmission.jsx', import.meta.url), 'utf8')
const postViewingPortal = await readFile(new URL('../src/pages/PostViewingOfferPortal.jsx', import.meta.url), 'utf8')
const agencyPipelinePage = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
assert.match(buyerOfferPage, /One guided buyer onboarding flow\./)
assert.match(buyerOfferPage, /Buyer details, finance route, OTP transaction next/)
assert.match(buyerOfferPage, /OTP transaction/)
assert.doesNotMatch(buyerOfferPage, /OTP Generated/)
assert.doesNotMatch(buyerOfferPage, /before OTP generation/)
assert.match(postViewingPortal, /Offer \+ Onboarding link/)
assert.match(postViewingPortal, /manual signed OTP upload/)
assert.doesNotMatch(postViewingPortal, /before OTP generation/)
assert.match(agencyPipelinePage, /Send Buyer Onboarding Link/)
assert.match(agencyPipelinePage, /successPrefix: 'Viewing completed and '/)
assert.doesNotMatch(agencyPipelinePage, /Create or accept an offer first, then Arch9 can create the transaction and send buyer onboarding\./)

console.log('Residential offer lifecycle Phase 1A contract passed.')
