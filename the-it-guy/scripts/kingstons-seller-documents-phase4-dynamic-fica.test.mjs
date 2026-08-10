import assert from 'node:assert/strict'

import {
  buildKingstonsOwnershipDrivenDocumentRequirements,
  buildKingstonsSellerDocumentRequirementPack,
} from '../src/services/sellerDocumentRequirementsService.js'

const baseKingstonsListing = {
  id: 'kingstons-dynamic-fica-phase4',
  organisationId: 'kingstons',
  sellerProcessProfile: 'kingstons_residential',
}

function keysFor(rows = []) {
  return rows.map((row) => row.key || row.requirement_key).sort()
}

function assertOwnershipDrivenRow(row, expectedRole) {
  assert.equal(row.requirementLane, 'ownership_driven')
  assert.equal(row.requirement_lane, 'ownership_driven')
  assert.equal(row.documentRequirementSection, 'seller_identity_fica')
  assert.equal(row.document_requirement_section, 'seller_identity_fica')
  assert.equal(row.group, 'seller_identity_fica')
  assert.equal(row.category, 'seller')
  assert.equal(row.partyRole, expectedRole)
  assert.equal(row.party_role, expectedRole)
}

const pendingPack = buildKingstonsSellerDocumentRequirementPack(baseKingstonsListing)
assert.equal(pendingPack.ownershipDrivenState, 'pending_capture')
assert.deepEqual(pendingPack.generatedOwnershipDrivenDocuments, [])
assert.deepEqual(pendingPack.ownershipDrivenDocuments, [])

const naturalListing = {
  ...baseKingstonsListing,
  kingstonsSellerPack: {
    sellerType: 'natural',
    sellerPackDetailsCapturedAt: '2026-08-09T12:00:00.000Z',
    legalPath: {
      legalPathType: 'natural',
      owners: [
        { name: 'Alexander Landman', idNumber: '9001015009087' },
        { name: 'Taylor Landman', idNumber: '9101015009088' },
      ],
      natural: {
        maritalSetup: 'in_community',
        spouse: { name: 'Jordan Landman', idNumber: '9201015009089' },
      },
    },
  },
}

const naturalPack = buildKingstonsSellerDocumentRequirementPack(naturalListing)
assert.equal(naturalPack.version, 'kingstons_seller_documents_phase6_authority_documents_v1')
assert.deepEqual(keysFor(naturalPack.generatedOwnershipDrivenDocuments).filter((key) => key.includes('_fica_')), [
  'owner_fica_9001015009087',
  'owner_fica_9101015009088',
  'spouse_fica_9201015009089',
])
assert.equal(naturalPack.requiredDocuments.length, 9)
assertOwnershipDrivenRow(naturalPack.generatedOwnershipDrivenDocuments.find((row) => row.key === 'owner_fica_9001015009087'), 'owner')
assertOwnershipDrivenRow(naturalPack.generatedOwnershipDrivenDocuments.find((row) => row.key === 'spouse_fica_9201015009089'), 'spouse')

const companyPack = buildKingstonsSellerDocumentRequirementPack({
  ...baseKingstonsListing,
  kingstonsSellerPack: {
    sellerType: 'juristic',
    sellerPackDetailsCapturedAt: '2026-08-09T12:00:00.000Z',
    legalPath: {
      legalPathType: 'juristic',
      juristic: {
        entityType: 'company',
        company: {
          name: 'Kingstons Holdings (Pty) Ltd',
          directors: ['Director One', 'Director Two'],
        },
      },
    },
  },
})

assert.deepEqual(keysFor(companyPack.generatedOwnershipDrivenDocuments).filter((key) => key.includes('_fica_')), [
  'director_fica_director_one',
  'director_fica_director_two',
])
companyPack.generatedOwnershipDrivenDocuments
  .filter((row) => row.key.startsWith('director_fica_'))
  .forEach((row) => assertOwnershipDrivenRow(row, 'director'))

const trustPack = buildKingstonsSellerDocumentRequirementPack({
  ...baseKingstonsListing,
  kingstonsSellerPack: {
    sellerType: 'juristic',
    sellerPackDetailsCapturedAt: '2026-08-09T12:00:00.000Z',
    legalPath: {
      legalPathType: 'juristic',
      juristic: {
        entityType: 'trust',
        trust: {
          name: 'Landman Family Trust',
          trustees: ['Trustee One', 'Trustee Two'],
        },
      },
    },
  },
})

assert.deepEqual(keysFor(trustPack.generatedOwnershipDrivenDocuments).filter((key) => key.includes('_fica_')), [
  'trustee_fica_trustee_one',
  'trustee_fica_trustee_two',
])
trustPack.generatedOwnershipDrivenDocuments
  .filter((row) => row.key.startsWith('trustee_fica_'))
  .forEach((row) => assertOwnershipDrivenRow(row, 'trustee'))

const closeCorporationPack = buildKingstonsSellerDocumentRequirementPack({
  ...baseKingstonsListing,
  kingstonsSellerPack: {
    sellerType: 'juristic',
    sellerPackDetailsCapturedAt: '2026-08-09T12:00:00.000Z',
    legalPath: {
      legalPathType: 'juristic',
      juristic: {
        entityType: 'close_corporation',
        closeCorporation: {
          name: 'Kingstons Properties CC',
          members: ['Member One', 'Member Two'],
        },
      },
    },
  },
})

assert.deepEqual(keysFor(closeCorporationPack.generatedOwnershipDrivenDocuments).filter((key) => key.includes('_fica_')), [
  'member_fica_member_one',
  'member_fica_member_two',
])
closeCorporationPack.generatedOwnershipDrivenDocuments
  .filter((row) => row.key.startsWith('member_fica_'))
  .forEach((row) => assertOwnershipDrivenRow(row, 'member'))

const directGeneratedRows = buildKingstonsOwnershipDrivenDocumentRequirements(naturalPack.ownershipProfile)
assert.deepEqual(keysFor(directGeneratedRows), keysFor(naturalPack.generatedOwnershipDrivenDocuments))

console.log('Kingstons seller documents Phase 4 dynamic FICA checks passed.')
