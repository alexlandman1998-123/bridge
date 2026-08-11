import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { KINGSTONS_SELLER_PROCESS_PROFILE } from '../src/services/sellerProcessProfileService.js'
import {
  buildKingstonsSellerProcessActionModel,
  getKingstonsSellerProcessActionBlueprints,
} from '../src/services/sellerProcessActionModelService.js'
import {
  buildSellerProcessEvidenceContext,
  summarizeSellerProcessEvidenceContext,
} from '../src/services/sellerProcessEvidenceMappingService.js'
import {
  buildKingstonsSellerProcessRailModel,
  getKingstonsSellerProcessRailBlueprint,
} from '../src/services/sellerProcessRailModelService.js'
import { buildSellerProcessProjectionBundle } from '../src/services/sellerProcessProjectionService.js'
import { buildSellerProcessWorkspacePanelModel } from '../src/services/sellerProcessWorkspacePanelService.js'

const source = {
  sellerProcessProfile: KINGSTONS_SELLER_PROCESS_PROFILE,
  row: {
    leadId: 'kingstons-phase4-lead',
    leadCategory: 'seller',
    listingId: 'kingstons-phase4-listing',
    leadActivities: [
      { activityType: 'seller_contact_call', status: 'completed' },
    ],
    appointments: [
      { appointmentType: 'seller_valuation', status: 'confirmed' },
      { appointmentType: 'valuation_presentation', status: 'scheduled' },
    ],
    documents: [
      { key: 'valuation_document', documentType: 'valuation_document', status: 'uploaded', fileUrl: 'valuation.pdf' },
      { key: 'signed_mandate', documentType: 'signed_mandate', source: 'kingstons_seller_pack', status: 'signed', fileUrl: 'mandate.pdf', sellerType: 'natural' },
      { key: 'signed_defect_form', documentType: 'signed_defect_form', source: 'kingstons_seller_pack', status: 'uploaded', fileUrl: 'defects.pdf', sellerType: 'natural' },
      { key: 'signed_fica_form', documentType: 'signed_fica_form', source: 'kingstons_seller_pack', status: 'uploaded', fileUrl: 'fica.pdf', sellerType: 'natural' },
    ],
    rawEnquiryPayload: {
      kingstonsSellerPack: {
        sellerType: 'natural',
        legalPath: { sellerType: 'natural' },
      },
      kingstonsListingTerms: {
        commissionConfirmed: true,
        transferAttorneyNominated: true,
        commission: { type: 'percentage', percentage: 5, confirmed: true },
        transferAttorney: { companyName: 'Kingstons Conveyancers', email: 'transfers@example.test', nominated: true },
      },
    },
  },
  listings: [
    {
      id: 'kingstons-phase4-listing',
      sellerLeadId: 'kingstons-phase4-lead',
      status: 'draft',
      mandatePacketId: 'mandate-packet-1',
      documents: [
        { key: 'title_deed_copy', status: 'uploaded', fileUrl: 'title.pdf' },
      ],
    },
  ],
  documentPackets: [
    {
      id: 'mandate-packet-1',
      packetType: 'mandate',
      status: 'completed',
      signingSummary: { allSignersSigned: true },
    },
  ],
}

const evidenceContext = buildSellerProcessEvidenceContext(source)
assert.equal(evidenceContext.lead.leadId, 'kingstons-phase4-lead')
assert.equal(evidenceContext.listing.id, 'kingstons-phase4-listing')
assert.equal(evidenceContext.mandatePacket.id, 'mandate-packet-1')
assert.equal(evidenceContext.appointments.length, 2)
assert.equal(evidenceContext.documents.length, 5)

const evidenceSummary = summarizeSellerProcessEvidenceContext(source)
assert.equal(evidenceSummary.hasLead, true)
assert.equal(evidenceSummary.hasListing, true)
assert.equal(evidenceSummary.hasMandatePacket, true)

const actionBlueprints = getKingstonsSellerProcessActionBlueprints()
assert.deepEqual(
  actionBlueprints.map((action) => action.key),
  [
    'contact_seller',
    'schedule_valuation_appointment',
    'upload_valuation_document',
    'schedule_valuation_presentation',
    'resend_valuation_presentation',
    'complete_seller_pack',
    'prepare_listing',
  ],
)

const actionModel = buildKingstonsSellerProcessActionModel(source)
assert.equal(actionModel.visible, true)
assert.equal(actionModel.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
assert.equal(actionModel.canReplaceGlobalNextBestAction, true)
assert.equal(actionModel.actions.some((action) => action.key === 'upload_valuation_document' && action.complete), true)
assert.equal(actionModel.actions.some((action) => action.key === 'prepare_listing'), true)

const railBlueprint = getKingstonsSellerProcessRailBlueprint()
assert.deepEqual(
  railBlueprint.map((stage) => stage.key),
  ['first_contact', 'valuation_appointment', 'formal_valuation', 'valuation_presentation', 'seller_pack', 'list_property'],
)

const railModel = buildKingstonsSellerProcessRailModel(source)
assert.equal(railModel.visible, true)
assert.equal(railModel.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
assert.equal(railModel.canReplaceSellerJourney, false)
assert.equal(railModel.stages.some((stage) => stage.key === 'formal_valuation' && stage.complete), true)
assert.equal(railModel.stages.some((stage) => stage.key === 'list_property'), true)

const projectionBundle = buildSellerProcessProjectionBundle(evidenceContext)
assert.equal(projectionBundle.surface.profile, KINGSTONS_SELLER_PROCESS_PROFILE)
assert.equal(projectionBundle.surface.canReplaceJourney, false)
assert.equal(projectionBundle.partners.attorney_firm.exposesInternalProcessStages, false)
assert.equal(projectionBundle.partners.bond_originator.exposesInternalProcessStages, false)

const panelModel = buildSellerProcessWorkspacePanelModel({
  sellerProcessProfile: KINGSTONS_SELLER_PROCESS_PROFILE,
  row: source.row,
  listings: source.listings,
  documentPackets: source.documentPackets,
})
assert.equal(panelModel.visible, true)
assert.equal(panelModel.title, 'Kingstons Seller Process')
assert.equal(panelModel.actionCards.some((action) => action.key === 'schedule_valuation_appointment'), true)
assert.equal(panelModel.partnerReadiness.every((partner) => partner.exposesInternalProcessStages === false), true)

const agentLeadsSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
const agencyPipelineSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const appointmentsWorkspaceSource = await readFile(new URL('../src/components/appointments/KingstonsSellerAppointmentsWorkspace.jsx', import.meta.url), 'utf8')

assert.match(agentLeadsSource, /buildSellerProcessWorkspacePanelModel/)
assert.match(agentLeadsSource, /KingstonsNextBestActionCard/)
assert.match(agentLeadsSource, /SellerProcessShadowPanel/)
assert.match(agencyPipelineSource, /KingstonsSellerAppointmentsWorkspace/)
assert.match(agencyPipelineSource, /selectedLeadHasKingstonsSellerProcess/)
assert.match(agencyPipelineSource, /Kingstons Seller Process/)
assert.match(appointmentsWorkspaceSource, /Schedule Valuation Appointment/)
assert.match(appointmentsWorkspaceSource, /AppointmentCard/)

console.log('forward-port Kingstons seller process Phase 4 checks passed')
