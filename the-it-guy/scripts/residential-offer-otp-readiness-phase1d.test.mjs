import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
import { resolveOtpReadiness } from '../src/core/documents/otpReadiness.js'
import { buildResidentialOfferConditionReviewPatch } from '../src/core/offers/residentialOfferConditionReview.js'
import { mergeResidentialOfferTermsIntoConditions } from '../src/core/offers/residentialOfferTerms.js'
import { resolveTransactionWorkflowEvidence } from '../server/services/workflowEvidenceResolver.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:residential-offer-otp-readiness-phase1d'],
  'node scripts/residential-offer-otp-readiness-phase1d.test.mjs',
  'package.json should expose the Phase 1D OTP readiness contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-chapter1']?.includes('test:residential-offer-otp-readiness-phase1d'),
  'Chapter 1 verification should include the Phase 1D OTP readiness contract.',
)

function buildReadiness(offer, overrides = {}) {
  return resolveOtpReadiness({
    lead: {
      leadId: 'lead-otp-phase1d',
      buyerEntityType: 'individual',
      buyerMaritalStatus: 'single',
      financeType: 'bond',
    },
    contact: {
      firstName: 'Fallback',
      lastName: 'Buyer',
      email: 'fallback@example.test',
      phone: '0820000001',
    },
    property: {
      id: 'listing-phase1d',
      title: '12 Oak Avenue',
      propertyType: 'House',
      price: 'R 2 500 000',
      sellerEntityType: 'company',
    },
    agent: {
      fullName: 'Agent One',
      email: 'agent@example.test',
    },
    organisation: {
      id: 'org-phase1d',
      name: 'Test Agency',
    },
    offer,
    ...overrides,
    deliveryMode: 'digital_portal',
    deliveryLabel: 'Digital portal',
    requiresDigitalContact: true,
    viewingLabel: 'Viewing completed',
    hasViewingContext: true,
    templateReadiness: {
      ready: true,
      value: 'Published OTP route ready: Residential OTP',
      source: 'legal_scenario_variant',
    },
  })
}

const buyerConditions = mergeResidentialOfferTermsIntoConditions({}, {
  fullName: 'Test Buyer',
  email: 'buyer@example.test',
  phone: '0820000000',
  purchaserType: 'individual',
  offerAmount: '2500000',
  depositAmount: '250000',
  financeType: 'bond',
  bondAmount: '2250000',
  subjectToSale: true,
  subjectSaleProperty: '12 Old Street',
  subjectSaleTimeline: '90 days',
  specialConditions: 'House needs to be repainted before occupation.',
  acknowledgeSellerReview: true,
  acknowledgeLegalDisclaimer: true,
  acknowledgeInfoAccuracy: true,
}, {
  source: 'buyer_offer_link',
  capturedAt: '2026-07-29T10:00:00.000Z',
})

const submittedOffer = {
  id: 'offer-phase1d',
  status: 'submitted',
  offerAmount: 2500000,
  financeType: 'bond',
  conditions: buyerConditions,
}

const reviewBlockedReadiness = buildReadiness(submittedOffer)
assert.equal(reviewBlockedReadiness.canGenerate, false)
assert.equal(reviewBlockedReadiness.rows.find((row) => row.key === 'offer_status')?.ready, true)
assert.equal(reviewBlockedReadiness.rows.find((row) => row.key === 'offer_terms')?.ready, true)
assert.equal(reviewBlockedReadiness.rows.find((row) => row.key === 'condition_review')?.ready, false)
assert.equal(reviewBlockedReadiness.facts.offerSubmitted, true)
assert.equal(reviewBlockedReadiness.facts.conditionReviewReady, false)
assert.ok(
  reviewBlockedReadiness.blockers.includes('Agent must approve or rewrite buyer wording before OTP generation'),
  'Buyer free-text condition wording should block OTP generation until agent review is complete.',
)

const onboardingCompletedReadiness = buildReadiness(submittedOffer, {
  transaction: {
    onboarding_status: 'awaiting_signed_otp',
    onboarding_completed_at: '2026-07-29T10:05:00.000Z',
  },
  onboardingFormData: {
    submitted_at: '2026-07-29T10:05:00.000Z',
  },
})
assert.equal(onboardingCompletedReadiness.canGenerate, true)
assert.equal(onboardingCompletedReadiness.facts.buyerOnboardingComplete, true)
assert.equal(onboardingCompletedReadiness.rows.find((row) => row.key === 'condition_review')?.optional, true)
assert.deepEqual(onboardingCompletedReadiness.blockers, [])
assert.ok(
  onboardingCompletedReadiness.warnings.includes('Buyer wording captured for agent review while generating OTP'),
  'Completed buyer onboarding should let agents generate OTP while reviewing captured buyer wording.',
)

