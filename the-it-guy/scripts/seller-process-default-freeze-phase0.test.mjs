import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildSellerJourney,
  SELLER_JOURNEY_STAGES,
} from '../src/services/sellerJourneyService.js'
import {
  canActivateListing,
  canCreateListing,
  getNextSellerAction,
  getSellerReadiness,
} from '../src/services/sellerReadinessService.js'
import {
  canTransitionPrivateListing,
  getPrivateListingTransitionSideEffects,
} from '../src/lib/privateListingLifecycle.js'
import {
  getRequiredSellerActions,
  getRequiredSellerDocuments,
} from '../src/lib/sellerDocumentRequirementEngine.js'

const appRoot = resolve(import.meta.dirname, '..')
const phase0Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase0-default-freeze.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

const expectedDefaultStageKeys = [
  'new_lead',
  'contacted',
  'seller_onboarding_sent',
  'seller_onboarding_submitted',
  'mandate_sent',
  'mandate_signed',
  'listing_created',
  'listing_live',
  'documents_submitted',
]

const kingstonsOnlyKeys = [
  'valuation_appointment',
  'valuation_presentation',
  'valuation_document',
  'valuation_presented',
  'defects_form_signed',
  'fica_pack_signed',
  'seller_pack_complete',
]

const canonicalMandatePacket = {
  id: 'packet-default-freeze',
  state: 'completed',
  version: {
    id: 'version-default-freeze',
    final_signed_file_path: 'document-packets/packet-default-freeze/final.pdf',
  },
}

const baseLead = {
  leadId: 'seller-default-freeze',
  leadCategory: 'seller',
  sellerPhone: '+27820000000',
  sellerEmail: 'seller@example.test',
  sellerPropertyAddress: '12 Oak Road',
  createdAt: '2026-08-06T08:00:00.000Z',
}

function assertNoKingstonsKeys(values, label) {
  const serialised = JSON.stringify(values)
  for (const key of kingstonsOnlyKeys) {
    assert.equal(serialised.includes(key), false, `${label} must not include ${key}`)
  }
}

function assertStepStates(journey, currentKey, completedKeys = []) {
  assert.deepEqual(journey.steps.map((step) => step.key), expectedDefaultStageKeys)
  for (const key of expectedDefaultStageKeys) {
    const step = journey.steps.find((item) => item.key === key)
    assert.ok(step, `expected step ${key}`)
    if (key === currentKey) assert.equal(step.state, 'current', `${key} should be current`)
    else if (completedKeys.includes(key)) assert.equal(step.state, 'completed', `${key} should be completed`)
    else assert.equal(step.state, 'upcoming', `${key} should be upcoming`)
  }
}

{
  assert.deepEqual(SELLER_JOURNEY_STAGES.map((stage) => stage.key), expectedDefaultStageKeys)
  assertNoKingstonsKeys(SELLER_JOURNEY_STAGES, 'default journey stages')
}

{
  const journey = buildSellerJourney({
    lead: baseLead,
    appointments: [
      { appointmentType: 'seller_valuation', status: 'completed', completedAt: '2026-08-06T10:00:00.000Z' },
      { appointmentType: 'valuation_presentation', status: 'completed', completedAt: '2026-08-06T11:00:00.000Z' },
    ],
  })
  assert.equal(journey.stage.key, 'new_lead')
  assert.equal(journey.steps.some((step) => step.key.includes('valuation')), false)
  assertNoKingstonsKeys(journey, 'default journey with valuation-like appointments')
}

{
  const journey = buildSellerJourney({
    lead: {
      ...baseLead,
      mandatePacketId: canonicalMandatePacket.id,
      sellerOnboardingStatus: 'completed',
    },
    mandatePacketStatus: {
      packet: { id: canonicalMandatePacket.id, status: 'completed' },
      signingSummary: { allSignersSigned: true },
    },
  })
  assert.equal(journey.stage.key, 'mandate_signed')
  assert.equal(journey.mandateStatus, 'signed')
  assertStepStates(journey, 'mandate_signed', [
    'new_lead',
    'contacted',
    'seller_onboarding_sent',
    'seller_onboarding_submitted',
    'mandate_sent',
  ])

  const readiness = getSellerReadiness({ lead: baseLead, journey })
  assert.equal(getNextSellerAction({ lead: baseLead, journey }).id, 'create_listing')
  assert.equal(readiness.nextAction.id, 'create_listing')
  assert.equal(canCreateListing({ lead: baseLead, journey }), false)
  assert.equal(readiness.blockers.some((item) => item.id === 'required_documents_missing'), true)
  assertNoKingstonsKeys(readiness, 'default mandate-signed readiness')
}

