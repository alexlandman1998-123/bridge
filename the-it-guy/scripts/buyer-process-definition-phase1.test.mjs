import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  BUYER_PROCESS_PROFILE_KEYS,
  DEFAULT_BUYER_PROCESS_PROFILE,
  KINGSTONS_BUYER_PROCESS_ORGANISATION_IDS,
  KINGSTONS_BUYER_PROCESS_PROFILE,
  isKingstonsBuyerProcessOrganisationId,
  isKingstonsBuyerProcessProfile,
  isKnownBuyerProcessProfile,
  normalizeBuyerProcessProfile,
  resolveBuyerProcessProfile,
  resolveBuyerProcessProfileForOrganisation,
  resolveBuyerProcessProfileKey,
} from '../src/services/buyerProcessProfileService.js'
import {
  BUYER_PROCESS_ACTION_KEYS,
  BUYER_PROCESS_STAGE_KEYS,
  canTransitionBuyerProcessStage,
  getBuyerProcessActiveStageKeys,
  getBuyerProcessAllowedNextStageKeys,
  getBuyerProcessDefinition,
  getBuyerProcessDefinitionByProfile,
  getBuyerProcessEvidenceKeys,
  getBuyerProcessOutcomeStageKeys,
  getBuyerProcessStageLabel,
  getBuyerProcessStageKeys,
  listBuyerProcessDefinitions,
  normalizeBuyerProcessStageKey,
} from '../src/services/buyerProcessDefinitionService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))

const defaultActiveStageKeys = [
  'captured',
  'contacted',
  'qualified',
  'viewing',
  'transaction_setup',
  'offer',
  'transaction',
]

const kingstonsActiveStageKeys = [
  'captured',
  'contacted',
  'qualified',
  'viewing',
  'offer',
  'transaction_setup',
  'transaction',
]

const outcomeStageKeys = [
  'on_hold',
  'lost',
  'closed_won',
  'closed_lost',
]

const evidenceKeys = [
  'buyer_lead_captured',
  'buyer_contact_logged',
  'buyer_qualified',
  'viewing_recorded',
  'buyer_onboarding_link_sent',
  'buyer_profile_captured',
  'otp_document_uploaded',
  'transaction_created',
  'hold_reason_captured',
  'lost_reason_captured',
  'transaction_closed_won',
  'transaction_closed_lost',
]

{
  const kingstonsOrgId = KINGSTONS_BUYER_PROCESS_ORGANISATION_IDS[0]
  assert.equal(BUYER_PROCESS_PROFILE_KEYS.DEFAULT_RESIDENTIAL, DEFAULT_BUYER_PROCESS_PROFILE)
  assert.equal(BUYER_PROCESS_PROFILE_KEYS.KINGSTONS_RESIDENTIAL, KINGSTONS_BUYER_PROCESS_PROFILE)
  assert.equal(normalizeBuyerProcessProfile(''), DEFAULT_BUYER_PROCESS_PROFILE)
  assert.equal(normalizeBuyerProcessProfile('global'), DEFAULT_BUYER_PROCESS_PROFILE)
  assert.equal(normalizeBuyerProcessProfile('standard'), DEFAULT_BUYER_PROCESS_PROFILE)
  assert.equal(normalizeBuyerProcessProfile('Kingstons Residential'), KINGSTONS_BUYER_PROCESS_PROFILE)
  assert.equal(normalizeBuyerProcessProfile('kingstons-residential'), KINGSTONS_BUYER_PROCESS_PROFILE)
  assert.equal(isKnownBuyerProcessProfile('kingstons'), true)
  assert.equal(isKnownBuyerProcessProfile('future_partner_profile'), false)
  assert.equal(isKingstonsBuyerProcessProfile('kingstons'), true)
  assert.equal(isKingstonsBuyerProcessProfile('default_residential'), false)
  assert.equal(isKingstonsBuyerProcessOrganisationId(kingstonsOrgId), true)
  assert.equal(isKingstonsBuyerProcessOrganisationId('not-kingstons'), false)
}

{
  const resolved = resolveBuyerProcessProfile({})
  assert.equal(resolved.profile, DEFAULT_BUYER_PROCESS_PROFILE)
  assert.equal(resolved.configured, false)
  assert.equal(resolved.knownProfile, false)
  assert.equal(resolved.sourcePath, '')
  assert.equal(resolved.isDefault, true)
  assert.equal(resolved.isKingstons, false)
}

