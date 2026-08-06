import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  DEFAULT_SELLER_PROCESS_PROFILE,
  KINGSTONS_SELLER_PROCESS_PROFILE,
} from '../src/services/sellerProcessProfileService.js'
import { buildSellerProcessShadowIntegration } from '../src/services/sellerProcessShadowIntegrationService.js'
import { SELLER_PROCESS_SHADOW_WORKSPACE_KEY } from '../src/services/sellerProcessWorkspaceIntegrationService.js'
import { buildSellerProcessWorkspacePanelModel } from '../src/services/sellerProcessWorkspacePanelService.js'

const appRoot = resolve(import.meta.dirname, '..')
const phase7Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase7-panel-model.md'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const agentLeadsPageSource = readFileSync(resolve(appRoot, 'src/pages/AgentLeadsPage.jsx'), 'utf8')

const liveNonPanelSources = [
  'src/pages/LegalDocumentWorkspacePage.jsx',
  'src/services/privateListingService.js',
  'src/lib/sellerDocumentRequirementEngine.js',
  'src/services/sellerPortalAppointmentsService.js',
  'src/services/clientPortalNotificationsService.js',
  'src/services/principalDashboardService.js',
  'src/lib/privateListingLifecycle.js',
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

function assertPartnerReadinessHidesInternalKeys(model) {
  const serialized = JSON.stringify(model.partnerReadiness)
  for (const key of internalKingstonsKeys) {
    assert.equal(serialized.includes(key), false, `partner readiness must not expose ${key}`)
  }
}

{
  const model = buildSellerProcessWorkspacePanelModel({})
  assert.equal(model.visible, false)
  assert.equal(model.profile, DEFAULT_SELLER_PROCESS_PROFILE)
  assert.deepEqual(model.sections, [])
  assert.deepEqual(model.actionCards, [])
}

{
  const payload = buildSellerProcessShadowIntegration({
    organisation: {
      name: 'Kingstons Real Estate',
    },
    row: {
      leadId: 'lead-name-only',
      status: 'contacted',
    },
  })
  const model = buildSellerProcessWorkspacePanelModel(payload)
  assert.equal(model.visible, false)
  assert.equal(model.profile, DEFAULT_SELLER_PROCESS_PROFILE)
}

{
  const payload = buildSellerProcessShadowIntegration({
    organisationSettings: {
      sellerProcess: {
        profile: 'kingstons_residential',
      },
    },
    activities: [{ activityType: 'seller_contact_call', status: 'completed' }],
    appointments: [
      { appointment_type: 'seller_valuation', status: 'completed' },
      { appointment_type: 'valuation_presentation', status: 'confirmed' },
    ],
    documents: [
      { document_type: 'valuation_document', status: 'uploaded', file_path: 'valuation.pdf' },
    ],
  })
  const model = buildSellerProcessWorkspacePanelModel({
    [SELLER_PROCESS_SHADOW_WORKSPACE_KEY]: payload,
  })
  assert.equal(model.visible, true)
  assert.equal(model.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(model.mode, 'shadow')
  assert.equal(model.readOnly, true)
  assert.equal(model.shadowOnly, true)
  assert.equal(model.currentStageLabel, 'Valuation Presented In Person')
  assert.equal(model.sections.find((section) => section.key === 'progress').items.length, 5)
  assert.equal(model.sections.find((section) => section.key === 'missing_evidence').items.some((item) => item.key === 'valuation_presented'), true)
  assert.equal(model.actionCards.every((card) => card.disabled === true && card.readOnly === true), true)
  assert.equal(model.actionCards.some((card) => card.key === 'complete_seller_pack' && card.pending === true), true)
  assertPartnerReadinessHidesInternalKeys(model)
}

{
  const payload = buildSellerProcessShadowIntegration({
    organisationSettings: {
      sellerProcess: {
        profile: 'kingstons_residential',
      },
    },
    lead: { status: 'contacted' },
    appointments: [
      { appointmentType: 'seller_valuation', status: 'completed' },
      { appointmentType: 'valuation_presentation', status: 'completed' },
    ],
    documents: [
      { documentType: 'valuation_document', status: 'uploaded', fileUrl: 'valuation.pdf' },
      { documentType: 'defects_disclosure_form', status: 'signed', file_path: 'defects.pdf' },
      { documentType: 'seller_fica_pack', status: 'uploaded', file_path: 'fica.pdf' },
    ],
    mandatePacketStatus: {
      packet: { id: 'packet-kingstons', status: 'completed' },
      signingSummary: { allSignersSigned: true },
    },
    listing: { id: 'listing-kingstons', listingStatus: 'created' },
  })
  const model = buildSellerProcessWorkspacePanelModel(payload)
  assert.equal(model.visible, true)
  assert.equal(model.percent, 100)
  assert.equal(model.partnerReadiness.every((partner) => partner.ready === true), true)
  assertPartnerReadinessHidesInternalKeys(model)
}

{
  assert.equal(
    agentLeadsPageSource.includes('sellerProcessWorkspaceIntegrationService'),
    false,
    'page consumers should request the gated fetch option, not import the Phase 6 workspace integration helper directly',
  )

  for (const file of liveNonPanelSources) {
    const source = readFileSync(resolve(appRoot, file), 'utf8')
    assert.equal(
      source.includes('sellerProcessWorkspacePanelService'),
      false,
      `${file} must not consume Phase 7 panel model yet`,
    )
  }

  assert.match(phase7Doc, /UI-facing panel model/)
  assert.match(phase7Doc, /Phase 8 is allowed to consume this model/)
  assert.match(phase7Doc, /must gate the Phase 6 shadow payload/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-panel-model-phase7'],
    'node scripts/seller-process-panel-model-phase7.test.mjs',
  )
}

console.log('seller process panel model Phase 7 contract passed')
