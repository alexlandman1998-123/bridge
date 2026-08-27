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
  'signed_disclosure_form',
  'signed_fica_declaration',
  'title_deed_copy',
  'rates_account',
  'id_document',
  'proof_of_address',
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

const propertyDisclosure = source.rows.find((row) => row.key === 'signed_disclosure_form')
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

const ficaDeclaration = source.rows.find((row) => row.key === 'signed_fica_declaration')
assert.equal(ficaDeclaration.complete, true)
assert.equal(ficaDeclaration.category, 'sales')
assert.equal(ficaDeclaration.status, 'completed')
assert.equal(ficaDeclaration.statusBucket, 'approved')
assert.equal(ficaDeclaration.hasUpload, true)
assert.equal(ficaDeclaration.source.requirement, 'generated_seller_requirement')
assert.equal(ficaDeclaration.source.document, SELLER_DOCUMENT_SOURCE_OF_TRUTH.sellerOnboardingFicaDeclarationSource)
assert.equal(ficaDeclaration.upload.source, SELLER_DOCUMENT_SOURCE_OF_TRUTH.sellerOnboardingFicaDeclarationSource)
assert.equal(ficaDeclaration.upload.completionRoute, 'seller_onboarding_link_completed')
assert.equal(ficaDeclaration.upload.supportingFicaDocumentsDynamic, true)

const titleDeed = source.rows.find((row) => row.key === 'title_deed_copy')
assert.equal(titleDeed.category, 'property')
assert.equal(titleDeed.blocking, true)

const gasCertificate = source.rows.find((row) => row.key === 'gas_compliance_certificate')
assert.equal(gasCertificate.category, 'property')
assert.equal(gasCertificate.blocking, true)
assert.equal(gasCertificate.source.document, 'none')

const solarDocuments = source.rows.find((row) => row.key === 'solar_compliance_documents')
assert.equal(solarDocuments.category, 'property')
assert.equal(solarDocuments.blocking, true)

assert.deepEqual(source.summary, {
  total: 9,
  totalRequired: 9,
  complete: 3,
  completeRequired: 3,
  blocking: 6,
  uploaded: 3,
  outstanding: 6,
  underReview: 0,
  approved: 3,
  rejected: 0,
  byCategory: {
    sales: 3,
    property: 4,
    fica: 2,
  },
})

const listingDetailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
assert.match(listingDetailSource, /buildSellerDocumentSourceOfTruth/)
assert.match(listingDetailSource, /mapSellerDocumentSourceRowForListing/)
assert.doesNotMatch(listingDetailSource, /const suggested = \[/)

const agencyPipelineSource = readFileSync(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
assert.match(agencyPipelineSource, /buildSellerDocumentSourceOfTruth/)
assert.match(agencyPipelineSource, /buildSellerLeadDocumentRowsFromSource/)
assert.match(agencyPipelineSource, /mandatePacketStatus/)
assert.match(agencyPipelineSource, /row\?\.generatedHtml/)
assert.match(agencyPipelineSource, /!generatedDocumentComplete/)

console.log('seller document source-of-truth tests passed')