const awaitingSignedOtpEvidence = resolveTransactionWorkflowEvidence({
  transaction: {
    id: 'tx-awaiting-otp',
    onboarding_status: 'awaiting_signed_otp',
    updated_at: '2026-07-29T10:05:00.000Z',
  },
})
assert.equal(
  awaitingSignedOtpEvidence.BUYER_ONBOARDING_COMPLETE.satisfied,
  true,
  'awaiting_signed_otp should satisfy buyer onboarding evidence for OTP workflow actions.',
)

const approvedPatch = buildResidentialOfferConditionReviewPatch({
  offer: submittedOffer,
  decision: 'approve',
  revisedConditions: {
    specialConditions: 'The Seller shall repaint the interior of the dwelling before occupation by the Purchaser.',
    subjectSaleTimeline: 'The Purchaser must sell the property at 12 Old Street within 90 days of acceptance.',
  },
  actor: { id: 'agent-1', name: 'Agent One', email: 'agent@example.test' },
  note: 'Professional wording approved.',
  now: '2026-07-29T11:00:00.000Z',
})

const approvedOffer = {
  ...submittedOffer,
  status: 'agent_review',
  conditions: approvedPatch.conditions_json,
}
const readyReadiness = buildReadiness(approvedOffer)
assert.equal(readyReadiness.canGenerate, true)
assert.equal(readyReadiness.canSendForSignature, true)
assert.equal(readyReadiness.rows.find((row) => row.key === 'offer_status')?.ready, true)
assert.equal(readyReadiness.rows.find((row) => row.key === 'offer_terms')?.ready, true)
assert.equal(readyReadiness.rows.find((row) => row.key === 'condition_review')?.ready, true)
assert.equal(readyReadiness.rows.find((row) => row.key === 'legal_route')?.ready, true)
assert.equal(readyReadiness.rows.find((row) => row.key === 'template_route')?.ready, true)
assert.equal(readyReadiness.facts.conditionReviewStatus, 'ready_to_generate_otp')
assert.equal(readyReadiness.facts.conditionReviewReady, true)
assert.equal(
  readyReadiness.facts.approvedConditionWording.fields.specialConditions,
  'The Seller shall repaint the interior of the dwelling before occupation by the Purchaser.',
)
assert.deepEqual(readyReadiness.blockers, [])

const lifecycleReadyReadiness = buildReadiness({
  ...approvedOffer,
  status: 'ready_to_generate_otp',
})
assert.equal(lifecycleReadyReadiness.canGenerate, true)
assert.equal(lifecycleReadyReadiness.rows.find((row) => row.key === 'offer_status')?.ready, true)

const unsubmittedReadiness = buildReadiness({
  ...approvedOffer,
  status: 'sent_to_buyer',
})
assert.equal(unsubmittedReadiness.canGenerate, false)
assert.equal(unsubmittedReadiness.rows.find((row) => row.key === 'offer_status')?.ready, false)
assert.ok(
  unsubmittedReadiness.blockers.includes('Sent To Buyer'),
  'OTP generation should wait for the combined Offer + Onboarding link to be submitted.',
)

const readinessSource = await readFile(new URL('../src/core/documents/otpReadiness.js', import.meta.url), 'utf8')
const agencyPipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
for (const signal of [
  'resolveResidentialOfferConditionReview',
  "'offer_status'",
  "'offer_terms'",
  "'condition_review'",
  'approvedConditionWording',
]) {
  assert.ok(readinessSource.includes(signal), `otpReadiness should keep ${signal}.`)
}
for (const signal of [
  'selectedLeadAcceptedOffer || selectedLeadLifecycleDiagnosticOffer',
  'selectedLeadAcceptedOffer',
  'selectedLeadLifecycleDiagnosticOffer',
]) {
  assert.ok(agencyPipelineSource.includes(signal), `AgencyPipelinePage should feed offer evidence into OTP readiness: ${signal}.`)
}

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const readinessModule = await server.ssrLoadModule('/src/core/documents/otpReadiness.js')
  assert.equal(typeof readinessModule.resolveOtpReadiness, 'function')
} finally {
  await server.close()
}

console.log('Residential offer OTP readiness Phase 1D contract passed.')
