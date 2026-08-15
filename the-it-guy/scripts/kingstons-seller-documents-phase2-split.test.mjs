import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildKingstonsSellerDocumentRequirementPack,
  buildSellerDocumentSourceOfTruth,
  getSellerRequiredDocuments,
} from '../src/services/sellerDocumentRequirementsService.js'

const baselineKeys = [
  'valuation_document',
  'signed_mandate',
  'signed_disclosure_form',
  'signed_fica_declaration',
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
assert.equal(beforeCapturePack.ownershipCapture.documentsUnlocked, false)
assert.equal(beforeCapturePack.ownershipDrivenState, 'pending_capture')
assert.deepEqual(keysFor(beforeCapturePack.baselineDocuments), [...baselineKeys].sort())
assert.deepEqual(keysFor(beforeCapturePack.ownershipDrivenDocuments), [])
assert.deepEqual(keysFor(beforeCapturePack.requiredDocuments), [...baselineKeys].sort())
assert.deepEqual(keysFor(getSellerRequiredDocuments(kingstonsLeadBeforeCapture)), [...baselineKeys].sort())

const kingstonsLeadWithPartialPackDetails = {
  ...kingstonsLeadBeforeCapture,
  id: 'listing-kingstons-phase2-partial-pack-details',
  kingstonsSellerPack: {
    sellerType: 'natural',
    legalPath: {
      legalPathType: 'natural',
      owners: [
        { name: 'Alexander Landman', idNumber: '9001015009087' },
      ],
      natural: {
        maritalSetup: 'single',
      },
    },
    documents: {
      owner_fica_alexander_landman: {
        key: 'owner_fica_alexander_landman',
        requirementKey: 'owner_fica_alexander_landman',
        label: 'Owner FICA: Alexander Landman',
        status: 'uploaded',
        fileName: 'owner-fica.pdf',
        storagePath: 'kingstons/leads/lead-123/owner-fica.pdf',
        requirementLane: 'ownership_driven',
        documentRequirementSection: 'seller_identity_fica',
      },
    },
  },
}

const partialDetailsPack = buildKingstonsSellerDocumentRequirementPack(kingstonsLeadWithPartialPackDetails)
assert.equal(partialDetailsPack.ownershipCapture.captured, true)
assert.equal(partialDetailsPack.ownershipCapture.documentsUnlocked, false)
assert.equal(partialDetailsPack.ownershipDrivenState, 'pending_details_completion')
assert.deepEqual(keysFor(partialDetailsPack.ownershipDrivenDocuments), [])
assert.deepEqual(keysFor(partialDetailsPack.requiredDocuments), [...baselineKeys].sort())

const partialDetailsSourceOfTruth = buildSellerDocumentSourceOfTruth({ listing: kingstonsLeadWithPartialPackDetails })
assert.equal(partialDetailsSourceOfTruth.requirementPack.ownershipCapture.captured, true)
assert.equal(partialDetailsSourceOfTruth.requirementPack.ownershipCapture.documentsUnlocked, false)
assert.equal(partialDetailsSourceOfTruth.summary.totalRequired, 4)
assert.equal(
  partialDetailsSourceOfTruth.rows.some((row) => row.key === 'owner_fica_alexander_landman'),
  false,
)

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
assert.equal(afterCapturePack.ownershipCapture.documentsUnlocked, true)
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

const agencyPipelineSource = readFileSync(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
assert.match(
  agencyPipelineSource,
  /function hasKingstonsSellerPackDetailsCompletionSignal\(pack = \{\}\)/,
  'Agency pipeline must define the seller-pack details completion gate.',
)
assert.match(
  agencyPipelineSource,
  /const ownershipDocsUnlocked = hasKingstonsSellerPackDetailsCompletionSignal\(sellerPack\)/,
  'Seller-pack rows must resolve whether dynamic ownership documents are unlocked.',
)
assert.match(
  agencyPipelineSource,
  /const roleplayerFicaRows = ownershipDocsUnlocked\s+\? buildKingstonsSellerFicaRoleplayerDocumentRows/,
  'Roleplayer FICA rows must wait until seller-pack details are completed.',
)
assert.match(
  agencyPipelineSource,
  /const sourceRows = ownershipDocsUnlocked\s+\? buildSellerLeadDocumentRowsFromSource/,
  'Generated source rows must wait until seller-pack details are completed.',
)

console.log('Kingstons seller documents Phase 2 static/dynamic split checks passed.')