{
  const kingstonsOrgId = KINGSTONS_BUYER_PROCESS_ORGANISATION_IDS[0]
  const nameOnly = resolveBuyerProcessProfileForOrganisation({
    organisation: {
      name: 'Kingstons Real Estate',
      displayName: 'Kingstons',
    },
  })
  assert.equal(nameOnly.profile, DEFAULT_BUYER_PROCESS_PROFILE)
  assert.equal(nameOnly.isKingstons, false)

  const orgScoped = resolveBuyerProcessProfileForOrganisation({
    organisationId: kingstonsOrgId,
  })
  assert.equal(orgScoped.profile, KINGSTONS_BUYER_PROCESS_PROFILE)
  assert.equal(orgScoped.isKingstons, true)
  assert.equal(orgScoped.organisationScoped, true)

  const explicit = resolveBuyerProcessProfile({
    organisationSettings: {
      buyerProcess: {
        profile: 'kingstons_residential',
      },
    },
  })
  assert.equal(explicit.profile, KINGSTONS_BUYER_PROCESS_PROFILE)
  assert.equal(explicit.sourcePath, 'organisationSettings.buyerProcess.profile')
  assert.equal(resolveBuyerProcessProfileKey({ buyer_process_profile: 'kingstons' }), KINGSTONS_BUYER_PROCESS_PROFILE)

  const unknownExplicit = resolveBuyerProcessProfileForOrganisation({
    organisationId: kingstonsOrgId,
    buyerProcessProfile: 'future_partner_profile',
  })
  assert.equal(unknownExplicit.profile, DEFAULT_BUYER_PROCESS_PROFILE)
  assert.equal(unknownExplicit.knownProfile, false)
  assert.equal(unknownExplicit.organisationScoped, undefined)
}

{
  const definitions = listBuyerProcessDefinitions()
  assert.equal(definitions.length, 2)
  assert.deepEqual(definitions.map((definition) => definition.profile).sort(), [
    DEFAULT_BUYER_PROCESS_PROFILE,
    KINGSTONS_BUYER_PROCESS_PROFILE,
  ].sort())
}

{
  const definition = getBuyerProcessDefinition({})
  assert.equal(definition.profile, DEFAULT_BUYER_PROCESS_PROFILE)
  assert.equal(definition.runtimeEnabled, false)
  assert.equal(definition.phase, 'phase1_definition_only')
  assert.deepEqual(definition.activeStageKeys, defaultActiveStageKeys)
  assert.deepEqual(definition.outcomeStageKeys, outcomeStageKeys)
  assert.deepEqual(definition.stages.map((stage) => stage.key), [...defaultActiveStageKeys, ...outcomeStageKeys])
  assert.deepEqual(getBuyerProcessStageKeys({}), [...defaultActiveStageKeys, ...outcomeStageKeys])
  assert.deepEqual(getBuyerProcessActiveStageKeys({}), defaultActiveStageKeys)
  assert.deepEqual(getBuyerProcessOutcomeStageKeys({}), outcomeStageKeys)
  assert.deepEqual(getBuyerProcessEvidenceKeys({}), evidenceKeys)
}

{
  const definition = getBuyerProcessDefinitionByProfile(KINGSTONS_BUYER_PROCESS_PROFILE)
  assert.equal(definition.profile, KINGSTONS_BUYER_PROCESS_PROFILE)
  assert.equal(definition.label, 'Kingstons Residential Buyer Process')
  assert.equal(definition.runtimeEnabled, false)
  assert.equal(definition.phase, 'phase1_definition_only')
  assert.deepEqual(definition.activeStageKeys, kingstonsActiveStageKeys)
  assert.deepEqual(definition.stages.map((stage) => stage.key), [...kingstonsActiveStageKeys, ...outcomeStageKeys])
}

