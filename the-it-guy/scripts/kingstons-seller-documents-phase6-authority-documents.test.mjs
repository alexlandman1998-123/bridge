import assert from 'node:assert/strict'

import {
  buildKingstonsAuthorityDocumentRequirements,
  buildKingstonsSellerDocumentRequirementPack,
  buildSellerDocumentSourceOfTruth,
} from '../src/services/sellerDocumentRequirementsService.js'

const baseKingstonsListing = {
  id: 'kingstons-authority-phase6',
  organisationId: 'kingstons',
  sellerProcessProfile: 'kingstons_residential',
}

function keysFor(rows = []) {
  return rows.map((row) => row.key || row.requirement_key).sort()
}

function assertAuthorityRow(row, expectedKey) {
  assert.ok(row, `expected ${expectedKey} authority row`)
  assert.equal(row.key, expectedKey)
  assert.equal(row.requirementLane, 'ownership_driven')
  assert.equal(row.requirement_lane, 'ownership_driven')
  assert.equal(row.documentRequirementSection, 'authority_documents')
  assert.equal(row.document_requirement_section, 'authority_documents')
  assert.equal(row.group, 'authority_documents')
  assert.equal(row.category, 'legal')
  assert.equal(row.generatedBy, 'kingstons_seller_documents_phase6_authority_documents_v1')
}

const naturalPack = buildKingstonsSellerDocumentRequirementPack({
  ...baseKingstonsListing,
  kingstonsSellerPack: {
    sellerType: 'natural',
    sellerPackDetailsCapturedAt: '2026-08-09T15:00:00.000Z',
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
})

assert.equal(naturalPack.version, 'kingstons_seller_documents_phase6_authority_documents_v1')
assertAuthorityRow(naturalPack.generatedOwnershipDrivenDocuments.find((row) => row.key === 'all_owner_authority_consent'), 'all_owner_authority_consent')
assertAuthorityRow(naturalPack.generatedOwnershipDrivenDocuments.find((row) => row.key === 'spouse_consent'), 'spouse_consent')

const companyPack = buildKingstonsSellerDocumentRequirementPack({
  ...baseKingstonsListing,
  kingstonsSellerPack: {
    sellerType: 'juristic',
    sellerPackDetailsCapturedAt: '2026-08-09T15:00:00.000Z',
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

assertAuthorityRow(companyPack.generatedOwnershipDrivenDocuments.find((row) => row.key === 'company_resolution_to_sell'), 'company_resolution_to_sell')

const trustPack = buildKingstonsSellerDocumentRequirementPack({
  ...baseKingstonsListing,
  kingstonsSellerPack: {
    sellerType: 'juristic',
    sellerPackDetailsCapturedAt: '2026-08-09T15:00:00.000Z',
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

assert.deepEqual(keysFor(buildKingstonsAuthorityDocumentRequirements(trustPack.ownershipProfile)), [
  'seller_letters_of_authority',
  'seller_trust_deed',
  'trust_resolution_to_sell',
])

const closeCorporationPack = buildKingstonsSellerDocumentRequirementPack({
  ...baseKingstonsListing,
  kingstonsSellerPack: {
    sellerType: 'juristic',
    sellerPackDetailsCapturedAt: '2026-08-09T15:00:00.000Z',
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

assertAuthorityRow(
  closeCorporationPack.generatedOwnershipDrivenDocuments.find((row) => row.key === 'close_corporation_resolution_to_sell'),
  'close_corporation_resolution_to_sell',
)

const source = buildSellerDocumentSourceOfTruth({
  listing: {
    ...baseKingstonsListing,
    rawEnquiryPayload: JSON.stringify({
      kingstonsSellerPack: {
        ...companyPack.ownershipProfile,
        sellerType: 'juristic',
        sellerPackDetailsCapturedAt: '2026-08-09T15:00:00.000Z',
        legalPath: {
          legalPathType: 'juristic',
          juristic: {
            entityType: 'company',
            company: {
              name: 'Kingstons Holdings (Pty) Ltd',
              directors: ['Director One'],
            },
          },
        },
        documents: {
          company_resolution_to_sell: {
            key: 'company_resolution_to_sell',
            label: 'Company Resolution To Sell',
            status: 'uploaded',
            fileName: 'company-resolution.pdf',
            url: 'https://example.test/company-resolution.pdf',
            requirementLane: 'ownership_driven',
            documentRequirementSection: 'authority_documents',
          },
        },
      },
    }),
  },
})
const companyResolutionRow = source.rows.find((row) => row.key === 'company_resolution_to_sell')
assert.equal(companyResolutionRow.status, 'uploaded')
assert.equal(companyResolutionRow.complete, true)
assert.equal(companyResolutionRow.hasUpload, true)
assert.equal(companyResolutionRow.category, 'sales')

console.log('Kingstons seller documents Phase 6 authority document checks passed.')
