import assert from 'node:assert/strict'

import {
  SELLER_COMPLETION_DIMENSIONS,
  SELLER_PARTY_AUTHORITY_CONTRACT_VERSION,
  SELLER_PARTY_ROLES,
  SELLER_PROFILE_AUTHORITY_MATRIX,
  getSellerProfileAuthorityContract,
  normalizeSellerProfileType,
  resolveListingSellerAuthorityContract,
} from '../src/lib/sellerPartyAuthorityContract.js'
import {
  createListingSellerProfileBuilderDraft,
  isListingSellerOwnershipUnidentified,
} from '../src/lib/listingSellerProfileBuilderModel.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('publishes one versioned seller party, field, authority and completion contract', () => {
  assert.equal(SELLER_PARTY_AUTHORITY_CONTRACT_VERSION, 'seller_party_authority_contract_v1')
  assert.deepEqual(SELLER_COMPLETION_DIMENSIONS.map((item) => item.key), ['profile', 'authority', 'compliance', 'onboarding', 'mandate'])
  assert.ok(SELLER_PROFILE_AUTHORITY_MATRIX.company.fieldGroups.identity.includes('seller.company.registration_number'))
  assert.ok(SELLER_PROFILE_AUTHORITY_MATRIX.company.fieldRules.required.includes('seller.company.authorised_signatory'))
  assert.ok(SELLER_PROFILE_AUTHORITY_MATRIX.company.fieldRules.optional.includes('seller.company.beneficial_owners'))
  assert.ok(SELLER_PROFILE_AUTHORITY_MATRIX.trust.fieldGroups.authority.includes('seller.trust.authorised_trustee'))
  assert.ok(SELLER_PROFILE_AUTHORITY_MATRIX.multiple_owners.partyRoles.includes(SELLER_PARTY_ROLES.legalOwner))
})

test('normalizes every supported seller profile without collapsing legal roles', () => {
  const cases = {
    individual: 'individual',
    married_cop: 'married',
    co_owners: 'multiple_owners',
    pty_ltd: 'company',
    cc: 'close_corporation',
    trust: 'trust',
    estate: 'deceased_estate',
    poa: 'power_of_attorney',
    developer: 'other',
    foreign_individual: 'foreign_individual',
    foreign_company: 'foreign_company',
    foreign_trust: 'foreign_trust',
  }

  Object.entries(cases).forEach(([input, expected]) => assert.equal(normalizeSellerProfileType(input), expected))
  assert.equal(getSellerProfileAuthorityContract('close_corporation').legalEntityType, 'close_corporation')
  assert.equal(getSellerProfileAuthorityContract('foreign_company').foreign, true)
})

test('does not treat a contact, address or legacy individual default as confirmed ownership', () => {
  const listing = {
    sellerType: 'individual',
    sellerName: 'Alex Example',
    sellerEmail: 'alex@example.com',
    addressLine1: '10 Example Road',
  }
  const contract = resolveListingSellerAuthorityContract(listing)

  assert.equal(contract.identified, false)
  assert.equal(contract.profileType, 'unknown')
  assert.equal(contract.reason, 'legacy_individual_default_is_not_confirmation')
  assert.equal(isListingSellerOwnershipUnidentified(listing), true)
  assert.equal(createListingSellerProfileBuilderDraft(listing).branch, '')
})

test('accepts a deliberately captured individual and records its source', () => {
  const listing = {
    sellerType: 'individual',
    sellerOnboarding: {
      formData: {
        sellerProfileCaptureSource: 'listing_seller_profile_capture',
        ownerEntityType: 'natural_person',
        ownerStructureType: 'individual',
      },
    },
  }
  const contract = resolveListingSellerAuthorityContract(listing)

  assert.equal(contract.identified, true)
  assert.equal(contract.profileType, 'individual')
  assert.equal(contract.source, 'onboarding_form')
  assert.equal(contract.signatoryPolicy.mode, 'all_legal_owners')
})

test('keeps legal owner, contact and signatory separate for represented sellers', () => {
  const company = resolveListingSellerAuthorityContract({
    sellerOnboarding: { formData: { ownerStructureType: 'company' } },
  })
  const poa = resolveListingSellerAuthorityContract({
    sellerCanonicalFacts: { seller: { owner_structure_type: 'power_of_attorney' } },
  })

  assert.equal(company.profileType, 'company')
  assert.ok(company.partyRoles.includes(SELLER_PARTY_ROLES.primaryContact))
  assert.ok(company.partyRoles.includes(SELLER_PARTY_ROLES.authorisedRepresentative))
  assert.equal(company.signatoryPolicy.automaticSigners, false)
  assert.ok(poa.partyRoles.includes(SELLER_PARTY_ROLES.legalOwner))
  assert.ok(poa.partyRoles.includes(SELLER_PARTY_ROLES.attorney))
  assert.equal(poa.signatoryPolicy.requiresAuthorityEvidence, true)
})

test('preserves foreign company and trust overlays', () => {
  const company = resolveListingSellerAuthorityContract({
    sellerOnboarding: { formData: { ownerEntityType: 'foreign', ownerStructureType: 'foreign_company' } },
  })
  const trust = resolveListingSellerAuthorityContract({
    sellerOnboarding: { formData: { ownerEntityType: 'foreign', ownerStructureType: 'foreign_trust' } },
  })

  assert.equal(company.profileType, 'foreign_company')
  assert.equal(company.legalEntityType, 'company')
  assert.ok(company.conditionalFieldGroups.foreign.includes('seller.foreign.country'))
  assert.equal(trust.profileType, 'foreign_trust')
  assert.equal(trust.signatoryPolicy.mode, 'confirmed_trustees')
})

console.log('seller party authority contract checks passed.')
