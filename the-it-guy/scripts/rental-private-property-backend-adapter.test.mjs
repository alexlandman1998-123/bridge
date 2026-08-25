import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  PRIVATE_PROPERTY_RENTAL_LISTING_ADAPTER_VERSION,
  createPrivatePropertyRentalListingPlan,
  isPrivatePropertyRentalListing,
} from '../server/services/privatePropertyRentalListingAdapter.js'
import {
  createPrivatePropertyArch9ListingPreview,
} from '../server/services/privatePropertyListingPreviewService.js'
import {
  RENTAL_LISTING_RELEASE_GATE_FIXTURE,
} from '../src/services/rentals/rentalListingReleaseGateModel.js'

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const rentalListing = {
  ...RENTAL_LISTING_RELEASE_GATE_FIXTURE,
  listing_category: 'rental',
  mandateEndDate: '2027-02-28',
  privatePropertySuburbId: '140',
  listingReference: 'PRV-RENTAL-READY-1',
  photos: [
    'https://example.test/rental-private-property-1.jpg',
    'https://example.test/rental-private-property-2.jpg',
    'https://example.test/rental-private-property-3.jpg',
  ],
}

assert.equal(isPrivatePropertyRentalListing(rentalListing), true)

const { sellerCanonicalFacts, ...dbShapedBaseListing } = rentalListing
const dbShapedPlan = createPrivatePropertyRentalListingPlan({
  listing: {
    ...dbShapedBaseListing,
    seller_canonical_facts_json: sellerCanonicalFacts,
  },
  agentMapping: { privatePropertyAgentId: 'ARCH9-SANDBOX-USER-1' },
  options: {
    branchGuid: '11111111-1111-4111-8111-111111111111',
    propertyId: 'PRV-RENTAL-DB-SHAPED-1',
    suburbId: '140',
  },
})
assert.equal(dbShapedPlan.status, 'PREVIEW_READY')
assert.equal(dbShapedPlan.summary.price, 22000)
assert.equal(dbShapedPlan.summary.deposit, 44000)
assert.equal(dbShapedPlan.summary.rentalMandateStatus, 'signed_uploaded')

const plan = createPrivatePropertyRentalListingPlan({
  listing: rentalListing,
  agentMapping: { privatePropertyAgentId: 'ARCH9-SANDBOX-USER-1' },
  options: {
    branchGuid: '11111111-1111-4111-8111-111111111111',
    propertyId: 'PRV-RENTAL-READY-1',
    suburbId: '140',
  },
})

assert.equal(plan.version, PRIVATE_PROPERTY_RENTAL_LISTING_ADAPTER_VERSION)
assert.equal(plan.phase, 'private-property-rental-listing-backend-preview')
assert.equal(plan.safety.privatePropertyApiCalled, false)
assert.equal(plan.safety.databaseWritten, false)
assert.equal(plan.safety.listingPublished, false)
assert.equal(plan.status, 'PREVIEW_READY')
assert.equal(plan.canPreview, true)
assert.equal(plan.canSubmit, false)
assert.deepEqual(plan.dataBlockers, [])
assert.deepEqual(plan.technicalBlockers, [])
assert.equal(plan.summary.listingType, 'Rental')
assert.equal(plan.summary.mandateType, 'Rental')
assert.equal(plan.summary.propertyStatus, 'ToLet')
assert.equal(plan.summary.price, 22000)
assert.equal(plan.summary.deposit, 44000)
assert.equal(plan.summary.availableFrom, '2026-09-01')
assert.equal(plan.summary.suburbId, 140)
assert.equal(plan.summary.rentalMandateStatus, 'signed_uploaded')
assert.equal(plan.summary.rentalMarketingApprovalStatus, 'approved')
assert.equal(plan.summary.privatePropertyRentalAdapter, true)
assert.equal(plan.payload.listingType, 'Rental')
assert.equal(plan.payload.propertyStatus, 'ToLet')
assert.equal(plan.payload.mandateType, 'Rental')
assert.equal(plan.payload.price, 22000)
assert.equal(plan.payload.deposit, 44000)
assert.equal(plan.payload.availableFrom, '2026-09-01')
assert.equal(plan.payload.address.streetNumber, '12')
assert.equal(plan.payload.address.streetName, 'Main Road')
assert.equal(plan.payload.photoUrls.length, 3)
assert.match(plan.payload.description, /Rental terms:/)
assert.match(plan.payload.description, /Lease period: 12 months/)
assert.match(plan.listingXml, /<ListingImport>/)
assert.match(plan.listingXml, /<MandateType>Rental<\/MandateType>/)
assert.match(plan.listingXml, /<ListingType>Rental<\/ListingType>/)
assert.match(plan.listingXml, /<PropertyStatus>ToLet<\/PropertyStatus>/)
assert.match(plan.listingXml, /<Price>22000<\/Price>/)
assert.match(plan.listingXml, /<Deposit>44000<\/Deposit>/)
assert.match(plan.listingXml, /<AvailableFrom>2026-09-01T00:00:00<\/AvailableFrom>/)
assert.match(plan.listingXml, /<StreetNumber>12<\/StreetNumber>/)
assert.match(plan.listingXml, /<StreetName>Main Road<\/StreetName>/)
assert.match(plan.listingXml, /<SuburbId>140<\/SuburbId>/)
assert.match(plan.listingXml, /<AgentId>ARCH9-SANDBOX-USER-1<\/AgentId>/)
assert.doesNotMatch(plan.listingXml, /FullMandate|ForSale|SoleMandateExclusiveDays>\\d/)

const preview = createPrivatePropertyArch9ListingPreview({
  listing: rentalListing,
  agentMapping: { privatePropertyAgentId: 'ARCH9-SANDBOX-USER-1' },
  options: {
    branchGuid: '11111111-1111-4111-8111-111111111111',
    propertyId: 'PRV-RENTAL-READY-1',
    suburbId: '140',
  },
})
assert.equal(preview.status, 'PREVIEW_READY')
assert.equal(preview.summary.privatePropertyRentalAdapter, true)
assert.match(preview.listingXml, /<ListingType>Rental<\/ListingType>/)

const blocked = createPrivatePropertyRentalListingPlan({
  listing: {
    ...rentalListing,
    privatePropertySuburbId: '',
    sellerCanonicalFacts: {
      ...rentalListing.sellerCanonicalFacts,
      rentalInfo: {
        ...rentalListing.sellerCanonicalFacts.rentalInfo,
        mandateStatus: 'sent',
        marketingApprovalStatus: 'draft',
      },
    },
  },
  agentMapping: { privatePropertyAgentId: 'ARCH9-SANDBOX-USER-1' },
  options: {
    branchGuid: '11111111-1111-4111-8111-111111111111',
    propertyId: 'PRV-RENTAL-BLOCKED-1',
  },
})
assert.equal(blocked.status, 'BLOCKED')
assert.equal(blocked.canPreview, false)
assert.ok(blocked.dataBlockers.includes('missing_private_property_suburb_id'))
assert.ok(blocked.dataBlockers.includes('rental_mandate_not_signed'))
assert.ok(blocked.dataBlockers.includes('rental_marketing_not_approved'))
assert.equal(blocked.listingXml, '')

const previewServiceSource = read('server/services/privatePropertyListingPreviewService.js')
assert.match(previewServiceSource, /createPrivatePropertyRentalListingPlan/)
assert.match(previewServiceSource, /isPrivatePropertyRentalListing/)

console.log('Rental Private Property backend adapter contract passed')