{
  assert.equal(normalizeBuyerProcessStageKey('New Lead'), BUYER_PROCESS_STAGE_KEYS.captured)
  assert.equal(normalizeBuyerProcessStageKey('Contacted'), BUYER_PROCESS_STAGE_KEYS.contacted)
  assert.equal(normalizeBuyerProcessStageKey('Qualified'), BUYER_PROCESS_STAGE_KEYS.qualified)
  assert.equal(normalizeBuyerProcessStageKey('Qualification'), BUYER_PROCESS_STAGE_KEYS.qualified)
  assert.equal(normalizeBuyerProcessStageKey('Viewing Completed'), BUYER_PROCESS_STAGE_KEYS.viewing)
  assert.equal(normalizeBuyerProcessStageKey('Offer + Onboarding Link Sent'), BUYER_PROCESS_STAGE_KEYS.buyerOnboardingSent)
  assert.equal(normalizeBuyerProcessStageKey('Offer Submitted'), BUYER_PROCESS_STAGE_KEYS.offerReceived)
  assert.equal(normalizeBuyerProcessStageKey('Ready to Generate OTP'), BUYER_PROCESS_STAGE_KEYS.offerReceived)
  assert.equal(normalizeBuyerProcessStageKey('OTP Generated'), BUYER_PROCESS_STAGE_KEYS.offerReceived)
  assert.equal(normalizeBuyerProcessStageKey('Buyer Signed'), BUYER_PROCESS_STAGE_KEYS.offerReceived)
  assert.equal(normalizeBuyerProcessStageKey('Signed by All Parties'), BUYER_PROCESS_STAGE_KEYS.offer)
  assert.equal(normalizeBuyerProcessStageKey('Transaction Live'), BUYER_PROCESS_STAGE_KEYS.transaction)
  assert.equal(normalizeBuyerProcessStageKey('Finance'), BUYER_PROCESS_STAGE_KEYS.transaction)
  assert.equal(normalizeBuyerProcessStageKey('Transfer'), BUYER_PROCESS_STAGE_KEYS.transaction)
  assert.equal(normalizeBuyerProcessStageKey('Lost'), BUYER_PROCESS_STAGE_KEYS.lost)
  assert.equal(getBuyerProcessStageLabel('buyer_onboarding_sent'), 'Transaction Setup')
  assert.equal(getBuyerProcessStageLabel('offer_submitted'), 'Offer')
  assert.equal(getBuyerProcessStageLabel('OTP Transaction'), 'Offer')
}

{
  assert.deepEqual(getBuyerProcessAllowedNextStageKeys('Captured'), [
    BUYER_PROCESS_STAGE_KEYS.contacted,
    BUYER_PROCESS_STAGE_KEYS.onHold,
    BUYER_PROCESS_STAGE_KEYS.lost,
  ])
  assert.equal(canTransitionBuyerProcessStage('Captured', 'Contacted'), true)
  assert.equal(canTransitionBuyerProcessStage('Captured', 'Qualified'), false)
  assert.equal(canTransitionBuyerProcessStage('Contacted', 'Qualified'), true)
  assert.equal(canTransitionBuyerProcessStage('Viewing', 'Transaction Setup'), true)
  assert.equal(canTransitionBuyerProcessStage('Viewing', 'Offer'), false)
  assert.equal(canTransitionBuyerProcessStage('Transaction Setup', 'Offer'), true)
  assert.equal(canTransitionBuyerProcessStage('Offer', 'Transaction'), true)
  assert.equal(canTransitionBuyerProcessStage('Viewing', 'Offer', { buyerProcessProfile: KINGSTONS_BUYER_PROCESS_PROFILE }), true)
  assert.equal(canTransitionBuyerProcessStage('Offer', 'Transaction Setup', { buyerProcessProfile: KINGSTONS_BUYER_PROCESS_PROFILE }), true)
  assert.equal(canTransitionBuyerProcessStage('Transaction Setup', 'Transaction', { buyerProcessProfile: KINGSTONS_BUYER_PROCESS_PROFILE }), true)
  assert.equal(canTransitionBuyerProcessStage('Lost', 'Captured'), false)
}

{
  const definition = getBuyerProcessDefinition({})
  const activeStages = definition.stages.filter((stage) => definition.activeStageKeys.includes(stage.key))
  assert.equal(
    activeStages.every((stage) => stage.allowedActionKeys.includes(BUYER_PROCESS_ACTION_KEYS.followUp)),
    true,
    'Every active buyer stage must allow follow-up capture.',
  )
  assert.equal(
    activeStages.every((stage) => stage.allowedActionKeys.includes(BUYER_PROCESS_ACTION_KEYS.markLost)),
    true,
    'Every active buyer stage must allow mark-lost capture.',
  )
  assert.equal(
    activeStages.every((stage) => stage.allowedActionKeys.includes(BUYER_PROCESS_ACTION_KEYS.placeOnHold)),
    true,
    'Every active buyer stage must allow on-hold capture.',
  )

  const offerGate = definition.evidenceGates.find((gate) => gate.key === 'otp_document_uploaded')
  assert.deepEqual(offerGate.documentTypes, ['uploaded_otp', 'buyer_otp', 'signed_otp', 'otp', 'buyer_offer', 'offer_document', 'offer_to_purchase', 'uploaded_offer', 'signed_offer'])
  assert.equal(JSON.stringify(definition).includes('generate_otp'), false)
  assert.equal(JSON.stringify(definition).includes('otp_generated'), false)
}

{
  assert.equal(
    packageJson.scripts?.['test:buyer-process-definition-phase1'],
    'node scripts/buyer-process-definition-phase1.test.mjs',
  )
}

console.log('buyer process definition Phase 1 contract passed')
