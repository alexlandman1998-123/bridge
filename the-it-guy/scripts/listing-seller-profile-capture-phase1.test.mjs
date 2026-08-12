import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  SELLER_PROFILE_CAPTURE_VERSION,
  buildSellerEntityProfileAliases,
  buildSellerProfileCanonicalPayload,
  createBlankSellerProfilePersonRecord,
  normalizePersonCollectionForSellerProfile,
} from '../src/lib/sellerProfileCaptureModel.js'

async function test(name, fn) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

await test('SellerOnboarding consumes the shared seller profile capture model', async () => {
  const source = await readFile(new URL('../src/pages/SellerOnboarding.jsx', import.meta.url), 'utf8')

  assert.ok(
    source.includes("from '../lib/sellerProfileCaptureModel'"),
    'SellerOnboarding should import the extracted seller profile capture model.',
  )
  assert.ok(
    !source.includes('function normalizeEntityPersonAliases'),
    'Entity alias normalization should live in the shared model, not SellerOnboarding.',
  )
  assert.ok(
    !source.includes('buildCanonicalSellerOnboardingPayload'),
    'SellerOnboarding should use the shared canonical payload wrapper.',
  )
})

await test('normalizes company seller aliases for listing-side capture reuse', () => {
  const aliases = buildSellerEntityProfileAliases({
    ownerEntityType: 'company',
    ownerStructureType: 'company',
    ownershipType: 'company',
    companyName: 'Acme Holdings',
    companyRegistrationNumber: '2020/123456/07',
    companyRegisteredAddress: '1 Company Road',
    companyDirectors: [
      {
        name: 'Dina',
        surname: 'Director',
        email: 'dina@example.com',
        capacity: 'Director',
        signingAuthority: true,
      },
    ],
    authorisedSignatoryName: 'Dina Director',
    authorisedSignatoryCapacity: 'Director',
    authorisedSignatoryEmail: 'dina@example.com',
  })

  assert.equal(aliases.company.name, 'Acme Holdings')
  assert.equal(aliases.company.registrationNumber, '2020/123456/07')
  assert.equal(aliases.companyDirectors[0].fullName, 'Dina Director')
  assert.equal(aliases.company_directors[0].full_name, 'Dina Director')
  assert.equal(aliases.company.authorisedSignatory.fullName, 'Dina Director')
  assert.equal(aliases.company.authorised_signatory.capacity, 'Director')
})

await test('normalizes trust seller aliases with trustees and beneficiaries', () => {
  const aliases = buildSellerEntityProfileAliases({
    ownerEntityType: 'trust',
    ownerStructureType: 'trust',
    ownershipType: 'trust',
    trustName: 'Family Property Trust',
    trustRegistrationNumber: 'IT1234/2022',
    trustees: [{ fullName: 'Taylor Trustee', email: 'taylor@example.com' }],
    trustBeneficiaries: [{ fullName: 'Bailey Beneficiary', email: 'bailey@example.com' }],
    authorisedTrusteeName: 'Taylor Trustee',
    authorisedTrusteeCapacity: 'Trustee',
  })

  assert.equal(aliases.trust.name, 'Family Property Trust')
  assert.equal(aliases.trust.trustees[0].full_name, 'Taylor Trustee')
  assert.equal(aliases.trust.beneficiaries[0].fullName, 'Bailey Beneficiary')
  assert.equal(aliases.trust_beneficiaries[0].roleTitle, 'Beneficiary')
  assert.equal(aliases.trust.authorisedTrustee.capacity, 'Trustee')
})

await test('normalizes person collections and blank person records for wizard drafts', () => {
  const owners = normalizePersonCollectionForSellerProfile(
    [],
    { fullName: 'Primary Owner', email: 'primary@example.com', idNumber: '8001015009087' },
    'Owner',
  )
  const blankDirector = createBlankSellerProfilePersonRecord('Director', 1, { timestamp: 12345 })

  assert.equal(owners.length, 1)
  assert.equal(owners[0].name, 'Primary')
  assert.equal(owners[0].surname, 'Owner')
  assert.equal(owners[0].roleTitle, 'Owner')
  assert.equal(blankDirector.id, 'director-12345-2')
  assert.equal(blankDirector.signingAuthority, false)
})

await test('builds canonical seller facts through the listing capture wrapper', () => {
  const listing = {
    id: 'listing-123',
    property_address: '10 Listing Street',
  }
  const payload = buildSellerProfileCanonicalPayload({
    sellerFirstName: 'Jane',
    sellerSurname: 'Seller',
    email: 'jane@example.com',
    phone: '0821111111',
    propertyAddress: '10 Listing Street',
    propertyCategory: 'residential',
    propertyStructureType: 'full_title',
    ratesTaxes: '1500',
    leviesNotApplicable: true,
    waterBillingType: 'municipal',
    mandateType: 'sole',
    ownerEntityType: 'company',
    ownerStructureType: 'company',
    ownershipType: 'company',
    companyName: 'Acme Holdings',
    companyRegistrationNumber: '2020/123456/07',
    companyDirectors: [{ fullName: 'Dina Director', email: 'dina@example.com' }],
    authorisedSignatoryName: 'Dina Director',
  }, listing, {
    draft: true,
    env: { VITE_CANONICAL_SELLER_FACTS_ENABLED: 'true' },
    source: 'listing_seller_profile_capture',
  })

  assert.equal(SELLER_PROFILE_CAPTURE_VERSION, 'seller_profile_capture_phase1_v1')
  assert.equal(payload.canonicalSellerFacts.context.source, 'listing_seller_profile_capture')
  assert.equal(payload.canonicalSellerFacts.context.listing_id, 'listing-123')
  assert.equal(payload.canonicalSellerFacts.seller.company.name, 'Acme Holdings')
  assert.equal(payload.canonicalSellerFacts.seller.company.directors[0].full_name, 'Dina Director')
})

console.log('listing seller profile capture phase 1 checks passed.')
