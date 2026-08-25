import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
  resolveSellerProcessProfileForOrganisation,
} from '../src/services/sellerProcessProfileService.js'
import {
  SELLER_JOURNEY_STAGES,
  buildSellerJourney,
  getSellerJourneyActions,
} from '../src/services/sellerJourneyService.js'
import {
  getNextSellerAction,
  getSellerReadiness,
} from '../src/services/sellerReadinessService.js'
import {
  buildSellerProcessProjectionBundle,
} from '../src/services/sellerProcessProjectionService.js'
import {
  buildSellerProcessWorkspacePanelModel,
} from '../src/services/sellerProcessWorkspacePanelService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

const defaultStageKeys = [
  'new_lead',
  'contacted',
  'seller_onboarding_sent',
  'seller_onboarding_submitted',
  'mandate_signed',
  'listing_created',
  'listing_live',
  'documents_submitted',
]

const kingstonsOnlyTokens = [
  'valuation_appointment_scheduled',
  'formal_valuation_completed',
  'valuation_presentation_scheduled',
  'seller_pack_signed',
  'seller_pack_readiness_complete',
  'defects_form_signed',
  'fica_pack_signed',
  'signed_defect_form',
  'signed_fica_form',
  'schedule_valuation_appointment',
  'upload_valuation_document',
  'schedule_valuation_presentation',
  'complete_seller_pack',
]

const baseLead = {
  id: 'global-smoke-lead-1',
  leadId: 'global-smoke-lead-1',
  leadCategory: 'seller',
  category: 'seller',
  stage: 'Contacted',
  status: 'Active',
  sellerEmail: 'seller@example.test',
  sellerPhone: '+27820000000',
  sellerPropertyAddress: '14 Global Road',
  assignedAgentEmail: 'kingstons.training@arch9.test',
}

const submittedLead = {
  ...baseLead,
  sellerOnboardingToken: 'global-onboarding-token',
  sellerOnboardingStatus: 'completed',
  sellerOnboardingSubmittedAt: '2026-08-09T09:00:00.000Z',
}

const draftMandatePacketStatus = {
  packet: {
    id: 'global-mandate-packet-draft',
    status: 'generated',
  },
}

const sentMandatePacketStatus = {
  packet: {
    id: 'global-mandate-packet-sent',
    status: 'sent',
    sentAt: '2026-08-09T10:00:00.000Z',
  },
  signingSummary: {
    signers: [
      { role: 'seller', status: 'sent', sentAt: '2026-08-09T10:00:00.000Z' },
    ],
  },
}

const signedMandatePacketStatus = {
  packet: {
    id: 'global-mandate-packet-signed',
    status: 'completed',
    signedAt: '2026-08-09T11:00:00.000Z',
  },
  signingSummary: {
    allSignersSigned: true,
    signers: [
      { role: 'seller', status: 'signed', signedAt: '2026-08-09T11:00:00.000Z' },
    ],
  },
}

const draftListing = {
  id: 'global-listing-1',
  sellerLeadId: 'global-smoke-lead-1',
  status: 'draft',
  propertyAddress: '14 Global Road',
  askingPrice: 1_250_000,
  description: 'Three bedroom family home with a private garden.',
  galleryImages: ['https://example.test/photo.jpg'],
  documents: [
    {
      key: 'title_deed_copy',
      requirementKey: 'title_deed_copy',
      status: 'uploaded',
      url: 'https://example.test/title-deed.pdf',
    },
  ],
}

const liveListing = {
  ...draftListing,
  status: 'active',
  listingVisibility: 'active_market',
}

function actionById(actions = [], id = '') {
  return actions.find((action) => action.id === id) || null
}

function assertNoKingstonsTokens(value, label) {
  const serialized = JSON.stringify(value)
  for (const token of kingstonsOnlyTokens) {
    assert.equal(serialized.includes(token), false, `${label} leaked Kingstons-only token ${token}`)
  }
}

function assertNextAction(args, expectedId, expectedLabel) {
  const journey = buildSellerJourney(args)
  const readiness = getSellerReadiness({ ...args, journey })
  assert.equal(readiness.nextAction.id, expectedId)
  assert.equal(readiness.nextAction.label, expectedLabel)
  return { journey, readiness }
}

