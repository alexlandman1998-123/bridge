import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
} from '../src/services/sellerProcessProfileService.js'
import {
  getSellerProcessDefinition,
  getSellerProcessDefinitionByProfile,
  getSellerProcessEvidenceKeys,
  getSellerProcessStageKeys,
  listSellerProcessDefinitions,
} from '../src/services/sellerProcessDefinitionService.js'
import { SELLER_JOURNEY_STAGES } from '../src/services/sellerJourneyService.js'

const appRoot = resolve(import.meta.dirname, '..')
const phase2Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase2-definition-model.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const sellerJourneySource = readFileSync(resolve(appRoot, 'src/services/sellerJourneyService.js'), 'utf8')
const sellerReadinessSource = readFileSync(resolve(appRoot, 'src/services/sellerReadinessService.js'), 'utf8')
const sellerRequirementSource = readFileSync(resolve(appRoot, 'src/lib/sellerDocumentRequirementEngine.js'), 'utf8')

const defaultStageKeys = [
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

const kingstonsStageKeys = [
  'first_contact',
  'valuation_appointment_scheduled',
  'formal_valuation_completed',
  'valuation_presentation_scheduled',
  'seller_pack_signed',
  'listing_terms_confirmed',
  'listing_ready',
]

const kingstonsDocumentKeys = [
  'valuation_document',
  'seller_mandate',
  'defects_disclosure_form',
  'seller_fica_pack',
]

const kingstonsEvidenceKeys = [
  'seller_contacted',
  'valuation_appointment_scheduled',
  'valuation_document_uploaded',
  'valuation_presentation_scheduled',
  'mandate_signed',
  'defects_form_signed',
  'fica_pack_signed',
  'commission_terms_confirmed',
  'transfer_attorney_nominated',
  'listing_ready',
]

function assertSourceDoesNotConsumeDefinition(source, label) {
  assert.equal(
    source.includes('sellerProcessDefinitionService'),
    false,
    `${label} must not consume the Phase 2 definition yet`,
  )
}

{
  const definitions = listSellerProcessDefinitions()
  assert.equal(definitions.length, 2)
  assert.deepEqual(definitions.map((definition) => definition.profile).sort(), [
    DEFAULT_SELLER_PROCESS_PROFILE,
    KINGSTONS_SELLER_PROCESS_PROFILE,
  ].sort())
}

{
  const definition = getSellerProcessDefinition({})
  assert.equal(definition.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(definition.runtimeEnabled, true)
  assert.deepEqual(definition.stages.map((stage) => stage.key), defaultStageKeys)
  assert.deepEqual(definition.stages.map((stage) => stage.key), SELLER_JOURNEY_STAGES.map((stage) => stage.key))
  assert.deepEqual(definition.appointmentRequirements, [])
  assert.deepEqual(definition.documentRequirements, [])
  assert.deepEqual(definition.evidenceGates, [])
  assert.equal(JSON.stringify(definition).includes('valuation_document'), false)
  assert.equal(JSON.stringify(definition).includes('defects_form_signed'), false)
  assert.equal(JSON.stringify(definition).includes('fica_pack_signed'), false)
}

{
  const nameOnly = getSellerProcessDefinition({
    organisation: {
      name: 'Kingstons Real Estate',
      displayName: 'Kingstons',
    },
  })
  assert.equal(nameOnly.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(nameOnly.resolution.configured, false)
}

{
  const organisationScoped = getSellerProcessDefinition({
    organisationId: 'ec19d0a6-bcba-4eef-aa72-9972de88204d',
  })
  assert.equal(organisationScoped.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(organisationScoped.resolution.organisationScoped, true)
  assert.deepEqual(organisationScoped.stages.map((stage) => stage.key), kingstonsStageKeys)
}

{
  const definition = getSellerProcessDefinition({
    organisationSettings: {
      sellerProcess: {
        profile: 'kingstons_residential',
      },
    },
  })
  assert.equal(definition.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(definition.runtimeEnabled, false)
  assert.equal(definition.phase, 'phase2_definition_only')
  assert.deepEqual(definition.stages.map((stage) => stage.key), kingstonsStageKeys)
  assert.deepEqual(definition.documentRequirements.map((requirement) => requirement.key), kingstonsDocumentKeys)
  assert.deepEqual(definition.evidenceGates.map((gate) => gate.key), kingstonsEvidenceKeys)
  assert.deepEqual(definition.appointmentRequirements.map((requirement) => requirement.appointmentType), [
    'seller_valuation',
    'valuation_presentation',
  ])
  assert.deepEqual(getSellerProcessStageKeys({ sellerProcessProfile: 'kingstons' }), kingstonsStageKeys)
  assert.deepEqual(getSellerProcessEvidenceKeys({ sellerProcessProfile: 'kingstons' }), kingstonsEvidenceKeys)
}

{
  const definition = getSellerProcessDefinitionByProfile(KINGSTONS_SELLER_PROCESS_PROFILE)
  const mandate = definition.documentRequirements.find((requirement) => requirement.key === 'seller_mandate')
  const defects = definition.documentRequirements.find((requirement) => requirement.key === 'defects_disclosure_form')
  const fica = definition.documentRequirements.find((requirement) => requirement.key === 'seller_fica_pack')
  assert.deepEqual(mandate.acceptedEvidenceModes, ['digital_signature', 'manual_upload'])
  assert.deepEqual(defects.acceptedEvidenceModes, ['digital_signature', 'manual_upload'])
  assert.deepEqual(fica.acceptedEvidenceModes, ['digital_signature', 'manual_upload'])
  assert.equal(definition.partnerHandoffs.every((handoff) => handoff.exposesInternalKingstonsStages === false), true)
  assert.equal(definition.partnerHandoffs.every((handoff) => handoff.readyAfterStage === 'listing_terms_confirmed'), true)
  assert.deepEqual(definition.partnerHandoffs.map((handoff) => handoff.partnerType), [
    'attorney_firm',
    'bond_originator',
  ])
}

{
  assertSourceDoesNotConsumeDefinition(sellerJourneySource, 'sellerJourneyService')
  assertSourceDoesNotConsumeDefinition(sellerReadinessSource, 'sellerReadinessService')
  assertSourceDoesNotConsumeDefinition(sellerRequirementSource, 'sellerDocumentRequirementEngine')
  assert.match(phase2Doc, /definition-only/)
  assert.match(phase2Doc, /runtimeEnabled: false/)
  assert.match(phase2Doc, /Kingstons internal stages hidden from partners/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-definition-phase2'],
    'node scripts/seller-process-definition-phase2.test.mjs',
  )
}

console.log('seller process definition Phase 2 contract passed')
