import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

const audit = read('docs/listing-module-field-audit-phase1.md')
const property24Mapper = read('server/services/property24ListingMapper.js')
const property24RentalAdapter = read('server/services/property24RentalListingAdapter.js')
const privatePropertyMapper = read('server/services/privatePropertyListingMapper.js')
const privatePropertyRentalAdapter = read('server/services/privatePropertyRentalListingAdapter.js')
const rentalDraftModel = read('src/services/rentals/rentalListingDraftModel.js')
const rentalFieldComparison = read('src/services/rentals/rentalListingProperty24FieldComparisonModel.js')
const sellerProfileBuilder = read('src/lib/listingSellerProfileBuilderModel.js')
const privateListingFoundation = read('sql/20260509_private_listing_foundation.sql')

for (const requiredSection of [
  '## Shared Listing Fields',
  '## Sales Module Audit',
  '## Rental Module Audit',
  '## Portal-Specific Audit',
  '## Obvious Missing Fields To Add Later',
  '## Recommended Data Shape',
]) {
  assert.ok(audit.includes(requiredSection), `Audit missing section ${requiredSection}`)
}

for (const requiredTerm of [
  'seller-first',
  'landlord',
  'Transfer duty treatment / no transfer duty',
  'Video and virtual tour links',
  'Show day/viewing schedule capture',
  'solar geyser',
  'Property24',
  'Private Property',
]) {
  assert.ok(audit.includes(requiredTerm), `Audit missing required term ${requiredTerm}`)
}

for (const existingSalesSignal of [
  'sellerFirstName',
  'sellerSurname',
  'companyDirectors',
  'trustees',
  'ratesTaxes',
  'levies',
  'mandateStartDate',
  'expiryDate',
]) {
  assert.ok(
    sellerProfileBuilder.includes(existingSalesSignal),
    `Expected seller profile builder to cover ${existingSalesSignal}`,
  )
}

for (const privateListingColumn of [
  'seller_lead_id',
  'property_profile_id',
  'listing_reference',
  'property_type',
  'asking_price',
  'mandate_status',
  'seller_onboarding_status',
]) {
  assert.ok(
    privateListingFoundation.includes(privateListingColumn),
    `Expected private listing foundation to include ${privateListingColumn}`,
  )
}

for (const rentalField of [
  'landlordName',
  'landlordEmail',
  'landlordPhone',
  'monthlyRent',
  'depositAmount',
  'availableFrom',
  'leasePeriodMonths',
  'furnishedStatus',
  'petsPolicy',
  'utilitiesPolicy',
  'marketingApprovalStatus',
]) {
  assert.ok(rentalDraftModel.includes(rentalField), `Expected rental draft model to include ${rentalField}`)
}

for (const portalField of [
  'agencyId',
  'contactAgentIds',
  'propertyInfo.suburbId',
  'propertyFeatures.petsAllowed',
  'propertyFeatures.furnishedStatus',
  'rentalInfo.depositRequirementsComments',
  'rentalInfo.leasePeriod',
]) {
  assert.ok(
    rentalFieldComparison.includes(portalField) || property24RentalAdapter.includes(portalField),
    `Expected rental Property24 mapping to include ${portalField}`,
  )
}

for (const mapperSignal of [
  'floorArea',
  'municipalRatesAndTaxes',
  'monthlyLevy',
  'photos',
  'showLocation',
  'listingType',
]) {
  assert.ok(property24Mapper.includes(mapperSignal), `Expected Property24 mapper to include ${mapperSignal}`)
}

for (const privatePropertySignal of [
  'ShowdayEvents',
  'AvailableFrom',
  'PhotoUrls',
  'Attributes',
  'PetsAllowed',
  'Furnished',
]) {
  assert.ok(
    privatePropertyMapper.includes(privatePropertySignal) || privatePropertyRentalAdapter.includes(privatePropertySignal),
    `Expected Private Property mapper to include ${privatePropertySignal}`,
  )
}

assert.ok(
  audit.includes('Add Only If Business Decides') &&
    audit.includes('Property24 development link') &&
    audit.includes('Feature impression star ratings'),
  'Audit should separate optional PropCtrl fields from required Arch9 work.',
)

console.log('Listing module field audit phase 1 passed')

