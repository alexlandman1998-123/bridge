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
  organisationName: 'Produktive Real Estate',
  agencyLogoUrl: '/assets/produktive-logo.png',
  organisationWebsite: 'https://produktiverealty.co.za/',
  agencyEmail: 'alex-produktive.training@arch9.test',
  sellerOnboarding: {
    status: 'completed',
    formData: {
      sellerType: 'natural_person',
      propertyStructureType: 'full_title',
      gasInstallation: true,
      solarInstallation: true,
      propertyDisclosure: {
        roof: { status: 'good', comments: 'No known defects' },
        generatedDocument: {
          id: 'disclosure-1',
          title: 'Property Condition Disclosure',
          fileName: 'property-condition-disclosure.pdf',
          generatedAt: '2026-07-01T08:05:00Z',
        },
      },
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
  'seller_bank_account_confirmation',
  'seller_tax_number',
  'property_acquisition_record',
  'capital_improvement_records',
  'gas_compliance_certificate',
  'solar_compliance_documents',
])

const signedMandate = source.rows.find((row) => row.key === 'signed_mandate')
assert.equal(signedMandate.complete, true)
assert.equal(signedMandate.category, 'sales')
assert.equal(signedMandate.status, 'completed')
assert.equal(signedMandate.statusBucket, 'approved')
assert.equal(signedMandate.hasUpload, true)
assert.equal(signedMandate.source.requirement, 'generated_seller_requirement')
assert.equal(signedMandate.source.document, 'document_packets.final_signed_artifact')
assert.equal(signedMandate.upload.filePath, 'mandates/listing-1/signed-mandate.pdf')

const strippedFinalArtifactSource = buildSellerDocumentSourceOfTruth({
  ...listing,
  mandatePacket: {
    id: 'packet-1',
    state: 'fully_signed',
    packetVersionId: 'version-1',
    finalSignedRecorded: true,
    finalSignedFileName: 'Signed Mandate.pdf',
    version: {
      id: 'version-1',
      final_signed_file_name: 'Signed Mandate.pdf',
    },
  },
})
const strippedFinalArtifactMandate = strippedFinalArtifactSource.rows.find((row) => row.key === 'signed_mandate')
assert.equal(strippedFinalArtifactMandate.complete, true)
assert.equal(strippedFinalArtifactMandate.status, 'completed')
assert.equal(strippedFinalArtifactMandate.source.document, 'document_packets.final_signed_artifact')
assert.equal(strippedFinalArtifactMandate.packetId, 'packet-1')
assert.equal(strippedFinalArtifactMandate.packetVersionId, 'version-1')
assert.equal(strippedFinalArtifactMandate.upload.filePath, '')

const propertyDisclosure = source.rows.find((row) => row.key === 'property_condition_disclosure')
assert.equal(propertyDisclosure.complete, true)
assert.equal(propertyDisclosure.category, 'sales')
assert.equal(propertyDisclosure.status, 'completed')
assert.equal(propertyDisclosure.statusBucket, 'approved')
assert.equal(propertyDisclosure.hasUpload, true)
assert.match(propertyDisclosure.upload.generatedHtml, /Declaration by Seller/)
assert.match(propertyDisclosure.upload.generatedHtml, /Produktive Real Estate/)
assert.match(propertyDisclosure.upload.generatedHtml, /produktive-logo\.png/)
assert.doesNotMatch(propertyDisclosure.upload.generatedHtml, />Agency Workspace</)
assert.equal(propertyDisclosure.upload.generatedFileName, 'property-condition-disclosure.pdf')

const titleDeed = source.rows.find((row) => row.key === 'title_deed_copy')
assert.equal(titleDeed.category, 'property')

const bankConfirmation = source.rows.find((row) => row.key === 'seller_bank_account_confirmation')
assert.equal(bankConfirmation.title, 'Seller Bank Account Confirmation')
assert.equal(bankConfirmation.category, 'property')
assert.equal(bankConfirmation.required, false)
assert.equal(bankConfirmation.status, 'required')

const acquisitionRecord = source.rows.find((row) => row.key === 'property_acquisition_record')
assert.equal(acquisitionRecord.title, 'Original Property Acquisition Record')
assert.equal(acquisitionRecord.category, 'property')
assert.equal(acquisitionRecord.required, false)
assert.equal(acquisitionRecord.status, 'required')
assert.equal(titleDeed.blocking, true)

const gasCertificate = source.rows.find((row) => row.key === 'gas_compliance_certificate')
assert.equal(gasCertificate.category, 'property')
assert.equal(gasCertificate.blocking, true)
assert.equal(gasCertificate.source.document, 'none')

const solarDocuments = source.rows.find((row) => row.key === 'solar_compliance_documents')
assert.equal(solarDocuments.category, 'property')
assert.equal(solarDocuments.blocking, true)

assert.deepEqual(source.summary, {
  total: 12,
  totalRequired: 8,
  complete: 2,
  completeRequired: 2,
  blocking: 6,
  uploaded: 2,
  outstanding: 10,
  underReview: 0,
  approved: 2,
  rejected: 0,
  byCategory: {
    sales: 2,
    property: 8,
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
