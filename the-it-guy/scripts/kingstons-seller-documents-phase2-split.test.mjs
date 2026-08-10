import assert from 'node:assert/strict'

import {
  buildKingstonsSellerDocumentRequirementPack,
  buildSellerDocumentSourceOfTruth,
  getSellerRequiredDocuments,
} from '../src/services/sellerDocumentRequirementsService.js'

const baselineKeys = [
  'valuation_document',
  'signed_mandate',
  'signed_defect_form',
  'signed_fica_form',
]

const persistedOwnershipDrivenRequirement = {
  key: 'owner_fica_alexander_landman',
  requirement_key: 'owner_fica_alexander_landman',
  name: 'Owner FICA: Alexander Landman',
  requirement_name: 'Owner FICA: Alexander Landman',
  description: 'FICA supporting document for the captured natural owner.',
  group: 'fica',
  category: 'legal',
  status: 'required',
  is_required: true,
  requirementLane: 'ownership_driven',
  requirement_lane: 'ownership_driven',
  documentRequirementSection: 'seller_identity_fica',
  document_requirement_section: 'seller_identity_fica',
}

function keysFor(rows = []) {
  return rows.map((row) => row.key || row.requirement_key).sort()
}

const kingstonsLeadBeforeCapture = {
  id: 'listing-kingstons-phase2-before-capture',
  organisationId: 'kingstons',
  sellerProcessProfile: 'kingstons_residential',
  documentRequirements: [
    {
      key: 'seller_contact_confirmation',
      requirement_key: 'seller_contact_confirmation',
      name: 'Seller Contact Confirmation',
      status: 'required',
      is_required: true,
    },
    persistedOwnershipDrivenRequirement,
  ],
}

const beforeCapturePack = buildKingstonsSellerDocumentRequirementPack(kingstonsLeadBeforeCapture)
assert.equal(beforeCapturePack.version, 'kingstons_seller_documents_phase6_authority_documents_v1')
assert.equal(beforeCapturePack.ownershipCapture.captured, false)
assert.equal(beforeCapturePack.ownershipDrivenState, 'pending_capture')
assert.deepEqual(keysFor(beforeCapturePack.baselineDocuments), [...baselineKeys].sort())
assert.deepEqual(keysFor(beforeCapturePack.ownershipDrivenDocuments), [])
assert.deepEqual(keysFor(beforeCapturePack.requiredDocuments), [...baselineKeys].sort())
assert.deepEqual(keysFor(getSellerRequiredDocuments(kingstonsLeadBeforeCapture)), [...baselineKeys].sort())

const kingstonsLeadAfterCapture = {
  ...kingstonsLeadBeforeCapture,
  id: 'listing-kingstons-phase2-after-capture',
  kingstonsSellerPack: {
    sellerType: 'natural',
    sellerPackDetailsCapturedAt: '2026-08-09T12:00:00.000Z',
    legalPath: {
      legalPathType: 'natural',
      natural: {
        maritalSetup: 'single',
      },
    },
  },
}

const afterCapturePack = buildKingstonsSellerDocumentRequirementPack(kingstonsLeadAfterCapture)
assert.equal(afterCapturePack.ownershipCapture.captured, true)
assert.equal(afterCapturePack.ownershipCapture.sellerType, 'natural')
assert.equal(afterCapturePack.ownershipDrivenState, 'ready_for_generation')
assert.deepEqual(keysFor(afterCapturePack.baselineDocuments), [...baselineKeys].sort())
assert.deepEqual(keysFor(afterCapturePack.ownershipDrivenDocuments), ['owner_fica_alexander_landman'])
assert.deepEqual(keysFor(afterCapturePack.requiredDocuments), [...baselineKeys, 'owner_fica_alexander_landman'].sort())

const sourceOfTruth = buildSellerDocumentSourceOfTruth({ listing: kingstonsLeadAfterCapture })
assert.equal(sourceOfTruth.requirementPack.ownershipCapture.captured, true)
assert.equal(sourceOfTruth.requirementPack.baselineDocuments.length, 4)
assert.equal(sourceOfTruth.requirementPack.ownershipDrivenDocuments.length, 1)
assert.equal(sourceOfTruth.summary.totalRequired, 5)

const ownershipRow = sourceOfTruth.rows.find((row) => row.key === 'owner_fica_alexander_landman')
assert.equal(ownershipRow?.requirementLane, 'ownership_driven')
assert.equal(ownershipRow?.documentRequirementSection, 'seller_identity_fica')

console.log('Kingstons seller documents Phase 2 static/dynamic split checks passed.')