{
  const resolution = resolveSellerProcessProfileForOrganisation({
    organisation: { name: 'Kingstons Real Estate', displayName: 'Kingstons' },
    assignedAgentEmail: 'kingstons.training@arch9.test',
  })
  assert.equal(resolution.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(resolution.isKingstons, false)
  assert.deepEqual(SELLER_JOURNEY_STAGES.map((stage) => stage.key), defaultStageKeys)
}

{
  const { journey, readiness } = assertNextAction({ lead: baseLead }, 'send_seller_onboarding', 'Send Seller Onboarding')
  assert.equal(journey.stage.key, 'contacted')
  assert.equal(actionById(readiness.actions, 'send_seller_onboarding')?.enabled, true)
  assertNoKingstonsTokens({ journey, readiness }, 'contacted global smoke')
}

{
  const lead = {
    ...baseLead,
    sellerOnboardingToken: 'global-onboarding-token',
    sellerOnboardingStatus: 'sent',
  }
  const { journey, readiness } = assertNextAction({ lead }, 'open_seller_portal', 'Track Seller Onboarding')
  assert.equal(journey.stage.key, 'seller_onboarding_sent')
  assert.equal(actionById(getSellerJourneyActions({ lead }), 'open_seller_portal')?.enabled, true)
  assert.equal(actionById(readiness.actions, 'generate_mandate'), null)
  assertNoKingstonsTokens({ journey, readiness }, 'onboarding sent global smoke')
}

{
  const { journey, readiness } = assertNextAction({ lead: submittedLead }, 'record_hard_copy_mandate', 'Mandate signed as hard copy')
  assert.equal(journey.stage.key, 'seller_onboarding_submitted')
  assert.equal(readiness.canSendMandate, false)
  assert.equal(actionById(readiness.actions, 'open_seller_portal')?.enabled, true)
  assertNoKingstonsTokens({ journey, readiness }, 'onboarding submitted global smoke')
}

{
  const { journey, readiness } = assertNextAction(
    { lead: submittedLead, mandatePacketStatus: draftMandatePacketStatus },
    'record_hard_copy_mandate',
    'Mandate signed as hard copy',
  )
  assert.equal(journey.stage.key, 'seller_onboarding_submitted')
  assert.equal(journey.mandateStatus, 'draft')
  assert.equal(readiness.canSendMandate, false)
  assertNoKingstonsTokens({ journey, readiness }, 'draft mandate global smoke')
}

{
  const { journey, readiness } = assertNextAction(
    { lead: submittedLead, mandatePacketStatus: sentMandatePacketStatus },
    'record_hard_copy_mandate',
    'Mandate signed as hard copy',
  )
  assert.equal(journey.stage.key, 'seller_onboarding_submitted')
  assert.equal(journey.mandateStatus, 'sent')
  assert.equal(readiness.blockers.some((item) => item.id === 'mandate_signature_outstanding'), true)
  assertNoKingstonsTokens({ journey, readiness }, 'sent mandate global smoke')
}

{
  const { journey, readiness } = assertNextAction(
    { lead: submittedLead, mandatePacketStatus: signedMandatePacketStatus },
    'create_listing',
    'Create Listing',
  )
  assert.equal(journey.stage.key, 'mandate_signed')
  assert.equal(journey.mandateStatus, 'signed')
  assert.equal(actionById(readiness.actions, 'open_documents')?.enabled, true)
  assertNoKingstonsTokens({ journey, readiness }, 'signed mandate global smoke')
}

{
  const { journey, readiness } = assertNextAction(
    { lead: submittedLead, listing: draftListing, mandatePacketStatus: signedMandatePacketStatus },
    'activate_listing',
    'Activate Listing',
  )
  assert.equal(journey.stage.key, 'listing_created')
  assert.equal(actionById(readiness.actions, 'open_listing')?.enabled, true)
  assert.equal(actionById(getSellerJourneyActions({ lead: submittedLead, listing: draftListing, mandatePacketStatus: signedMandatePacketStatus }), 'activate_listing')?.enabled, true)
  assert.equal(actionById(readiness.actions, 'activate_listing')?.enabled, false)
  assert.equal(actionById(readiness.actions, 'activate_listing')?.reason, 'Listing In Draft')
  assertNoKingstonsTokens({ journey, readiness }, 'listing created global smoke')
}

{
  const { journey, readiness } = assertNextAction(
    { lead: submittedLead, listing: liveListing, mandatePacketStatus: signedMandatePacketStatus },
    'monitor_performance',
    'Monitor Performance',
  )
  assert.equal(journey.stage.key, 'listing_live')
  assert.equal(actionById(readiness.actions, 'open_listing')?.enabled, true)
  assertNoKingstonsTokens({ journey, readiness }, 'listing live global smoke')
}

{
  const source = {
    lead: submittedLead,
    listing: draftListing,
    organisation: { name: 'Kingstons Real Estate', displayName: 'Kingstons' },
    assignedAgentEmail: 'kingstons.training@arch9.test',
    mandatePacketStatus: signedMandatePacketStatus,
  }
  const bundle = buildSellerProcessProjectionBundle(source)
  assert.equal(bundle.evaluation.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(bundle.surface.mode, 'default')
  assert.equal(bundle.surface.currentProcessStageKey, '')
  assert.deepEqual(bundle.surface.completedProcessStageKeys, [])
  assert.deepEqual(bundle.surface.missingEvidenceKeys, [])
  assert.equal(bundle.partners.attorney_firm.exposesInternalProcessStages, false)
  assertNoKingstonsTokens(bundle, 'default seller process projection')

  const panel = buildSellerProcessWorkspacePanelModel(source)
  assert.equal(panel.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(panel.visible, false)
  assertNoKingstonsTokens(panel, 'default seller process panel')
}

{
  const source = {
    lead: submittedLead,
    listing: draftListing,
    organisationSettings: {
      sellerProcess: {
        profile: KINGSTONS_SELLER_PROCESS_PROFILE,
      },
    },
    mandatePacketStatus: signedMandatePacketStatus,
  }
  const bundle = buildSellerProcessProjectionBundle(source)
  assert.equal(bundle.evaluation.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(bundle.surface.mode, 'shadow')
  assert.notEqual(bundle.surface.currentProcessStageKey, '')
}

assert.equal(
  packageJson.scripts?.['test:seller-process-global-smoke-phase1'],
  'node scripts/seller-process-global-smoke-phase1.test.mjs',
)

console.log('seller process global smoke Phase 1 contract passed')
