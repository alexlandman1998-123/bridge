import assert from 'node:assert/strict'

import {
  buildKingstonsSellerDocumentRequirementPack,
  resolveKingstonsSellerOwnershipProfile,
} from '../src/services/sellerDocumentRequirementsService.js'

const baseKingstonsListing = {
  id: 'kingstons-ownership-capture-phase3',
  organisationId: 'kingstons',
  sellerProcessProfile: 'kingstons_residential',
}

const naturalProfile = resolveKingstonsSellerOwnershipProfile({
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
        spouse: {
          name: 'Jordan Landman',
          idNumber: '9201015009089',
          email: 'jordan@example.test',
        },
      },
    },
  },
})

assert.equal(naturalProfile.version, 'kingstons_seller_ownership_capture_phase3_v1')
assert.equal(naturalProfile.captured, true)
assert.equal(naturalProfile.sellerType, 'natural')
assert.equal(naturalProfile.natural.maritalSetup, 'in_community')
assert.equal(naturalProfile.natural.requiresSpouseDetails, true)
assert.equal(naturalProfile.natural.spouse.name, 'Jordan Landman')
assert.equal(naturalProfile.counts.owners, 2)
assert.equal(naturalProfile.ownerCount, 2)

const companyProfile = resolveKingstonsSellerOwnershipProfile({
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
          registrationNumber: '2026/001/07',
          directors: ['Director One', 'Director Two'],
        },
      },
    },
  },
})

assert.equal(companyProfile.sellerType, 'juristic')
assert.equal(companyProfile.juristic.entityType, 'company')
assert.equal(companyProfile.juristic.company.name, 'Kingstons Holdings (Pty) Ltd')
assert.equal(companyProfile.counts.directors, 2)

const trustProfile = resolveKingstonsSellerOwnershipProfile({
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
          registrationNumber: 'IT123/2026',
          trustees: [{ name: 'Trustee One' }, { name: 'Trustee Two' }],
        },
      },
    },
  },
})

assert.equal(trustProfile.juristic.entityType, 'trust')
assert.equal(trustProfile.counts.trustees, 2)

const closeCorporationListing = {
  ...baseKingstonsListing,
  kingstonsSellerPack: {
    sellerType: 'juristic',
    sellerPackDetailsCapturedAt: '2026-08-09T12:00:00.000Z',
    legalPath: {
      legalPathType: 'juristic',
      juristic: {
        entityType: 'cc',
        closeCorporation: {
          name: 'Kingstons Properties CC',
          registrationNumber: 'CK2026/123456/23',
          members: 'Member One\nMember Two',
        },
      },
    },
  },
}

const closeCorporationProfile = resolveKingstonsSellerOwnershipProfile(closeCorporationListing)
assert.equal(closeCorporationProfile.juristic.entityType, 'close_corporation')
assert.equal(closeCorporationProfile.juristic.closeCorporation.name, 'Kingstons Properties CC')
assert.equal(closeCorporationProfile.counts.members, 2)

const requirementPack = buildKingstonsSellerDocumentRequirementPack(closeCorporationListing)
assert.equal(requirementPack.version, 'kingstons_seller_documents_phase6_authority_documents_v1')
assert.equal(requirementPack.ownershipProfile.version, 'kingstons_seller_ownership_capture_phase3_v1')
assert.equal(requirementPack.ownershipProfile.counts.members, 2)
assert.equal(requirementPack.ownershipCapture.memberCount, 2)
assert.equal(requirementPack.ownershipDrivenState, 'ready_for_generation')

console.log('Kingstons seller documents Phase 3 ownership capture checks passed.')
