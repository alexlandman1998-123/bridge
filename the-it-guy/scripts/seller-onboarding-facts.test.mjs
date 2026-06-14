import assert from 'node:assert/strict'
import {
  buildCanonicalSellerOnboardingPayload,
  buildSellerResolverInputFromFacts,
  normalizeBoolean,
  normalizeCanonicalPropertyType,
  normalizeMaritalRegime,
  normalizeOccupancyStatus,
  normalizeProvince,
  transformSellerOnboardingToFacts,
  validateSellerOnboardingFacts,
} from '../src/services/documents/sellerOnboardingFactTransformer.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const listing = {
  id: '11111111-1111-4111-8111-111111111111',
  propertyCategory: 'residential',
  propertyStructureType: 'sectional_title',
  askingPrice: 2450000,
}

test('normalizes legacy booleans and enums safely', () => {
  assert.equal(normalizeBoolean('yes'), true)
  assert.equal(normalizeBoolean('0', true), false)
  assert.equal(normalizeProvince('wc'), 'Western Cape')
  assert.equal(normalizeMaritalRegime({ ownershipType: 'married_cop' }), 'in_community')
  assert.equal(normalizeOccupancyStatus({ occupancyStatus: 'tenant' }), 'tenant_occupied')
  assert.equal(normalizeCanonicalPropertyType({ propertyType: 'apartment' }), 'sectional_title')
})

test('transforms seller onboarding into canonical resolver facts', () => {
  const facts = transformSellerOnboardingToFacts({
    sellerFirstName: 'Alex',
    sellerSurname: 'Principal',
    email: 'alex@example.com',
    phone: '0820000000',
    ownershipType: 'company',
    companyName: 'Testing Agency PTY LTD',
    companyRegistrationNumber: '2024/123456/07',
    companyDirectorName: 'Alex Principal',
    propertyType: 'apartment',
    propertyStructureType: 'sectional_title',
    sectionalTitle: true,
    propertyAddressDetails: {
      query: '123 Main Street, Green Point, Cape Town, Western Cape, 8001',
      line1: '123 Main Street',
      line2: '',
      suburb: 'Green Point',
      city: 'Cape Town',
      province: 'WC',
      postalCode: '8001',
      municipality: 'City of Cape Town',
      country: 'South Africa',
      source: 'manual',
    },
    occupancyStatus: 'tenant_occupied',
    leaseExists: true,
    leaseExpiryDate: '2026-11-30',
    tenantName: 'Tenant Name',
    existingBond: true,
    bondBank: 'FNB',
    bondAccountReference: 'BOND-123',
    gasInstallation: true,
    solarInstallation: true,
    titleDeedAvailable: true,
  }, listing, { contextType: 'private_listing', contextId: listing.id, listingId: listing.id })

  assert.equal(facts.seller.legal_type, 'company')
  assert.equal(facts.seller_branch, 'company')
  assert.equal(facts.property_branch, 'sectional_title')
  assert.equal(facts.seller.company.registration_number, '2024/123456/07')
  assert.equal(facts.property.property_type, 'sectional_title')
  assert.equal(facts.property.sectional_title, true)
  assert.equal(facts.property.province, 'Western Cape')
  assert.equal(facts.property.address_details.line_1, '123 Main Street')
  assert.equal(facts.property.address_details.province, 'Western Cape')
  assert.equal(facts.property.address_details.formatted, '123 Main Street, Green Point, Cape Town, Western Cape, 8001')
  assert.equal(facts.property.address, '123 Main Street, Green Point, Cape Town, Western Cape, 8001')
  assert.equal(facts.occupancy.status, 'tenant_occupied')
  assert.equal(facts.occupancy.lease_expiry_date, '2026-11-30')
  assert.equal(facts.finance.existing_bond, true)
  assert.equal(facts.finance.bond_bank, 'FNB')
  assert.equal(facts.compliance.gas_installation, true)
  assert.equal(facts.compliance.solar_installation, true)
  assert.ok(Array.isArray(facts.document_triggers))
  assert.equal(facts.context.id, listing.id)
})

test('captures land-specific details in canonical facts', () => {
  const facts = transformSellerOnboardingToFacts({
    sellerFirstName: 'Casey',
    sellerSurname: 'Farm',
    email: 'casey@example.com',
    phone: '0821111111',
    ownershipType: 'individual',
    propertyCategory: 'agricultural',
    propertyStructureType: 'agricultural_holding',
    propertyType: 'farm',
    propertyAddressDetails: {
      query: 'Farm 12, Bela-Bela, Limpopo',
      line1: 'Farm 12',
      suburb: 'Bela-Bela',
      city: 'Bela-Bela',
      province: 'Limpopo',
      postalCode: '0480',
      municipality: 'Waterberg',
      country: 'South Africa',
      source: 'manual',
    },
    erfSize: '120000',
    landZoning: 'Agricultural',
    landServicesAvailable: 'Borehole water, electricity, gravel access road',
    landWaterSource: 'Borehole',
  }, listing)

  assert.equal(facts.flow.property_branch, 'agricultural')
  assert.equal(facts.property.land.zoning, 'Agricultural')
  assert.equal(facts.property.land.services_available, 'Borehole water, electricity, gravel access road')
  assert.equal(facts.property.land.water_source, 'Borehole')
  assert.equal(facts.property.address_details.line_1, 'Farm 12')
})

