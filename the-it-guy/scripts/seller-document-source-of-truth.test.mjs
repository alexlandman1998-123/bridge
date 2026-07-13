import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SELLER_DOCUMENT_SOURCE_OF_TRUTH,
  SELLER_DOCUMENT_TOUCHPOINTS,
  buildSellerDocumentSourceOfTruth,
} from '../src/services/sellerDocumentRequirementsService.js'

const mandatePacket = {
  state: 'completed',
  packet: {
    id: 'packet-1',
    status: 'completed',
  },
  version: {
    id: 'version-1',
    final_signed_file_path: 'mandates/listing-1/signed-mandate.pdf',
    final_signed_file_name: 'Signed Mandate.pdf',
    final_signed_file_bucket: 'documents',
    finalised_at: '2026-07-01T08:00:00Z',
  },
}

const listing = {
  id: 'listing-1',
  sellerLeadId: 'seller-lead-1',
  listingStatus: 'active',
  sellerOnboardingStatus: 'completed',
  mandateStatus: 'signed',
  sellerOnboarding: {
    status: 'completed',
    formData: {
      sellerType: 'natural_person',
      propertyStructureType: 'full_title',
      gasInstallation: true,
      solarInstallation: true,
    },
  },
}

const source = buildSellerDocumentSourceOfTruth({ listing, mandatePacket })
const keys = source.rows.map((row) => row.key)

assert.equal(source.contractVersion, 'seller_document_source_v1')
assert.equal(source.sourceOfTruth, SELLER_DOCUMENT_SOURCE_OF_TRUTH)
assert.deepEqual(source.touchpoints, SELLER_DOCUMENT_TOUCHPOINTS)
assert.equal(source.context.type, 'private_listing')
assert.equal(source.context.id, 'listing-1')
assert.equal(source.context.sellerLeadId, 'seller-lead-1')

assert.deepEqual(keys, [
  'signed_mandate',
  'title_deed_copy',
  'rates_account',
  'property_condition_disclosure',
  'id_document',
  'proof_of_address',
  'gas_compliance_certificate',
  'solar_compliance_documents',
])

const signedMandate = source.rows.find((row) => row.key === 'signed_mandate')
assert.equal(signedMandate.complete, true)
assert.equal(signedMandate.status, 'completed')
assert.equal(signedMandate.statusBucket, 'approved')
assert.equal(signedMandate.hasUpload, true)
assert.equal(signedMandate.source.requirement, 'generated_seller_requirement')
assert.equal(signedMandate.source.document, 'document_packets.final_signed_artifact')
assert.equal(signedMandate.upload.filePath, 'mandates/listing-1/signed-mandate.pdf')

const gasCertificate = source.rows.find((row) => row.key === 'gas_compliance_certificate')
assert.equal(gasCertificate.category, 'property')
assert.equal(gasCertificate.blocking, true)
assert.equal(gasCertificate.source.document, 'none')

const solarDocuments = source.rows.find((row) => row.key === 'solar_compliance_documents')
assert.equal(solarDocuments.category, 'property')
assert.equal(solarDocuments.blocking, true)

assert.deepEqual(source.summary, {
  total: 8,
  totalRequired: 8,
  complete: 1,
  completeRequired: 1,
  blocking: 7,
  uploaded: 1,
  outstanding: 7,
  underReview: 0,
  approved: 1,
  rejected: 0,
  byCategory: {
    property: 6,
    fica: 2,
  },
})

const listingDetailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
assert.match(listingDetailSource, /buildSellerDocumentSourceOfTruth/)
assert.match(listingDetailSource, /mapSellerDocumentSourceRowForListing/)
assert.doesNotMatch(listingDetailSource, /const suggested = \[/)

const agentLeadsSource = readFileSync(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
assert.match(agentLeadsSource, /buildSellerDocumentSourceOfTruth/)
assert.match(agentLeadsSource, /buildSellerDocumentRowsFromSource/)
assert.match(agentLeadsSource, /mandatePacketStatus=\{mandatePacketStatus\}/)

console.log('seller document source-of-truth tests passed')
