import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildSellerProcessEvidenceContext,
  summarizeSellerProcessEvidenceContext,
} from '../src/services/sellerProcessEvidenceMappingService.js'
import { evaluateSellerProcess } from '../src/services/sellerProcessEvaluationService.js'
import { buildKingstonsSellerProcessRailModel } from '../src/services/sellerProcessRailModelService.js'
import { buildSellerLeadWorkspaceShadowIntegration } from '../src/services/sellerProcessWorkspaceIntegrationService.js'

const appRoot = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const evidenceMapperSource = readFileSync(resolve(appRoot, 'src/services/sellerProcessEvidenceMappingService.js'), 'utf8')
const railModelSource = readFileSync(resolve(appRoot, 'src/services/sellerProcessRailModelService.js'), 'utf8')
const workspaceIntegrationSource = readFileSync(resolve(appRoot, 'src/services/sellerProcessWorkspaceIntegrationService.js'), 'utf8')
const phase6Doc = readFileSync(resolve(appRoot, 'docs/seller-process-phase6-evidence-mapping.md'), 'utf8')

const kingstonsProfile = {
  sellerProcessProfile: 'kingstons_residential',
}

const mixedWorkspaceContext = {
  ...kingstonsProfile,
  row: {
    leadId: 'lead-kingston-evidence',
    status: 'New',
    listingId: 'listing-kingston-evidence',
    documentPackets: [
      { id: 'packet-other', packetType: 'other', status: 'draft' },
      { id: 'packet-mandate', packetType: 'mandate', status: 'completed' },
    ],
    communicationTimeline: [
      { activityType: 'WhatsApp seller contact', status: 'completed' },
    ],
  },
  appointments: [
    { appointment_type: 'seller_valuation', status: 'completed' },
  ],
  listings: [
    {
      id: 'listing-kingston-evidence',
      sellerLeadId: 'lead-kingston-evidence',
      listingStatus: 'created',
      mandatePacketId: 'packet-mandate',
      appointments: [
        { appointmentType: 'valuation_presentation', appointmentStatus: 'completed' },
      ],
      documents: [
        { document_type: 'valuation_document', status: 'uploaded', file_path: 'valuation.pdf' },
        { document_type: 'defects_disclosure_form', status: 'signed', file_path: 'defects.pdf' },
      ],
      seller_documents: [
        { documentType: 'seller_fica_pack', status: 'uploaded', fileUrl: 'fica.pdf' },
      ],
    },
  ],
}

{
  const evidenceContext = buildSellerProcessEvidenceContext(mixedWorkspaceContext)
  assert.equal(evidenceContext.lead.leadId, 'lead-kingston-evidence')
  assert.equal(evidenceContext.listing.id, 'listing-kingston-evidence')
  assert.equal(evidenceContext.appointments.length, 2)
  assert.equal(evidenceContext.documents.length, 3)
  assert.equal(evidenceContext.activities.length, 1)
  assert.equal(evidenceContext.mandatePacket.id, 'packet-mandate')
  assert.equal(evidenceContext.mandatePacketStatus.packet.id, 'packet-mandate')

  const summary = summarizeSellerProcessEvidenceContext(mixedWorkspaceContext)
  assert.deepEqual(summary, {
    hasLead: true,
    hasListing: true,
    appointmentCount: 2,
    documentCount: 3,
    activityCount: 1,
    hasMandatePacket: true,
  })
}

{
  const evaluation = evaluateSellerProcess(buildSellerProcessEvidenceContext(mixedWorkspaceContext))
  assert.equal(evaluation.evidence.seller_contacted.satisfied, true)
  assert.equal(evaluation.evidence.valuation_appointment_scheduled.satisfied, true)
  assert.equal(evaluation.evidence.valuation_document_uploaded.satisfied, true)
  assert.equal(evaluation.evidence.valuation_presentation_scheduled.satisfied, true)
  assert.equal(evaluation.evidence.valuation_presented.satisfied, true)
  assert.equal(evaluation.evidence.mandate_signed.satisfied, true)
  assert.equal(evaluation.evidence.defects_form_signed.satisfied, true)
  assert.equal(evaluation.evidence.fica_pack_signed.satisfied, true)
  assert.equal(evaluation.evidence.listing_ready.satisfied, true)
  assert.equal(evaluation.summary.percent, 100)
}

{
  const railModel = buildKingstonsSellerProcessRailModel(mixedWorkspaceContext)
  assert.equal(railModel.visible, true)
  assert.equal(railModel.percent, 100)
  assert.equal(railModel.stages.find((stage) => stage.key === 'valuation_presentation')?.complete, true)
  assert.equal(railModel.stages.find((stage) => stage.key === 'seller_pack')?.complete, true)
}

{
  const integration = buildSellerLeadWorkspaceShadowIntegration(mixedWorkspaceContext)
  assert.equal(integration.profile, 'kingstons_residential')
  assert.equal(integration.sellerLeadWorkspace.percent, 100)
  assert.deepEqual(integration.sellerDocumentCenter.missingDocumentEvidenceKeys, [])
  assert.equal(integration.partners.attorneyFirm.ready, true)
  assert.equal(integration.partners.exposesInternalProcessStages, false)
}

{
  assert.match(evidenceMapperSource, /export function buildSellerProcessEvidenceContext/)
  assert.match(evidenceMapperSource, /export function summarizeSellerProcessEvidenceContext/)
  assert.match(evidenceMapperSource, /communicationTimeline/)
  assert.match(evidenceMapperSource, /seller_documents/)
  assert.match(railModelSource, /buildSellerProcessEvidenceContext/)
  assert.match(workspaceIntegrationSource, /buildSellerProcessEvidenceContext/)
  assert.doesNotMatch(evidenceMapperSource, /updateAgencyCrmLeadRecord/)
  assert.doesNotMatch(evidenceMapperSource, /uploadPrivateListingDocument/)
  assert.doesNotMatch(evidenceMapperSource, /createAppointmentAsync/)
  assert.match(phase6Doc, /Evidence Mapping/)
  assert.match(phase6Doc, /read-only adapter/)
  assert.match(phase6Doc, /does not write/)
  assert.equal(
    packageJson.scripts?.['test:seller-process-evidence-mapping-phase6'],
    'node scripts/seller-process-evidence-mapping-phase6.test.mjs',
  )
}

console.log('seller process evidence mapping Phase 6 contract passed')
