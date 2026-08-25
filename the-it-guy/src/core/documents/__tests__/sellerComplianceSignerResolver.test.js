import test from 'node:test'
import assert from 'node:assert/strict'

import { transformSellerOnboardingToFacts } from '../../../services/documents/sellerOnboardingFactTransformer.js'
import {
  resolveSellerComplianceRequiredSigners,
  SELLER_COMPLIANCE_SIGNER_RESOLVER_CONTRACT,
} from '../sellerComplianceSignerResolver.js'

const listing = {
  id: 'phase-2-listing',
  propertyCategory: 'residential',
  propertyStructureType: 'full_title',
  askingPrice: 2500000,
}

function factsFor(overrides = {}) {
  return transformSellerOnboardingToFacts({
    sellerFirstName: 'Alex',
    sellerSurname: 'Seller',
    email: 'alex@example.com',
    phone: '0820000000',
    ownershipType: 'individual',
    propertyAddress: '10 Main Road',
    suburb: 'Cape Town',
    province: 'Western Cape',
    propertyCategory: 'residential',
    propertyStructureType: 'full_title',
    mandateType: 'sole',
    ratesTaxes: '1500',
    leviesNotApplicable: true,
    waterBillingType: 'municipal',
    ...overrides,
  }, listing)
}

test('resolves one required signer for an individual seller', () => {
  const resolved = resolveSellerComplianceRequiredSigners(factsFor())

  assert.equal(resolved.contract, SELLER_COMPLIANCE_SIGNER_RESOLVER_CONTRACT)
  assert.equal(resolved.sellerBranch, 'individual')
  assert.equal(resolved.signerCount, 1)
  assert.equal(resolved.signers[0].id, 'seller-1')
  assert.equal(resolved.signers[0].name, 'Alex Seller')
  assert.equal(resolved.signers[0].role, 'seller_1')
  assert.equal(resolved.signingState.complete, false)
  assert.deepEqual(resolved.authorityRequirements, [])
})

test('resolves seller and spouse signers for a married seller', () => {
  const resolved = resolveSellerComplianceRequiredSigners(factsFor({
    ownershipType: 'married_cop',
    maritalRegime: 'in_community',
    spouseName: 'Sam Seller',
    spouseEmail: 'sam@example.com',
    spousePhone: '0830000000',
    spouseIdNumber: '9001015009084',
  }))

  assert.equal(resolved.sellerBranch, 'married')
  assert.equal(resolved.signerCount, 2)
  assert.deepEqual(resolved.signers.map((signer) => signer.role), ['seller_1', 'spouse'])
  assert.equal(resolved.signers[1].name, 'Sam Seller')
  assert.equal(resolved.signers[1].email, 'sam@example.com')
  assert.equal(resolved.signingState.nextSigner.id, 'seller-1')
})

test('resolves one signer per captured owner for multiple owners', () => {
  const resolved = resolveSellerComplianceRequiredSigners(factsFor({
    ownershipType: 'multiple_owners',
    ownerStructureType: 'multiple_owners',
    multipleOwners: [
      { name: 'Alex Seller', email: 'alex@example.com', phone: '0820000000', ownershipShare: '50' },
      { name: 'Sam Seller', email: 'sam@example.com', phone: '0830000000', ownershipShare: '50' },
    ],
  }))

  assert.equal(resolved.sellerBranch, 'multiple_owners')
  assert.equal(resolved.signerCount, 2)
  assert.deepEqual(resolved.signers.map((signer) => signer.id), ['seller-1', 'seller-2'])
  assert.deepEqual(resolved.signers.map((signer) => signer.name), ['Alex Seller', 'Sam Seller'])
  assert.equal(resolved.signingState.requiredCount, 2)
})

