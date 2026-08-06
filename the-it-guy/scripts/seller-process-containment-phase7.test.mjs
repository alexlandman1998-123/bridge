import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
  resolveSellerProcessProfile,
} from '../src/services/sellerProcessProfileService.js'
import { evaluateSellerProcess } from '../src/services/sellerProcessEvaluationService.js'
import { buildKingstonsSellerProcessRailModel } from '../src/services/sellerProcessRailModelService.js'
import { buildKingstonsSellerProcessActionModel } from '../src/services/sellerProcessActionModelService.js'
import { buildSellerProcessProjectionBundle } from '../src/services/sellerProcessProjectionService.js'
import { buildSellerProcessShadowIntegration } from '../src/services/sellerProcessShadowIntegrationService.js'
import { buildSellerLeadWorkspaceShadowIntegration } from '../src/services/sellerProcessWorkspaceIntegrationService.js'
import { buildSellerProcessWorkspacePanelModel } from '../src/services/sellerProcessWorkspacePanelService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const phase7Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase7-containment-tests.md'), 'utf8')
const agencyPipelineSource = readFileSync(resolve(appRoot, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')

const liveRuntimeSources = [
  'src/services/sellerJourneyService.js',
  'src/services/sellerReadinessService.js',
  'src/lib/sellerDocumentRequirementEngine.js',
  'src/lib/privateListingLifecycle.js',
  'src/services/privateListingService.js',
  'src/pages/LegalDocumentWorkspacePage.jsx',
  'src/services/sellerPortalAppointmentsService.js',
  'src/services/clientPortalNotificationsService.js',
  'src/services/principalDashboardService.js',
]

const partnerFacingSources = [
  'src/services/sellerPortalAppointmentsService.js',
  'src/services/clientPortalNotificationsService.js',
  'src/services/principalDashboardService.js',
]

const allowedSellerProcessSources = [
  'src/services/sellerProcessProfileService.js',
  'src/services/sellerProcessDefinitionService.js',
  'src/services/sellerProcessEvaluationService.js',
  'src/services/sellerProcessProjectionService.js',
  'src/services/sellerProcessShadowIntegrationService.js',
  'src/services/sellerProcessWorkspaceIntegrationService.js',
  'src/services/sellerProcessWorkspacePanelService.js',
  'src/services/sellerProcessRailModelService.js',
  'src/services/sellerProcessActionModelService.js',
  'src/services/sellerProcessEvidenceMappingService.js',
]

const internalKingstonsKeys = [
  'first_contact',
  'valuation_appointment_scheduled',
  'formal_valuation_completed',
  'valuation_presentation_scheduled',
  'valuation_presented',
  'seller_pack_signed',
  'defects_form_signed',
  'fica_pack_signed',
]

const kingstonsActionKeys = [
  'schedule_valuation_appointment',
  'upload_valuation_document',
  'schedule_valuation_presentation',
  'resend_valuation_presentation',
  'complete_seller_pack',
  'prepare_listing',
]

const kingstonsLookingEvidence = {
  organisation: {
    name: 'Kingstons Real Estate',
    displayName: 'Kingstons',
    logoUrl: '/brand/kingstons-logo-form.png',
  },
  row: {
    leadId: 'lead-name-only',
    status: 'contacted',
    listingId: 'listing-name-only',
    communicationTimeline: [
      { activityType: 'WhatsApp seller contact', status: 'completed' },
    ],
  },
  appointments: [
    { appointment_type: 'seller_valuation', status: 'completed' },
    { appointment_type: 'valuation_presentation', status: 'completed' },
  ],
  listings: [
    {
      id: 'listing-name-only',
      sellerLeadId: 'lead-name-only',
      listingStatus: 'created',
      documents: [
        { document_type: 'valuation_document', status: 'uploaded', file_path: 'valuation.pdf' },
        { document_type: 'defects_disclosure_form', status: 'signed', file_path: 'defects.pdf' },
        { document_type: 'seller_fica_pack', status: 'uploaded', file_path: 'fica.pdf' },
      ],
    },
  ],
  documentPackets: [
    { id: 'packet-name-only', packetType: 'mandate', status: 'completed' },
  ],
}

const explicitKingstonsEvidence = {
  ...kingstonsLookingEvidence,
  sellerProcessProfile: KINGSTONS_SELLER_PROCESS_PROFILE,
}

function assertNoInternalKingstonsKeys(value, label) {
  const serialized = JSON.stringify(value)
  for (const key of internalKingstonsKeys) {
    assert.equal(serialized.includes(key), false, `${label} must not expose ${key}`)
  }
}

function assertDefaultContainment(source = {}, label = 'source') {
  const resolution = resolveSellerProcessProfile(source)
  const evaluation = evaluateSellerProcess(source)
  const rail = buildKingstonsSellerProcessRailModel(source)
  const actionModel = buildKingstonsSellerProcessActionModel(source)
  const projection = buildSellerProcessProjectionBundle(source)
  const shadow = buildSellerProcessShadowIntegration(source)
  const workspaceShadow = buildSellerLeadWorkspaceShadowIntegration(source)
  const panel = buildSellerProcessWorkspacePanelModel({ sellerProcessShadowIntegration: workspaceShadow })

  assert.equal(resolution.profile, DEFAULT_SELLER_PROCESS_PROFILE, `${label} should resolve to default`)
  assert.equal(resolution.isKingstons, false, `${label} should not be Kingstons`)
  assert.equal(evaluation.profile, DEFAULT_SELLER_PROCESS_PROFILE, `${label} evaluator should stay default`)
  assert.equal(rail.visible, false, `${label} rail should stay hidden`)
  assert.equal(actionModel.visible, false, `${label} action model should stay hidden`)
  assert.equal(actionModel.canReplaceGlobalNextBestAction, false, `${label} must not replace global next best action`)
  assert.equal(actionModel.currentAction, null, `${label} must not emit a Kingston current action`)
  assert.deepEqual(actionModel.actions, [], `${label} must not emit Kingston actions`)
  assert.equal(projection.surface.mode, 'default', `${label} projection should stay default`)
  assert.deepEqual(projection.surface.completedProcessStageKeys, [], `${label} should not emit Kingston completed stages`)
  assert.deepEqual(projection.surface.missingEvidenceKeys, [], `${label} should not emit Kingston missing evidence`)
  assert.equal(shadow.mode, 'default', `${label} shadow should stay default`)
  assert.equal(workspaceShadow.mode, 'default', `${label} workspace shadow should stay default`)
  assert.equal(panel.visible, false, `${label} panel should stay hidden`)
  assertNoInternalKingstonsKeys(projection.partners, `${label} partner projection`)
}

{
  assertDefaultContainment({}, 'empty default')
  assertDefaultContainment(kingstonsLookingEvidence, 'Kingstons-looking organisation data')
  assertDefaultContainment({
    ...kingstonsLookingEvidence,
    metadata: { sellerProcessProfile: 'unknown_kingstons_profile' },
  }, 'unknown profile')
}

{
  const resolution = resolveSellerProcessProfile(explicitKingstonsEvidence)
  const evaluation = evaluateSellerProcess(explicitKingstonsEvidence)
  const rail = buildKingstonsSellerProcessRailModel(explicitKingstonsEvidence)
  const actionModel = buildKingstonsSellerProcessActionModel(explicitKingstonsEvidence)
  const shadow = buildSellerProcessShadowIntegration(explicitKingstonsEvidence)
  const panel = buildSellerProcessWorkspacePanelModel({ sellerProcessShadowIntegration: shadow })

  assert.equal(resolution.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(resolution.isKingstons, true)
  assert.equal(evaluation.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(evaluation.canApplyToRuntime, false)
  assert.equal(rail.visible, true)
  assert.equal(rail.canReplaceSellerJourney, false)
  assert.equal(actionModel.visible, true)
  assert.equal(actionModel.canReplaceGlobalNextBestAction, true)
  assert.equal(actionModel.readOnly, true)
  assert.equal(actionModel.sellerPackDeferred, true)
  assert.equal(actionModel.actions.find((action) => action.key === 'complete_seller_pack')?.enabled, false)
  assert.equal(shadow.mode, 'shadow')
  assert.equal(shadow.canWrite, false)
  assert.equal(shadow.canApplyToRuntime, false)
  assert.equal(panel.visible, true)
  assert.equal(panel.readOnly, true)
  assert.equal(panel.shadowOnly, true)
  assertNoInternalKingstonsKeys(shadow.partners, 'Kingstons partner shadow payload')
  assertNoInternalKingstonsKeys(panel.partnerReadiness, 'Kingstons panel partner readiness')
}

{
  assert.match(agencyPipelineSource, /const KINGSTONS_SELLER_PROCESS_ONLY_ACTION_IDS = new Set\(\[/)
  assert.match(agencyPipelineSource, /KINGSTONS_SELLER_PROCESS_ONLY_ACTION_IDS\.has\(id\)/)
  assert.match(agencyPipelineSource, /!selectedKingstonsSellerProcessActionModel\?\.visible/)
  assert.match(agencyPipelineSource, /setLeadWorkspaceTab\('overview'\)[\s\S]*?return[\s\S]*?if \(id === 'contact_seller'\)/)
  assert.match(agencyPipelineSource, /const selectedAppointmentTypeOptions = useMemo\(\(\) => \{/)
  assert.match(agencyPipelineSource, /Boolean\(selectedKingstonsSellerProcessActionModel\?\.visible\)/)
  assert.match(agencyPipelineSource, /!KINGSTONS_SELLER_PROCESS_APPOINTMENT_TYPES\.has\(normalizeText\(option\?\.value\)\)/)
}

{
  for (const file of liveRuntimeSources) {
    const source = readFileSync(resolve(appRoot, file), 'utf8')
    assert.equal(source.includes('sellerProcessEvaluationService'), false, `${file} must not import the seller process evaluator`)
    assert.equal(source.includes('sellerProcessProjectionService'), false, `${file} must not import seller process projection`)
    assert.equal(source.includes('sellerProcessShadowIntegrationService'), false, `${file} must not import seller process shadow integration`)
    assert.equal(source.includes('sellerProcessWorkspacePanelService'), false, `${file} must not import seller process panel model`)
    assert.equal(source.includes('sellerProcessRailModelService'), false, `${file} must not import Kingston rail model`)
    assert.equal(source.includes('sellerProcessActionModelService'), false, `${file} must not import Kingston action model`)
    assert.equal(source.includes('sellerProcessEvidenceMappingService'), false, `${file} must not import seller process evidence mapper`)
  }
}

{
  for (const file of partnerFacingSources) {
    const source = readFileSync(resolve(appRoot, file), 'utf8')
    for (const key of [...internalKingstonsKeys, ...kingstonsActionKeys]) {
      assert.equal(source.includes(key), false, `${file} must not expose Kingston process key ${key}`)
    }
  }
}

{
  for (const file of allowedSellerProcessSources) {
    const source = readFileSync(resolve(appRoot, file), 'utf8')
    assert.doesNotMatch(source, /supabase\.from\(['"`]seller_process/i, `${file} must not write seller process tables`)
    assert.doesNotMatch(source, /updatePrivateListing\(/, `${file} must not directly update listings for Kingston process`)
    assert.doesNotMatch(source, /uploadPrivateListingDocument\(/, `${file} must not directly upload seller documents for Kingston process`)
    assert.doesNotMatch(source, /createAppointmentAsync\(/, `${file} must not directly create appointments for Kingston process`)
    assert.doesNotMatch(source, /sendSellerOnboarding\(/, `${file} must not send seller onboarding from Kingston process`)
  }
}

{
  assert.match(phase7Doc, /Containment Tests/)
  assert.match(phase7Doc, /organisation name alone/)
  assert.match(phase7Doc, /read-only/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-containment-phase7'],
    'node scripts/seller-process-containment-phase7.test.mjs',
  )
}

console.log('seller process containment Phase 7 contract passed')