{
  const listingCreatedJourney = buildSellerJourney({
    lead: {
      ...baseLead,
      listingId: 'listing-default-freeze',
      sellerOnboardingStatus: 'completed',
    },
    listing: {
      id: 'listing-default-freeze',
      sellerLeadId: baseLead.leadId,
      listingStatus: 'mandate_signed',
      mandateStatus: 'signed',
      mandatePacket: canonicalMandatePacket,
      title: '12 Oak Road',
      addressLine1: '12 Oak Road',
      askingPrice: 2500000,
      images: [{ id: 'cover', url: 'https://example.test/cover.jpg' }],
    },
  })
  assert.equal(listingCreatedJourney.stage.key, 'listing_created')
  assert.equal(getNextSellerAction({ lead: baseLead, listing: listingCreatedJourney.listing, journey: listingCreatedJourney }).id, 'activate_listing')
  assert.equal(canActivateListing({ lead: baseLead, listing: listingCreatedJourney.listing, journey: listingCreatedJourney }), false)
  const readiness = getSellerReadiness({ lead: baseLead, listing: listingCreatedJourney.listing, journey: listingCreatedJourney })
  assert.equal(readiness.blockers.some((item) => item.id === 'listing_description_incomplete'), true)
  assert.equal(readiness.blockers.some((item) => item.id === 'listing_documents_incomplete'), true)
}

{
  const sideEffects = getPrivateListingTransitionSideEffects('mandate_signed')
  assert.equal(sideEffects.listingStatus, 'mandate_signed')
  assert.equal(sideEffects.mandateStatus, 'signed')
  assert.equal(sideEffects.listingVisibility, 'active_market')
  assert.equal(sideEffects.isActive, true)
  assert.equal(sideEffects.activityType, 'mandate_signed')
}

{
  const manualOnly = canTransitionPrivateListing({
    listingStatus: 'mandate_sent',
    mandateStatus: 'signed_external_pending_upload',
    documents: [{ document_type: 'manual_mandate_evidence', status: 'uploaded' }],
  }, 'mandate_signed', { allowOverride: true })
  assert.equal(manualOnly.allowed, true)
  assert.deepEqual(manualOnly.nonOverridableBlockers, [])

  const manualUploaded = canTransitionPrivateListing({
    listingStatus: 'mandate_sent',
    mandateStatus: 'signed_uploaded',
    documents: [{ document_type: 'signed_mandate', status: 'uploaded', storage_path: 'uploads/signed.pdf' }],
  }, 'mandate_signed', { allowOverride: true })
  assert.equal(manualUploaded.allowed, true)

  const canonical = canTransitionPrivateListing({
    listingStatus: 'mandate_sent',
    mandateStatus: 'sent',
    mandatePacket: canonicalMandatePacket,
  }, 'mandate_signed')
  assert.equal(canonical.allowed, true)
}

{
  assert.deepEqual(getRequiredSellerActions({ lifecycleStatus: 'mandate_signed' }), ['activate_listing'])
  assertNoKingstonsKeys(getRequiredSellerDocuments({ lifecycleStatus: 'mandate_signed', sellerType: 'individual' }), 'default seller required documents')
}

{
  assert.match(phase0Doc, /Current Default Seller Spine/)
  assert.match(phase0Doc, /Mandate-Signed Touchpoint Inventory/)
  assert.match(phase0Doc, /keep default profile output unchanged/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-default-freeze-phase0'],
    'node scripts/seller-process-default-freeze-phase0.test.mjs',
  )
}

console.log('seller process default freeze Phase 0 contract passed')
