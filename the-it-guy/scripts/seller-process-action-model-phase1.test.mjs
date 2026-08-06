import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
} from '../src/services/sellerProcessProfileService.js'
import {
  buildKingstonsSellerProcessActionModel,
  getKingstonsSellerProcessActionBlueprints,
} from '../src/services/sellerProcessActionModelService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const actionSource = readFileSync(resolve(appRoot, 'src/services/sellerProcessActionModelService.js'), 'utf8')

const actionKeys = [
  'contact_seller',
  'schedule_valuation_appointment',
  'upload_valuation_document',
  'schedule_valuation_presentation',
  'resend_valuation_presentation',
  'complete_seller_pack',
  'prepare_listing',
]

function kingstonsSource(overrides = {}) {
  return {
    sellerProcessProfile: KINGSTONS_SELLER_PROCESS_PROFILE,
    ...overrides,
  }
}

function assertCurrentAction(source, expectedKey, expected = {}) {
  const model = buildKingstonsSellerProcessActionModel(source)
  assert.equal(model.visible, true)
  assert.equal(model.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(model.canReplaceGlobalNextBestAction, true)
  assert.equal(model.currentAction?.key, expectedKey)
  assert.equal(model.actions.find((action) => action.key === expectedKey)?.current, true)
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(model.currentAction?.[key], value, `${expectedKey}.${key}`)
  }
  return model
}

{
  const blueprint = getKingstonsSellerProcessActionBlueprints()
  assert.deepEqual(blueprint.map((action) => action.key), actionKeys)
  assert.equal(blueprint.find((action) => action.key === 'schedule_valuation_appointment')?.appointmentType, 'seller_valuation')
  assert.equal(blueprint.find((action) => action.key === 'upload_valuation_document')?.documentType, 'valuation_document')
  assert.equal(blueprint.find((action) => action.key === 'upload_valuation_document')?.documentCategory, 'property')
  assert.equal(blueprint.find((action) => action.key === 'schedule_valuation_presentation')?.appointmentType, 'valuation_presentation')
  assert.equal(blueprint.find((action) => action.key === 'resend_valuation_presentation')?.resend, true)
  assert.equal(blueprint.find((action) => action.key === 'resend_valuation_presentation')?.createDuplicate, false)
  assert.equal(blueprint.find((action) => action.key === 'complete_seller_pack')?.deferred, true)
}

{
  const defaultModel = buildKingstonsSellerProcessActionModel({})
  assert.equal(defaultModel.visible, false)
  assert.equal(defaultModel.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(defaultModel.canReplaceGlobalNextBestAction, false)
  assert.equal(defaultModel.currentAction, null)

  const nameOnlyModel = buildKingstonsSellerProcessActionModel({
    organisation: { name: 'Kingstons Real Estate' },
    lead: { status: 'contacted' },
  })
  assert.equal(nameOnlyModel.visible, false)
  assert.equal(nameOnlyModel.profile, DEFAULT_SELLER_PROCESS_PROFILE)
}

{
  assertCurrentAction(kingstonsSource(), 'contact_seller', {
    label: 'Contact Seller',
    surface: 'activity',
  })
}

{
  assertCurrentAction(kingstonsSource({
    lead: {
      status: 'Contacted',
      stage: 'Contacted',
    },
  }), 'schedule_valuation_appointment', {
    label: 'Schedule Valuation Appointment',
    surface: 'appointments',
    appointmentType: 'seller_valuation',
    enabled: true,
  })
}

{
  assertCurrentAction(kingstonsSource({
    lead: { status: 'Contacted' },
    appointments: [
      { appointmentType: 'seller_valuation', status: 'confirmed' },
    ],
  }), 'upload_valuation_document', {
    label: 'Upload Valuation Document',
    surface: 'documents',
    documentType: 'valuation_document',
    documentCategory: 'property',
  })
}

{
  assertCurrentAction(kingstonsSource({
    lead: { status: 'Contacted' },
    appointments: [
      { appointmentType: 'seller_valuation', status: 'completed' },
    ],
    documents: [
      { documentType: 'valuation_document', status: 'uploaded', fileUrl: 'valuation.pdf' },
    ],
  }), 'schedule_valuation_presentation', {
    label: 'Schedule Valuation Presentation',
    surface: 'appointments',
    appointmentType: 'valuation_presentation',
  })
}

{
  assertCurrentAction(kingstonsSource({
    lead: { status: 'Contacted' },
    appointments: [
      { appointmentType: 'seller_valuation', status: 'completed' },
      { appointmentType: 'valuation_presentation', status: 'confirmed' },
    ],
    documents: [
      { documentType: 'valuation_document', status: 'uploaded', fileUrl: 'valuation.pdf' },
    ],
  }), 'resend_valuation_presentation', {
    label: 'Resend Valuation Presentation',
    appointmentType: 'valuation_presentation',
    resend: true,
    createDuplicate: false,
  })
}

{
  const model = assertCurrentAction(kingstonsSource({
    lead: { status: 'Contacted' },
    appointments: [
      { appointmentType: 'seller_valuation', status: 'completed' },
      { appointmentType: 'valuation_presentation', status: 'completed' },
    ],
    documents: [
      { documentType: 'valuation_document', status: 'uploaded', fileUrl: 'valuation.pdf' },
    ],
  }), 'complete_seller_pack', {
    label: 'Seller Pack',
    deferred: true,
    enabled: false,
    disabledReason: 'seller_pack_deferred',
  })
  assert.equal(model.sellerPackDeferred, true)
}

{
  assertCurrentAction(kingstonsSource({
    lead: { status: 'Contacted' },
    appointments: [
      { appointmentType: 'seller_valuation', status: 'completed' },
      { appointmentType: 'valuation_presentation', status: 'completed' },
    ],
    documents: [
      { documentType: 'valuation_document', status: 'uploaded', fileUrl: 'valuation.pdf' },
      { documentType: 'seller_mandate', status: 'signed', fileUrl: 'mandate.pdf' },
      { documentType: 'defects_disclosure_form', status: 'signed', fileUrl: 'defects.pdf' },
      { documentType: 'seller_fica_pack', status: 'signed', fileUrl: 'fica.pdf' },
    ],
    listing: { id: 'listing-1', listingStatus: 'created' },
  }), 'prepare_listing', {
    label: 'Prepare Listing',
    surface: 'listingWorkspace',
  })
}

{
  assert.match(actionSource, /buildSellerProcessEvidenceContext/)
  assert.match(actionSource, /evaluateSellerProcess/)
  assert.match(actionSource, /canReplaceGlobalNextBestAction/)
  assert.doesNotMatch(actionSource, /sellerReadinessService/)
  assert.doesNotMatch(actionSource, /createAppointmentAsync/)
  assert.doesNotMatch(actionSource, /uploadPrivateListingDocument/)
  assert.doesNotMatch(actionSource, /updatePrivateListing/)
  assert.doesNotMatch(actionSource, /sendSellerOnboarding/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-action-model-phase1'],
    'node scripts/seller-process-action-model-phase1.test.mjs',
  )
}

console.log('seller process action model Phase 1 contract passed')
