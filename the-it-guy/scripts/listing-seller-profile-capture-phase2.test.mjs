import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  LISTING_SELLER_PROFILE_BUILDER_VERSION,
  LISTING_SELLER_PROFILE_CAPTURE_SOURCE,
  addListingSellerProfileDraftPerson,
  buildListingSellerProfileCapturePayload,
  buildListingSellerProfileFormPatch,
  createListingSellerProfileBuilderDraft,
  removeListingSellerProfileDraftPerson,
  updateListingSellerProfileDraftPerson,
  validateListingSellerProfileBuilderDraft,
} from '../src/lib/listingSellerProfileBuilderModel.js'
import {
  buildSellerRequirementProfile,
  getRequiredSellerDocuments,
} from '../src/lib/sellerDocumentRequirementEngine.js'

async function test(name, fn) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

await test('AgentListingDetail exposes the listing seller profile builder workflow', async () => {
  const source = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

  assert.ok(source.includes("from '../lib/listingSellerProfileBuilderModel'"), 'AgentListingDetail should import the builder model.')
  assert.ok(source.includes('sellerProfileBuilderOpen'), 'AgentListingDetail should keep builder modal state.')
  assert.ok(source.includes('title="Complete Seller Profile"'), 'The seller profile builder modal should be rendered.')
  assert.ok(source.includes('listing-seller-profile-builder-form'), 'The builder modal should submit through a dedicated form.')
  assert.ok(source.includes("requirementSyncReason: 'listing_seller_profile_capture'"), 'Saving should trigger seller requirement recalculation.')
  assert.ok(source.includes("key === 'complete_seller_facts'"), 'The follow-up action should route into the builder.')
  assert.ok(source.includes('listing-seller-profile-builder-prompt'), 'Low-completion seller profiles should show a builder prompt.')
})

await test('inline seller detail edits refresh the seller requirement model for bulk uploaded listings', async () => {
  const detailSource = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
  const serviceSource = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')

  assert.ok(detailSource.includes('resolveSellerProfileOwnershipModel'), 'Inline seller edits should normalize ownership type into seller type.')
  assert.ok(detailSource.includes('ownershipStructure: nextFormData.ownerStructureType || nextFormData.ownershipType'), 'Requirement sync should receive the normalized owner structure.')
  assert.ok(serviceSource.includes('options.sellerType || nextFormData.sellerType'), 'Onboarding updates should prefer edited seller type over stale seeded type.')
})

await test('bulk uploaded individual seed is overridden by edited company seller form data', () => {
  const profile = buildSellerRequirementProfile({
    id: 'bulk-listing-1',
    sellerType: 'individual',
    listingStatus: 'listing_review',
    sellerOnboarding: {
      status: 'in_progress',
      formData: {
        sellerType: 'company',
        ownerStructureType: 'company',
        ownershipType: 'company',
        companyName: 'Bulk Import Holdings',
        propertyAddress: '10 Example Road',
        propertyStructureType: 'sectional_title',
      },
    },
  })
  const docs = getRequiredSellerDocuments(profile)
  const keys = docs.map((doc) => doc.requirement_key)

  assert.equal(profile.sellerType, 'company')
  assert.equal(profile.sellerBranch, 'company')
  assert.ok(keys.includes('company_registration'), 'Company seller requirements should be generated after seller details are edited.')
})

await test('close corporation seller type is treated as company for requirement generation', () => {
  const profile = buildSellerRequirementProfile({
    id: 'bulk-listing-cc',
    sellerType: 'individual',
    listingStatus: 'listing_review',
    sellerOnboarding: {
      status: 'in_progress',
      formData: {
        sellerType: 'close_corporation',
        companyName: 'Example CC',
        propertyAddress: '10 Example Road',
      },
    },
  })

  assert.equal(profile.sellerType, 'company')
  assert.ok(getRequiredSellerDocuments(profile).some((doc) => doc.requirement_key === 'company_registration'))
})

await test('seeds an address-only bulk listing into an editable seller profile draft', () => {
  const draft = createListingSellerProfileBuilderDraft({
    id: 'listing-abc',
    addressLine1: '10 Example Road',
    askingPrice: 2500000,
    sellerOnboarding: { formData: {} },
  })

  assert.equal(draft.branch, 'individual')
  assert.equal(draft.propertyAddress, '10 Example Road')
  assert.equal(draft.askingPrice, '2500000')
  assert.equal(draft.mandateType, 'sole')
})

