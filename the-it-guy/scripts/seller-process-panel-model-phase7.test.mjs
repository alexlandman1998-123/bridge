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
  'listing_terms_confirmed',
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
  assert.equal(model.readOnly, false)
  assert.equal(model.shadowOnly, false)
  assert.equal(model.title, 'Kingstons Seller Process')
  assert.equal(model.currentStageLabel, 'Valuation Presented')
  assert.equal(model.sections.find((section) => section.key === 'progress').items.length, 5)
  assert.equal(model.sections.find((section) => section.key === 'missing_evidence').items.some((item) => item.key === 'valuation_presented'), true)
  assert.equal(model.actionCards.every((card) => card.disabled === false && card.readOnly === false), true)
  assert.equal(model.actionCards.some((card) => card.key === 'complete_valuation_presentation' && card.pending === true), true)
  assert.equal(model.actionCards.some((card) => card.key === 'mark_seller_lead_lost'), true)
  assert.equal(model.actionCards.some((card) => card.key === 'prepare_listing'), true)
  assertPartnerReadinessHidesInternalKeys(model)
}

{
  const payload = buildSellerProcessShadowIntegration({
    organisationSettings: {
      sellerProcess: {
        profile: 'kingstons_residential',
      },
    },
    lead: {
      status: 'new',
    },
    activities: [],
    appointments: [],
    documents: [],
  })
  const model = buildSellerProcessWorkspacePanelModel({
    [SELLER_PROCESS_SHADOW_WORKSPACE_KEY]: payload,
  })
  assert.equal(model.visible, true)
  assert.equal(model.currentStageLabel, 'First Contact')
  assert.equal(model.actionCards[0].key, 'contact_seller')
  assert.equal(model.actionCards[0].label, 'Log First Contact')
}

