import assert from 'node:assert/strict'

import {
  buildKingstonsSellerDocumentRequirementPack,
  buildSellerDocumentSourceOfTruth,
} from '../src/services/sellerDocumentRequirementsService.js'

const sellerPack = {
  sellerType: 'natural',
  sellerPackDetailsCapturedAt: '2026-08-09T14:00:00.000Z',
  legalPath: {
    legalPathType: 'natural',
    owners: [
      { name: 'Alexander Landman', idNumber: '9001015009087' },
    ],
    natural: {
      maritalSetup: 'not_married',
    },
  },
  documents: {
    owner_fica_9001015009087: {
      key: 'owner_fica_9001015009087',
      requirementKey: 'owner_fica_9001015009087',
      label: 'Owner FICA: Alexander Landman',
      status: 'uploaded',
      fileName: 'alexander-owner-fica.pdf',
      uploadedFileName: 'alexander-owner-fica.pdf',
      storageBucket: 'seller-pack',
      storagePath: 'kingstons/leads/lead-123/owner-fica.pdf',
      url: 'https://example.test/owner-fica.pdf',
      requirementLane: 'ownership_driven',
      documentRequirementSection: 'seller_identity_fica',
      partyRole: 'owner',
      partyName: 'Alexander Landman',
    },
  },
}

const listing = {
  id: 'listing-123',
  organisationId: 'kingstons',
  sellerProcessProfile: 'kingstons_residential',
  rawEnquiryPayload: JSON.stringify({
    kingstonsSellerPack: sellerPack,
  }),
}

const pack = buildKingstonsSellerDocumentRequirementPack(listing)
assert.equal(pack.version, 'kingstons_seller_documents_phase6_authority_documents_v1')
assert.deepEqual(
  pack.generatedOwnershipDrivenDocuments.map((row) => row.key),
  ['owner_fica_9001015009087'],
)

const source = buildSellerDocumentSourceOfTruth({ listing })
const ownerFicaRow = source.rows.find((row) => row.key === 'owner_fica_9001015009087')

assert.ok(ownerFicaRow, 'expected owner FICA row to be generated for the captured seller pack')
assert.equal(ownerFicaRow.status, 'uploaded')
assert.equal(ownerFicaRow.complete, true)
assert.equal(ownerFicaRow.hasUpload, true)
assert.equal(ownerFicaRow.requirementLane, 'ownership_driven')
assert.equal(ownerFicaRow.documentRequirementSection, 'seller_identity_fica')
assert.equal(ownerFicaRow.upload.fileName, 'alexander-owner-fica.pdf')
assert.equal(ownerFicaRow.upload.url, 'https://example.test/owner-fica.pdf')

console.log('Kingstons seller documents Phase 5 workspace integration checks passed.')
