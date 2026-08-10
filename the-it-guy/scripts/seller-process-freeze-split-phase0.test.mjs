import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_ORGANISATION_IDS,
  KINGSTONS_SELLER_PROCESS_PROFILE,
} from '../src/services/sellerProcessProfileService.js'
import { getSellerProcessDefinition } from '../src/services/sellerProcessDefinitionService.js'
import { evaluateSellerProcess } from '../src/services/sellerProcessEvaluationService.js'
import { buildSellerProcessSurfaceProjection } from '../src/services/sellerProcessProjectionService.js'
import { buildSellerProcessWorkspacePanelModel } from '../src/services/sellerProcessWorkspacePanelService.js'
import { buildSellerDocumentSourceOfTruth } from '../src/services/sellerDocumentRequirementsService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const agencyPipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const panelServiceSource = readFileSync(resolve(appRoot, 'src/services/sellerProcessWorkspacePanelService.js'), 'utf8')

const KINGSTONS_ONLY_TOKENS = [
  'seller_pack_signed',
  'seller_pack_readiness_complete',
  'defects_form_signed',
  'fica_pack_signed',
  'valuation_presentation_scheduled',
]

function assertNoKingstonsProcessTokens(value, label) {
  const serialised = JSON.stringify(value)
  for (const token of KINGSTONS_ONLY_TOKENS) {
    assert.equal(serialised.includes(token), false, `${label} must not include ${token}`)
  }
}

function sellerLead(overrides = {}) {
  return {
    leadId: 'global-seller-phase0',
    leadCategory: 'seller',
    sellerEmail: 'seller@example.test',
    assignedAgentEmail: 'kingstons.training@arch9.test',
    assignedAgentName: 'Kingstons Training User',
    sellerOnboardingStatus: 'completed',
    ...overrides,
  }
}

function sellerListing(overrides = {}) {
  return {
    id: 'global-listing-phase0',
    organisationId: 'not-kingstons-org',
    sellerLeadId: 'global-seller-phase0',
    sellerOnboardingStatus: 'completed',
    mandateStatus: 'signed',
    sellerOnboarding: {
      status: 'completed',
      formData: {
        ownershipType: 'individual',
        propertyCategory: 'residential',
        propertyStructureType: 'full_title',
        gasInstallation: false,
        solarInstallation: false,
      },
    },
    ...overrides,
  }
}

{
  const definition = getSellerProcessDefinition({
    organisationId: 'not-kingstons-org',
    lead: sellerLead(),
    listing: sellerListing(),
  })
  assert.equal(definition.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assertNoKingstonsProcessTokens(definition, 'global seller process definition')
}

{
  const evaluation = evaluateSellerProcess({
    organisationId: 'not-kingstons-org',
    lead: sellerLead(),
    listing: sellerListing(),
    appointments: [
      { appointmentType: 'seller_valuation', status: 'completed' },
      { appointmentType: 'valuation_presentation', status: 'completed' },
    ],
    documents: [
      { documentType: 'valuation_document', status: 'uploaded', filePath: 'valuation.pdf' },
      { documentType: 'signed_defect_form', status: 'uploaded', filePath: 'defects.pdf' },
      { documentType: 'signed_fica_form', status: 'uploaded', filePath: 'fica.pdf' },
      { documentType: 'seller_pack_readiness', status: 'completed' },
    ],
  })
  assert.equal(evaluation.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assertNoKingstonsProcessTokens(evaluation, 'global seller process evaluation')
}

{
  const projection = buildSellerProcessSurfaceProjection({
    organisationId: 'not-kingstons-org',
    lead: sellerLead(),
    listing: sellerListing(),
  })
  assert.equal(projection.surface.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.equal(projection.surface.mode, 'default')
  assert.equal(projection.surface.currentProcessStageKey, '')
  assertNoKingstonsProcessTokens(projection.surface, 'global seller process projection')
}

{
  const model = buildSellerProcessWorkspacePanelModel({
    organisationId: 'not-kingstons-org',
    assignedAgentEmail: 'kingstons.training@arch9.test',
    row: sellerLead(),
    lead: sellerLead(),
    listing: sellerListing(),
  })
  assert.equal(model.visible, false)
  assert.equal(model.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assertNoKingstonsProcessTokens(model, 'global workspace panel model')
}

{
  const source = buildSellerDocumentSourceOfTruth({
    listing: {
      ...sellerListing(),
      kingstonsSellerPack: {
        source: 'manual_global_notes_not_a_profile',
        documents: {
          signed_defect_form: { status: 'uploaded', storagePath: 'wrong-lane/defects.pdf' },
          signed_fica_form: { status: 'uploaded', storagePath: 'wrong-lane/fica.pdf' },
        },
      },
    },
  })
  const keys = source.rows.map((row) => row.key)
  assert.equal(source.requirementPack, null)
  assert.equal(keys.includes('signed_defect_form'), false)
  assert.equal(keys.includes('signed_fica_form'), false)
}

{
  const kingstonsDefinition = getSellerProcessDefinition({
    organisationId: KINGSTONS_SELLER_PROCESS_ORGANISATION_IDS[0],
  })
  assert.equal(kingstonsDefinition.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.ok(kingstonsDefinition.stages.some((stage) => stage.key === 'seller_pack_signed'))

  const kingstonsPanel = buildSellerProcessWorkspacePanelModel({
    organisationId: KINGSTONS_SELLER_PROCESS_ORGANISATION_IDS[0],
    row: sellerLead(),
    lead: sellerLead(),
    documents: [
      { documentType: 'signed_mandate', status: 'uploaded', filePath: 'mandate.pdf' },
      { documentType: 'signed_defect_form', status: 'uploaded', filePath: 'defects.pdf' },
      { documentType: 'signed_fica_form', status: 'uploaded', filePath: 'fica.pdf' },
    ],
  })
  assert.equal(kingstonsPanel.visible, true)
  assert.equal(kingstonsPanel.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
}

assert.equal(
  packageJson.scripts?.['test:seller-process-freeze-split-phase0'],
  'node scripts/seller-process-freeze-split-phase0.test.mjs',
)
assert.equal(agencyPipelineSource.includes("value.includes('@kingstons.')"), false)
assert.equal(agencyPipelineSource.includes("value.includes('kingstons.training@arch9.test')"), false)
assert.equal(panelServiceSource.includes('hasKingstonsWorkspaceIdentitySignal'), false)

console.log('seller process freeze/split Phase 0 contract passed')
