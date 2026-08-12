import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    CLIENT_COMMUNICATION_CANONICAL_DECISION,
    CLIENT_COMMUNICATION_EMAIL_POLICY,
    CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS,
    CLIENT_COMMUNICATION_TRIGGER_OWNER,
    CLIENT_COMMUNICATION_TRIGGER_SOURCE,
    getClientCommunicationCoverageSummary,
    listClientCommunicationJourney,
    resolveClientCommunicationAutomationState,
  } = await server.ssrLoadModule('/src/services/clientCommunicationJourneyCatalog.js')

  const journey = listClientCommunicationJourney()
  const keys = new Set(journey.map((entry) => entry.key))

  assert.ok(journey.length >= 20, 'catalog should cover the expected buyer/seller journey surface')
  assert.ok(keys.has('buyer_onboarding_invitation'), 'buyer onboarding must be represented')
  assert.ok(keys.has('seller_onboarding_invitation'), 'seller onboarding must be represented')
  assert.ok(keys.has('offer_accepted_buyer'), 'buyer offer accepted milestone must be represented')
  assert.ok(keys.has('proof_of_funds_required'), 'cash proof-of-funds branch must be represented')
  assert.ok(keys.has('hybrid_finance_required'), 'hybrid finance branch must be represented')
  assert.ok(keys.has('seller_transfer_attorney_intro'), 'seller attorney intro must be represented')

  for (const entry of journey) {
    assert.ok(entry.emailPolicy, `${entry.key} should declare an email policy`)
    assert.ok(entry.triggerSource, `${entry.key} should declare a trigger source`)
    assert.ok(entry.ctaDestination, `${entry.key} should declare a CTA destination or activity-only destination`)
    assert.ok(entry.duplicateRisk, `${entry.key} should document duplicate risk`)
    assert.ok(entry.nextAction, `${entry.key} should document the Phase 1 next action`)
    assert.ok(Array.isArray(entry.sourceFiles), `${entry.key} should expose source files`)
    assert.ok(entry.canonicalDecision, `${entry.key} should declare the canonical decision`)
    assert.ok(entry.triggerOwner, `${entry.key} should declare the trigger owner`)
    assert.ok(entry.canonicalEventKey, `${entry.key} should declare the canonical event key`)
    assert.ok(entry.implementationSlice, `${entry.key} should declare the implementation slice`)
  }

  const summary = getClientCommunicationCoverageSummary(journey)
  assert.equal(summary.total, journey.length)
  assert.ok(summary.byStatus[CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.EXISTING] >= 4)
  assert.ok(summary.byStatus[CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.PARTIAL] >= 10)
  assert.ok(summary.byStatus[CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.MISSING] >= 4)
  assert.ok(summary.byCategory.action_required >= 1)
  assert.ok(summary.byAudience.buyer >= 1)

  const knownDirectHandlers = new Set(['bond_originator_buyer_intro', 'seller_offer_review'])
  const existingRows = journey.filter((entry) => entry.status === CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.EXISTING)
  for (const entry of existingRows) {
    const state = resolveClientCommunicationAutomationState(entry)
    assert.ok(
      state.hasAutomationDefinition || knownDirectHandlers.has(entry.automationKey),
      `${entry.key} should resolve to an existing automation definition or known direct email handler`,
    )
  }

  const buyerRows = listClientCommunicationJourney({ audience: 'buyer' })
  assert.ok(buyerRows.every((entry) => entry.audience.includes('buyer')))

  const missingRows = listClientCommunicationJourney({ status: CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.MISSING })
  assert.ok(missingRows.every((entry) => entry.status === CLIENT_COMMUNICATION_IMPLEMENTATION_STATUS.MISSING))
  assert.ok(missingRows.some((entry) => entry.triggerSource === CLIENT_COMMUNICATION_TRIGGER_SOURCE.NOT_WIRED))

  const activityOnly = journey.find((entry) => entry.key === 'document_uploaded_internal')
  assert.equal(activityOnly.emailPolicy, CLIENT_COMMUNICATION_EMAIL_POLICY.DO_NOT_EMAIL)
  assert.equal(activityOnly.canonicalDecision, CLIENT_COMMUNICATION_CANONICAL_DECISION.ACTIVITY_ONLY)

  const phaseTwoSlice = journey.filter((entry) => entry.implementationSlice === 'offer_acceptance_finance_transfer')
  assert.ok(phaseTwoSlice.length >= 10, 'recommended first implementation slice should cover offer, finance, and transfer handoff')
  assert.ok(
    phaseTwoSlice.every((entry) => entry.triggerOwner !== CLIENT_COMMUNICATION_TRIGGER_OWNER.TO_BE_CONFIRMED),
    'recommended first slice should have explicit trigger owners',
  )

  const listingLive = journey.find((entry) => entry.key === 'listing_live')
  assert.equal(listingLive.canonicalDecision, CLIENT_COMMUNICATION_CANONICAL_DECISION.BLOCKED_PENDING_TRIGGER)
  assert.equal(listingLive.triggerOwner, CLIENT_COMMUNICATION_TRIGGER_OWNER.LISTING_WORKFLOW)

  const bondDocumentsRequired = journey.find((entry) => entry.key === 'bond_documents_required')
  assert.equal(bondDocumentsRequired.canonicalDecision, CLIENT_COMMUNICATION_CANONICAL_DECISION.MERGE_INTO)
  assert.equal(bondDocumentsRequired.mergeTarget, 'finance_requirements_required')

  console.log('client communication journey catalog tests passed')
} finally {
  await server.close()
}
