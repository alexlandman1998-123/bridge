import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
} from '../src/services/sellerProcessProfileService.js'
import {
  buildKingstonsSellerProcessRailModel,
  getKingstonsSellerProcessRailBlueprint,
} from '../src/services/sellerProcessRailModelService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const railSource = readFileSync(resolve(appRoot, 'src/services/sellerProcessRailModelService.js'), 'utf8')
const pageSource = readFileSync(resolve(appRoot, 'src/pages/AgentLeadsPage.jsx'), 'utf8')
const phase2Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase2-definition-model.md'), 'utf8')

const railStageKeys = [
  'first_contact',
  'valuation_appointment',
  'formal_valuation',
  'valuation_presentation',
  'seller_pack',
  'list_property',
]

const railLabels = [
  'First Contact',
  'Schedule Valuation Appointment',
  'Formal Valuation',
  'Valuation Presentation',
  'Seller Pack',
  'List Property',
]

{
  const blueprint = getKingstonsSellerProcessRailBlueprint()
  assert.deepEqual(blueprint.map((stage) => stage.key), railStageKeys)
  assert.deepEqual(blueprint.map((stage) => stage.label), railLabels)
  assert.equal(blueprint.find((stage) => stage.key === 'valuation_appointment')?.appointmentType, 'seller_valuation')
  assert.equal(blueprint.find((stage) => stage.key === 'valuation_presentation')?.appointmentType, 'valuation_presentation')
  assert.equal(blueprint.find((stage) => stage.key === 'formal_valuation')?.documentType, 'valuation_document')
  assert.equal(blueprint.find((stage) => stage.key === 'seller_pack')?.deferred, true)
}

{
  const defaultModel = buildKingstonsSellerProcessRailModel({})
  assert.equal(defaultModel.visible, false)
  assert.equal(defaultModel.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.deepEqual(defaultModel.stages, [])

  const nameOnlyModel = buildKingstonsSellerProcessRailModel({
    organisation: {
      name: 'Kingstons Real Estate',
      displayName: 'Kingstons',
    },
  })
  assert.equal(nameOnlyModel.visible, false)
  assert.equal(nameOnlyModel.profile, DEFAULT_SELLER_PROCESS_PROFILE)
}

{
  const model = buildKingstonsSellerProcessRailModel({
    organisationSettings: {
      sellerProcess: {
        profile: KINGSTONS_SELLER_PROCESS_PROFILE,
      },
    },
  })
  assert.equal(model.visible, true)
  assert.equal(model.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(model.mode, 'shadow')
  assert.equal(model.canReplaceSellerJourney, false)
  assert.equal(model.sellerPackDeferred, true)
  assert.deepEqual(model.stages.map((stage) => stage.key), railStageKeys)
  assert.equal(model.currentStageKey, 'first_contact')
  assert.equal(model.stages.find((stage) => stage.key === 'seller_pack')?.actionEnabled, false)
}

{
  const model = buildKingstonsSellerProcessRailModel({
    sellerProcessProfile: 'kingstons_residential',
    lead: {
      stage: 'Contacted',
      status: 'Contacted',
    },
    appointments: [
      {
        appointmentType: 'seller_valuation',
        appointmentStatus: 'confirmed',
      },
    ],
    documents: [
      {
        documentType: 'valuation_document',
        status: 'uploaded',
        fileUrl: 'https://example.test/valuation.pdf',
      },
    ],
  })
  assert.equal(model.stages.find((stage) => stage.key === 'first_contact')?.state, 'complete')
  assert.equal(model.stages.find((stage) => stage.key === 'valuation_appointment')?.state, 'complete')
  assert.equal(model.stages.find((stage) => stage.key === 'formal_valuation')?.state, 'complete')
  assert.equal(model.stages.find((stage) => stage.key === 'valuation_presentation')?.state, 'current')
  assert.equal(model.currentStageKey, 'valuation_presentation')
}

{
  const model = buildKingstonsSellerProcessRailModel({
    sellerProcessProfile: 'kingstons',
    lead: {
      stage: 'Contacted',
      status: 'Contacted',
    },
    appointments: [
      { appointmentType: 'seller_valuation', appointmentStatus: 'completed' },
      { appointmentType: 'valuation_presentation', appointmentStatus: 'completed' },
    ],
    documents: [
      { documentType: 'valuation_document', status: 'uploaded', fileUrl: 'https://example.test/valuation.pdf' },
    ],
    listing: {
      id: 'listing-1',
      listingStatus: 'created',
    },
  })
  assert.equal(model.stages.find((stage) => stage.key === 'valuation_presentation')?.state, 'complete')
  assert.equal(model.stages.find((stage) => stage.key === 'seller_pack')?.state, 'current')
  assert.equal(model.stages.find((stage) => stage.key === 'list_property')?.state, 'complete')
}

{
  assert.match(railSource, /KINGSTONS_SELLER_PROCESS_PROFILE/)
  assert.equal(railSource.includes('Kingstons Real Estate'), false)
  assert.equal(pageSource.includes('buildKingstonsSellerProcessRailModel'), false)
  assert.match(phase2Doc, /Kingston Rail Model/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-rail-model-phase2'],
    'node scripts/seller-process-rail-model-phase2.test.mjs',
  )
}

console.log('seller process rail model Phase 2 contract passed')