test('resolves the authorised company signatory and company authority requirement', () => {
  const resolved = resolveSellerComplianceRequiredSigners(factsFor({
    ownershipType: 'company',
    companyName: 'SellerCo Pty Ltd',
    authorisedSignatoryName: 'Casey Director',
    authorisedSignatoryEmail: 'casey@example.com',
    authorisedSignatoryPhone: '0840000000',
    authorisedSignatoryCapacity: 'Director',
  }))

  assert.equal(resolved.sellerBranch, 'company')
  assert.equal(resolved.signerCount, 1)
  assert.equal(resolved.signers[0].id, 'company-authorised-signatory')
  assert.equal(resolved.signers[0].role, 'authorised_signatory')
  assert.equal(resolved.signers[0].name, 'Casey Director')
  assert.equal(resolved.signers[0].capacity, 'Director')
  assert.equal(resolved.signers[0].authorityRequired, true)
  assert.equal(resolved.authorityRequirements[0].key, 'company_resolution')
})

test('resolves the authorised trustee and trust authority requirement', () => {
  const resolved = resolveSellerComplianceRequiredSigners(factsFor({
    ownershipType: 'trust',
    trustName: 'Seller Family Trust',
    trustees: [
      { name: 'Taylor Trustee', email: 'taylor@example.com', phone: '0850000000', capacity: 'Trustee' },
    ],
    authorisedTrusteeName: 'Taylor Trustee',
    authorisedTrusteeEmail: 'taylor@example.com',
    authorisedTrusteeCapacity: 'Trustee',
  }))

  assert.equal(resolved.sellerBranch, 'trust')
  assert.equal(resolved.signerCount, 1)
  assert.equal(resolved.signers[0].id, 'trust-authorised-trustee')
  assert.equal(resolved.signers[0].role, 'trustee')
  assert.equal(resolved.signers[0].name, 'Taylor Trustee')
  assert.equal(resolved.authorityRequirements[0].key, 'trustee_resolution')
})

test('resolves executor and POA representative signer paths with authority requirements', () => {
  const deceasedEstate = resolveSellerComplianceRequiredSigners(factsFor({
    ownershipType: 'deceased_estate',
    executorName: 'Pat Executor',
    executorEmail: 'pat@example.com',
    executorPhone: '0860000000',
    executorAuthorityDetails: 'Letters of executorship issued.',
  }))
  assert.equal(deceasedEstate.sellerBranch, 'deceased_estate')
  assert.equal(deceasedEstate.signers[0].role, 'executor')
  assert.equal(deceasedEstate.signers[0].name, 'Pat Executor')
  assert.equal(deceasedEstate.authorityRequirements[0].key, 'letters_of_executorship')

  const poa = resolveSellerComplianceRequiredSigners(factsFor({
    ownershipType: 'power_of_attorney',
    powerOfAttorneyName: 'Robin Representative',
    powerOfAttorneyEmail: 'robin@example.com',
    powerOfAttorneyPhone: '0870000000',
    powerOfAttorneyPrincipalName: 'Alex Seller',
    powerOfAttorneyPrincipalIdNumber: '9001015009083',
    powerOfAttorneyAuthorityDetails: 'POA-1',
  }))
  assert.equal(poa.sellerBranch, 'power_of_attorney')
  assert.equal(poa.signers[0].role, 'representative')
  assert.equal(poa.signers[0].name, 'Robin Representative')
  assert.equal(poa.authorityRequirements[0].key, 'power_of_attorney_document')
})

test('preserves existing signer state when recalculating the required roster', () => {
  const resolved = resolveSellerComplianceRequiredSigners(
    factsFor({
      ownershipType: 'married_cop',
      maritalRegime: 'in_community',
      spouseName: 'Sam Seller',
      spouseEmail: 'sam@example.com',
    }),
    {
      existingSigners: [
        {
          id: 'seller-1',
          name: 'Alex Seller',
          role: 'seller_1',
          status: 'signed',
          signedAt: '2026-08-25T10:00:00+02:00',
          signature: 'Alex',
        },
      ],
    },
  )

  assert.equal(resolved.signingState.complete, false)
  assert.equal(resolved.signingState.signedCount, 1)
  assert.equal(resolved.signingState.remainingCount, 1)
  assert.equal(resolved.signers[0].status, 'signed')
  assert.equal(resolved.signers[1].status, 'pending')
  assert.equal(resolved.signingState.nextSigner.id, 'spouse')
})