await test('builds company seller form data and canonical facts for document routing', () => {
  const draft = {
    branch: 'company',
    sellerFirstName: 'Dina',
    sellerSurname: 'Director',
    email: 'DINA@EXAMPLE.COM',
    phone: '0821111111',
    propertyAddress: '10 Example Road',
    propertyStructureType: 'sectional_title',
    propertyCategory: 'residential',
    mandateType: 'sole',
    askingPrice: '2500000',
    companyName: 'Acme Holdings',
    companyRegistrationNumber: '2020/123456/07',
    companyRegisteredAddress: '1 Company Road',
    companyDirectors: [{ name: 'Dina', surname: 'Director', email: 'dina@example.com', signingAuthority: true }],
    authorisedSignatoryName: 'Dina Director',
    authorisedSignatoryCapacity: 'Director',
    authorisedSignatoryEmail: 'dina@example.com',
  }
  const patch = buildListingSellerProfileFormPatch(draft)
  const payload = buildListingSellerProfileCapturePayload(draft, { id: 'listing-abc' }, {
    draft: true,
    env: { VITE_CANONICAL_SELLER_FACTS_ENABLED: 'true' },
  })

  assert.equal(patch.sellerProfileBuilderVersion, LISTING_SELLER_PROFILE_BUILDER_VERSION)
  assert.equal(patch.sellerProfileCaptureSource, LISTING_SELLER_PROFILE_CAPTURE_SOURCE)
  assert.equal(patch.ownerEntityType, 'company')
  assert.equal(patch.ownerStructureType, 'company')
  assert.equal(patch.email, 'dina@example.com')
  assert.equal(patch.company.name, 'Acme Holdings')
  assert.equal(patch.company.directors[0].fullName, 'Dina Director')
  assert.equal(payload.canonicalSellerFacts.context.source, 'listing_seller_profile_capture')
  assert.equal(payload.canonicalSellerFacts.context.listing_id, 'listing-abc')
  assert.equal(payload.canonicalSellerFacts.seller.company.name, 'Acme Holdings')
})

await test('builds trust seller form data with trustees and beneficiaries', () => {
  const draft = {
    branch: 'trust',
    propertyAddress: '20 Trust Avenue',
    trustName: 'Family Property Trust',
    trustRegistrationNumber: 'IT1234/2024',
    trustees: [{ fullName: 'Taylor Trustee', email: 'taylor@example.com' }],
    trustBeneficiaries: [{ fullName: 'Bailey Beneficiary', email: 'bailey@example.com' }],
    authorisedTrusteeName: 'Taylor Trustee',
    authorisedTrusteeCapacity: 'Trustee',
  }
  const patch = buildListingSellerProfileFormPatch(draft)

  assert.equal(patch.ownerEntityType, 'trust')
  assert.equal(patch.ownerStructureType, 'trust')
  assert.equal(patch.trust.name, 'Family Property Trust')
  assert.equal(patch.trust.trustees[0].full_name, 'Taylor Trustee')
  assert.equal(patch.trust.beneficiaries[0].fullName, 'Bailey Beneficiary')
  assert.deepEqual(validateListingSellerProfileBuilderDraft(draft), [])
})

await test('supports multiple-owner draft mutations', () => {
  const added = addListingSellerProfileDraftPerson({ branch: 'multiple_owners', multipleOwners: [] }, 'multipleOwners', 'Owner')
  const updated = updateListingSellerProfileDraftPerson(added, 'multipleOwners', 0, 'name', 'Primary')
  const removed = removeListingSellerProfileDraftPerson(updated, 'multipleOwners', 0)

  assert.equal(added.multipleOwners.length, 1)
  assert.equal(updated.multipleOwners[0].name, 'Primary')
  assert.equal(removed.multipleOwners.length, 0)
  assert.ok(validateListingSellerProfileBuilderDraft({ branch: 'multiple_owners', propertyAddress: '10 Road', multipleOwners: [] }).includes('Add at least one owner.'))
})

await test('validates foreign owner jurisdiction requirements', () => {
  const errors = validateListingSellerProfileBuilderDraft({
    branch: 'foreign_company',
    companyName: 'Overseas Holdings',
    propertyAddress: '10 Road',
  })
  const patch = buildListingSellerProfileFormPatch({
    branch: 'foreign_company',
    companyName: 'Overseas Holdings',
    foreignOwnerCountry: 'United Kingdom',
    propertyAddress: '10 Road',
  })

  assert.ok(errors.includes('Capture the foreign owner country or jurisdiction.'))
  assert.equal(patch.ownerEntityType, 'foreign')
  assert.equal(patch.ownerStructureType, 'foreign_company')
  assert.equal(patch.foreignOwner, true)
  assert.equal(patch.foreign.country, 'United Kingdom')
})

console.log('listing seller profile capture phase 2 checks passed.')