test('validation distinguishes draft from final requirements', () => {
  const facts = transformSellerOnboardingToFacts({
    sellerFirstName: 'Sam',
    sellerSurname: 'Seller',
    email: 'sam@example.com',
    phone: '0830000000',
    idNumber: '9001015009083',
    residentialAddress: '1 Road',
    maritalStatus: 'single',
    propertyAddress: '1 Road',
    suburb: 'Town',
    province: 'Gauteng',
    propertyCategory: 'residential',
    propertyStructureType: 'freehold',
    existingBond: true,
  }, listing)

  const draftValidation = validateSellerOnboardingFacts(facts, { draft: true })
  const finalValidation = validateSellerOnboardingFacts(facts, { draft: false })

  assert.equal(draftValidation.ok, true)
  assert.equal(finalValidation.ok, false)
  assert.equal(finalValidation.required.some((item) => item.code === 'bond_bank_missing'), true)
})

test('builds canonical payload with readiness and resolver input', () => {
  const payload = buildCanonicalSellerOnboardingPayload({
    sellerFirstName: 'Taylor',
    sellerSurname: 'Trustee',
    email: 'taylor@example.com',
    phone: '0840000000',
    ownershipType: 'trust',
    trustRegistrationNumber: 'IT1234/2024',
    trustName: 'Taylor Family Trust',
    trusteeName: 'Taylor Trustee',
    trustRegisteredAddress: '22 Road',
    propertyAddress: '22 Road',
    suburb: 'Sandton',
    city: 'Johannesburg',
    province: 'GP',
    municipality: 'City of Johannesburg',
    propertyCategory: 'residential',
    propertyStructureType: 'estate',
    canonicalPropertyType: 'estate',
    estateOrHoa: true,
    occupancyStatus: 'vacant',
  }, listing, { contextType: 'private_listing', contextId: listing.id, listingId: listing.id })

  assert.equal(payload.canonicalSellerFacts.seller.legal_type, 'trust')
  assert.equal(payload.canonicalSellerFacts.property.estate_or_hoa, true)
  assert.equal(payload.canonicalSellerFactReadiness.validation.ok, true)
  assert.equal(typeof payload.canonicalSellerFactReadiness.percent, 'number')

  const resolverInput = buildSellerResolverInputFromFacts(payload.canonicalSellerFacts, {
    contextType: 'private_listing',
    contextId: listing.id,
    listingId: listing.id,
  })
  assert.equal(resolverInput.contextType, 'private_listing')
  assert.equal(resolverInput.contextId, listing.id)
  assert.equal(resolverInput.options.regenerate, true)
  assert.equal(resolverInput.options.sourceSystem, 'seller_onboarding')
  assert.equal(resolverInput.facts.property.estate_or_hoa, true)
})

test('persists authority details and owner consent in canonical facts', () => {
  const estateFacts = transformSellerOnboardingToFacts({
    sellerFirstName: 'Pat',
    sellerSurname: 'Executor',
    email: 'pat@example.com',
    phone: '0850000000',
    ownershipType: 'deceased_estate',
    executorName: 'Pat Executor',
    estateReference: 'EST-2026-01',
    executorAuthorityDetails: 'Letters of executorship issued by the Master of the High Court.',
    propertyType: 'house',
    propertyAddress: '1 Main Road',
    suburb: 'Cape Town',
    province: 'Western Cape',
    propertyCategory: 'residential',
    propertyStructureType: 'freehold',
  }, listing)

  assert.equal(estateFacts.seller.deceased_estate.authority_details, 'Letters of executorship issued by the Master of the High Court.')

  const poaFacts = transformSellerOnboardingToFacts({
    sellerFirstName: 'Sam',
    sellerSurname: 'Agent',
    email: 'sam@example.com',
    phone: '0830000000',
    ownershipType: 'power_of_attorney',
    powerOfAttorneyName: 'Sam Agent',
    powerOfAttorneyPrincipalName: 'Pat Principal',
    powerOfAttorneyPrincipalIdNumber: '8001015009080',
    powerOfAttorneyAuthorityDetails: 'POA-2026-01 / authority note',
    propertyType: 'vacant_land',
    propertyAddress: 'Farm 12',
    suburb: 'Bela-Bela',
    province: 'Limpopo',
    propertyCategory: 'residential',
    propertyStructureType: 'vacant_land',
  }, listing)

  assert.equal(poaFacts.seller.power_of_attorney.reference, 'POA-2026-01 / authority note')
  assert.equal(poaFacts.seller.power_of_attorney.authority_details, 'POA-2026-01 / authority note')

  const ownersFacts = transformSellerOnboardingToFacts({
    sellerFirstName: 'Alex',
    sellerSurname: 'Owner',
    email: 'alex@example.com',
    phone: '0820000000',
    ownershipType: 'multiple_owners',
    multipleOwners: [
      { name: 'Alex', surname: 'Owner', idNumber: '9001015009083', consentToSell: true, ownershipShare: '50' },
      { name: 'Kim', surname: 'Owner', idNumber: '9001015009084', consentToSell: true, ownershipShare: '50' },
    ],
    propertyType: 'house',
    propertyAddress: '1 Main Road',
    suburb: 'Cape Town',
    province: 'Western Cape',
    propertyCategory: 'residential',
    propertyStructureType: 'freehold',
  }, listing)

  assert.equal(ownersFacts.seller.owners.length, 2)
  assert.equal(ownersFacts.seller.owners[0].consent_to_sell, true)
  assert.equal(ownersFacts.seller.owners[1].ownership_share, 50)
})
