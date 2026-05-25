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
    propertyAddress: '123 Main Street',
    suburb: 'Green Point',
    city: 'Cape Town',
    province: 'WC',
    municipality: 'City of Cape Town',
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
  assert.equal(facts.seller.company.registration_number, '2024/123456/07')
  assert.equal(facts.property.property_type, 'sectional_title')
  assert.equal(facts.property.sectional_title, true)
  assert.equal(facts.property.province, 'Western Cape')
  assert.equal(facts.occupancy.status, 'tenant_occupied')
  assert.equal(facts.occupancy.lease_expiry_date, '2026-11-30')
  assert.equal(facts.finance.existing_bond, true)
  assert.equal(facts.finance.bond_bank, 'FNB')
  assert.equal(facts.compliance.gas_installation, true)
  assert.equal(facts.compliance.solar_installation, true)
  assert.equal(facts.context.id, listing.id)
})

test('validation distinguishes draft from final requirements', () => {
  const facts = transformSellerOnboardingToFacts({
    sellerFirstName: 'Sam',
    sellerSurname: 'Seller',
    email: 'sam@example.com',
    phone: '0830000000',
    propertyAddress: '1 Road',
    suburb: 'Town',
    province: 'Gauteng',
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
    trusteeName: 'Taylor Trustee',
    propertyAddress: '22 Road',
    suburb: 'Sandton',
    province: 'GP',
    municipality: 'City of Johannesburg',
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