{
  const model = buildSellerProcessWorkspacePanelModel({
    row: {
      leadId: 'lead-kingstons-route-state',
      organisationId: 'ec19d0a6-bcba-4eef-aa72-9972de88204d',
      stage: 'Contacted',
      status: 'Active',
    },
    appointments: [],
    listings: [],
    documentPackets: [],
    timeline: [],
  })
  assert.equal(model.visible, true)
  assert.equal(model.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
  assert.equal(model.title, 'Kingstons Seller Process')
  assert.equal(model.currentStageLabel, 'Valuation Appointment')
  assert.equal(model.actionCards.find((card) => card.key === 'schedule_valuation_appointment').pending, true)
}

{
  const model = buildSellerProcessWorkspacePanelModel({
    row: {
      leadId: 'lead-kingstons-activity-alias',
      organisationId: 'ec19d0a6-bcba-4eef-aa72-9972de88204d',
      stage: 'New Lead',
      status: 'New',
    },
    activities: [
      {
        activityId: 'activity-contacted',
        leadId: 'lead-kingstons-activity-alias',
        activityType: 'Seller Contact - Call',
        status: 'completed',
      },
    ],
    appointments: [],
    listings: [],
    documentPackets: [],
  })
  assert.equal(model.visible, true)
  assert.equal(model.currentStageLabel, 'Valuation Appointment')
  assert.equal(model.actionCards.find((card) => card.key === 'contact_seller'), undefined)
  assert.equal(model.actionCards.find((card) => card.key === 'schedule_valuation_appointment').pending, true)
}

{
  const model = buildSellerProcessWorkspacePanelModel({
    row: {
      leadId: 'lead-kingstons-owner-email',
      assignedAgentEmail: 'alex.kingstons.training@arch9.test',
      stage: 'Contacted',
      status: 'Active',
    },
  })
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
    lead: {
      status: 'contacted',
      rawEnquiryPayload: {
        kingstonsListingTerms: {
          commissionConfirmed: true,
          transferAttorneyNominated: true,
          commission: { type: 'percentage', percentage: 5, confirmed: true },
          transferAttorney: { companyName: 'Kingstons Conveyancers', email: 'transfers@example.test', nominated: true },
        },
      },
    },
    appointments: [
      { appointmentType: 'seller_valuation', status: 'completed' },
      { appointmentType: 'valuation_presentation', status: 'completed' },
    ],
    documents: [
      { documentType: 'valuation_document', status: 'uploaded', fileUrl: 'valuation.pdf' },
      { key: 'signed_mandate', documentType: 'signed_mandate', source: 'kingstons_seller_pack', status: 'uploaded', file_path: 'mandate.pdf', sellerType: 'natural' },
      { key: 'signed_disclosure_form', documentType: 'signed_disclosure_form', source: 'kingstons_seller_pack', status: 'signed', file_path: 'defects.pdf', sellerType: 'natural' },
      {
        key: 'signed_fica_declaration',
        documentType: 'signed_fica_declaration',
        source: 'kingstons_seller_pack',
        status: 'uploaded',
        file_path: 'fica.pdf',
        sellerType: 'natural',
        completionRoute: 'physical_upload_with_context',
        physicalUploadContextRequired: true,
        ficaDeclarationContext: {
          sellerType: 'natural',
          contextCapturedAt: '2026-08-15T08:00:00.000Z',
        },
      },
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
  assert.equal(model.partnerReadiness.every((partner) => partner.ready === false), true)
  assertPartnerReadinessHidesInternalKeys(model)
}

{
  const payload = buildSellerProcessShadowIntegration({
    organisationSettings: {
      sellerProcess: {
        profile: 'kingstons_residential',
      },
    },
    lead: {
      status: 'seller_pack',
      rawEnquiryPayload: {
        kingstonsSellerPack: {
          sellerType: 'natural',
          sellerPackDetailsCapturedAt: '2026-08-17T20:54:12.992Z',
          legalPath: {
            sellerType: 'natural',
            owners: [{ id: 'owner-1', name: 'Alexander Landman', email: 'alex@example.test' }],
          },
        },
      },
    },
    appointments: [
      { appointmentType: 'seller_valuation', status: 'completed' },
      { appointmentType: 'valuation_presentation', status: 'completed' },
    ],
    documents: [
      { documentType: 'valuation_document', status: 'uploaded', file_path: 'valuation.pdf' },
      { key: 'signed_mandate', documentType: 'signed_mandate', source: 'kingstons_seller_pack', status: 'uploaded', file_path: 'mandate.pdf' },
      { key: 'signed_disclosure_form', documentType: 'signed_disclosure_form', source: 'kingstons_seller_pack', status: 'uploaded', file_path: 'defects.pdf' },
      {
        key: 'signed_fica_declaration',
        documentType: 'signed_fica_declaration',
        source: 'kingstons_seller_pack',
        status: 'uploaded',
        file_path: 'fica.pdf',
        sellerType: 'natural',
        completionRoute: 'physical_upload_with_context',
        physicalUploadContextRequired: true,
        ficaDeclarationContext: {
          sellerType: 'natural',
          contextCapturedAt: '2026-08-17T20:54:37.706Z',
        },
      },
      { key: 'seller_fica_owner_1_id_or_passport', source: 'kingstons_roleplayer_fica_checklist_v1', requirementLane: 'ownership_driven', documentRequirementSection: 'seller_identity_fica', status: 'required' },
      { key: 'seller_fica_owner_1_proof_of_address', source: 'kingstons_roleplayer_fica_checklist_v1', requirementLane: 'ownership_driven', documentRequirementSection: 'seller_identity_fica', status: 'required' },
      { key: 'seller_fica_owner_1_tax_number_confirmation', source: 'kingstons_roleplayer_fica_checklist_v1', requirementLane: 'ownership_driven', documentRequirementSection: 'seller_identity_fica', status: 'required' },
      { key: 'seller_fica_owner_1_signed_fica_declaration', source: 'kingstons_roleplayer_fica_checklist_v1', requirementLane: 'ownership_driven', documentRequirementSection: 'seller_identity_fica', status: 'required' },
    ],
  })
  const model = buildSellerProcessWorkspacePanelModel({
    [SELLER_PROCESS_SHADOW_WORKSPACE_KEY]: payload,
  })
  assert.equal(model.visible, true)
  assert.equal(model.currentStageLabel, 'List Property')
  assert.equal(model.actionCards.find((card) => card.key === 'complete_seller_pack')?.pending, false)
  assert.equal(model.actionCards.find((card) => card.key === 'prepare_listing')?.pending, true)
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
