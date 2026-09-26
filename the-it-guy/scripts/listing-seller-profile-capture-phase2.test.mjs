import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  LISTING_SELLER_PROFILE_BUILDER_VERSION,
  LISTING_SELLER_PROFILE_CAPTURE_SOURCE,
  addListingSellerProfileDraftPerson,
  buildListingSellerProfileCapturePayload,
  buildListingSellerProfileFormPatch,
  createListingSellerProfileBuilderDraft,
  hasListingSellerProfileBranchDetailsToDiscard,
  isListingSellerOwnershipUnidentified,
  removeListingSellerProfileDraftPerson,
  selectListingSellerProfileBranch,
  updateListingSellerProfileDraftField,
  updateListingSellerProfileDraftPerson,
  validateListingSellerProfileBuilderDraft,
} from '../src/lib/listingSellerProfileBuilderModel.js'
import {
  buildSellerRequirementProfile,
  getRequiredSellerDocuments,
} from '../src/lib/sellerDocumentRequirementEngine.js'
import { buildListingSellerCanonicalUpdate } from '../src/services/listings/listingSellerCanonicalUpdateModel.js'
import { buildSellerSigningPlan } from '../src/lib/sellerSigningPlanModel.js'
import { getPropertyStructureTypesByCategory, getPropertyTypeOptionsByCategory } from '../src/lib/propertyTaxonomy.js'

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
  assert.ok(source.includes("'Capture Owner Details'"), 'The seller profile builder should prompt to capture an unknown owner.')
  assert.ok(source.includes('Choose the property owner'), 'The seller profile builder should require an owner type selection.')
  assert.ok(source.includes('listing-seller-profile-builder-form'), 'The builder modal should submit through a dedicated form.')
  assert.ok(source.includes("requirementSyncReason: 'listing_seller_profile_capture'"), 'Saving should trigger seller requirement recalculation.')
  assert.ok(source.includes("key === 'complete_seller_facts'"), 'The follow-up action should route into the builder.')
  assert.ok(source.includes('Capture Owner Details'), 'Unidentified imported listings should show an owner-capture prompt.')
})

await test('inline seller detail edits refresh the seller requirement model for bulk uploaded listings', async () => {
  const detailSource = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
  const serviceSource = await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
  const canonicalUpdateSource = await readFile(new URL('../src/services/listings/listingSellerCanonicalUpdateModel.js', import.meta.url), 'utf8')

  assert.ok(detailSource.includes('resolveSellerProfileOwnershipModel'), 'Inline seller edits should normalize ownership type into seller type.')
  assert.ok(detailSource.includes('saveListingSellerCanonicalUpdate'), 'Inline seller edits should use the canonical seller update service.')
  assert.ok(canonicalUpdateSource.includes('nextFormData.ownerStructureType'), 'The canonical update should resolve the edited owner structure.')
  assert.ok(serviceSource.includes('update.requirementsAffected'), 'Requirement sync should follow the canonical seller change classification.')
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

await test('does not infer an individual owner from an address-only listing', () => {
  const draft = createListingSellerProfileBuilderDraft({
    id: 'listing-abc',
    addressLine1: '10 Example Road',
    askingPrice: 2500000,
    sellerOnboarding: { formData: {} },
  })

  assert.equal(draft.branch, '')
  assert.equal(draft.propertyAddress, '10 Example Road')
  assert.equal(draft.askingPrice, '2500000')
  assert.equal(draft.mandateType, 'sole')
})

await test('does not invent an individual owner for a Property24 migration import', () => {
  const listing = {
    id: 'property24-import-1',
    stockSource: 'property24_migration_import',
    addressLine1: '10 Imported Road',
    sellerCanonicalFacts: { property24Import: { reference: '123' } },
  }
  const draft = createListingSellerProfileBuilderDraft(listing)

  assert.equal(isListingSellerOwnershipUnidentified(listing), true)
  assert.equal(draft.branch, '')
  assert.deepEqual(validateListingSellerProfileBuilderDraft(draft), ['Choose who owns this property before continuing.'])
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
  const selected = selectListingSellerProfileBranch({ branch: 'individual', sellerFirstName: 'Primary', sellerSurname: 'Owner' }, 'multiple_owners')
  const updated = updateListingSellerProfileDraftPerson(selected, 'multipleOwners', 1, 'name', 'Second')
  const completed = updateListingSellerProfileDraftPerson(updated, 'multipleOwners', 1, 'surname', 'Owner')
  const added = addListingSellerProfileDraftPerson(completed, 'multipleOwners', 'Owner')
  const removed = removeListingSellerProfileDraftPerson(added, 'multipleOwners', 2)

  assert.equal(selected.multipleOwners.length, 2)
  assert.equal(selected.multipleOwners[0].name, 'Primary')
  assert.equal(added.multipleOwners.length, 3)
  assert.equal(removed.multipleOwners.length, 2)
  assert.equal(removeListingSellerProfileDraftPerson(removed, 'multipleOwners', 1), removed)
  assert.ok(validateListingSellerProfileBuilderDraft({ ...selected, propertyAddress: '10 Road' }).includes('Capture at least two owners.'))
  assert.deepEqual(validateListingSellerProfileBuilderDraft({ ...completed, propertyAddress: '10 Road' }), [])
})

await test('prefills owner cards from saved seller facts and known mandate parties', () => {
  const listing = {
    sellerType: 'multiple_owners',
    sellerOnboarding: { formData: { multipleOwners: [] } },
    sellerCanonicalFacts: { seller: { owners: [
      { first_name: 'Ava', surname: 'Owner', id_number: '8001010000001', email: 'ava@example.test', phone: '0821111111' },
      { first_name: 'Ben', surname: 'Owner', id_number: '8001010000002', email: 'ben@example.test' },
    ] } },
  }
  const draft = createListingSellerProfileBuilderDraft(listing)
  assert.equal(draft.multipleOwners.length, 2)
  assert.equal(draft.multipleOwners[0].phone, '0821111111')
  assert.equal(draft.multipleOwners[1].idNumber, '8001010000002')

  const mandateDraft = createListingSellerProfileBuilderDraft({
    sellerType: 'multiple_owners',
    mandateDraft: { sellerParties: [
      { name: 'Cara Third', idNumber: '9001010000003', email: 'cara@example.test' },
      { name: 'Dan Fourth', idNumber: '9001010000004', email: 'dan@example.test' },
    ] },
  })
  assert.deepEqual(mandateDraft.multipleOwners.map((owner) => owner.surname), ['Third', 'Fourth'])
})

await test('persists every structured owner for canonical seller facts and signing', () => {
  const listing = { id: 'owner-test-listing', sellerType: 'multiple_owners', sellerOnboarding: { formData: {} } }
  const draft = {
    branch: 'multiple_owners', propertyAddress: '10 Road', sellerFirstName: 'Ava', sellerSurname: 'Owner',
    multipleOwners: [
      { name: 'Ava', surname: 'Owner', idNumber: '8001010000001', email: 'ava@example.test', phone: '0821111111', ownershipShare: '50', consentToSell: true },
      { name: 'Ben', surname: 'Owner', idNumber: '8001010000002', email: 'ben@example.test', phone: '0822222222', ownershipShare: '50', consentToSell: true },
    ],
  }
  const { formPatch, canonicalSellerFacts } = buildListingSellerProfileCapturePayload(draft, listing, { draft: true })
  const update = buildListingSellerCanonicalUpdate({ listing, formPatch, suppliedCanonicalFacts: canonicalSellerFacts })
  assert.deepEqual(formPatch.multipleOwners.map((owner) => owner.phone), ['0821111111', '0822222222'])
  assert.equal(canonicalSellerFacts.seller.owners.length, 2)
  assert.equal(canonicalSellerFacts.seller.owners[1].id_number, '8001010000002')
  assert.equal(canonicalSellerFacts.seller.owners[1].consent_to_sell, true)
  assert.equal(update.nextFormData.multipleOwners.length, 2)
  const signing = buildSellerSigningPlan({ sellerType: 'multiple_owners', form: update.nextFormData })
  assert.deepEqual(signing.recipients.map((owner) => owner.name), ['Ava Owner', 'Ben Owner'])
})

await test('both listing owner editors expose the onboarding owner fields', async () => {
  const capture = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
  const edit = await readFile(new URL('../src/components/listings/ListingSellerInformationEditor.jsx', import.meta.url), 'utf8')
  for (const source of [capture, edit]) {
    assert.match(source, /ownerFields/)
    assert.match(source, /Phone number/)
    assert.match(source, /Ownership share \(if known\)/)
    assert.match(source, /Owner has confirmed consent to sell/)
  }
})

await test('property category and title options follow seller onboarding choices', async () => {
  assert.ok(getPropertyStructureTypesByCategory('residential').includes('share_block'))
  assert.ok(getPropertyStructureTypesByCategory('commercial').includes('sectional_title'))
  assert.ok(getPropertyStructureTypesByCategory('agricultural').includes('agricultural_holding'))
  assert.ok(getPropertyTypeOptionsByCategory('commercial').some((type) => type.value === 'office_building'))
  const selected = updateListingSellerProfileDraftField({ propertyCategory: 'residential', propertyType: 'house', propertyStructureType: 'share_block' }, 'propertyCategory', 'commercial')
  assert.equal(selected.propertyType, 'office_building')
  assert.equal(selected.propertyStructureType, 'full_title')
  const sectionalIdentifier = updateListingSellerProfileDraftField({ sectionNumber: '1', unitNumber: '1' }, 'sectionNumber', '7')
  assert.equal(sectionalIdentifier.unitNumber, '7')
  const capture = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
  const editor = await readFile(new URL('../src/components/listings/ListingSellerInformationEditor.jsx', import.meta.url), 'utf8')
  const propertySection = capture.slice(capture.indexOf('{sellerProfileBuilderStep === 3 ? <>'), capture.indexOf('Mandate start date', capture.indexOf('{sellerProfileBuilderStep === 3 ? <>')))
  assert.ok(propertySection.indexOf('Property title type') < propertySection.indexOf('Property address'))
  for (const label of ['Scheme name', 'Unit / section number', 'Body corporate name', 'Managing agent name', 'Bond account number']) assert.ok(propertySection.includes(label))
  assert.match(propertySection, /bondStatus === 'bonded' \? <>/)
  assert.match(editor, /getPropertyStructureTypesByCategory\(draft\.propertyCategory\)/)
  assert.match(editor, /\['sectional_title', 'share_block'\]\.includes\(draft\.propertyStructureType\)/)
  assert.match(editor, /draft\.bondStatus === 'bonded' \? <>/)
})

await test('sectional details and bond answers persist, and no-bond clears stale values', () => {
  const listing = { id: 'property-test-listing', sellerType: 'individual', sellerOnboarding: { formData: {
    bondStatus: 'bonded', existingBond: true, sellerHasExistingBond: true, bondedProperty: true, bondHolder: 'Old Bank', bondBank: 'Old Bank', currentBondBank: 'Old Bank', bondAccountReference: 'OLD-123', currentBondAccountNumber: 'OLD-123', outstandingBond: '500000', estimatedSettlementAmount: '500000',
  } } }
  const draft = createListingSellerProfileBuilderDraft(listing)
  assert.equal(draft.bondStatus, 'bonded')
  assert.equal(draft.bondAccountReference, 'OLD-123')
  const sectional = {
    ...draft, branch: 'individual', sellerFirstName: 'Alice', propertyAddress: '10 Road',
    propertyCategory: 'commercial', propertyType: 'office_building', propertyStructureType: 'sectional_title',
    schemeName: 'Central Scheme', sectionNumber: '7', unitNumber: '7', schemeBodyCorporateName: 'Central BC',
    schemeManagingAgentName: 'Management Co', schemeManagingAgentEmail: 'manage@example.test',
    schemeManagingAgentPhone: '0823333333', schemeLevies: '3500', schemeRulesAvailable: true,
  }
  const { formPatch, canonicalSellerFacts } = buildListingSellerProfileCapturePayload(sectional, listing, { draft: true })
  assert.equal(formPatch.propertyType, 'office_building')
  assert.equal(canonicalSellerFacts.property.scheme.name, 'Central Scheme')
  assert.equal(canonicalSellerFacts.property.scheme.section_number, '7')
  assert.equal(canonicalSellerFacts.property.scheme.managing_agent.name, 'Management Co')
  assert.equal(canonicalSellerFacts.finance.bond_bank, 'Old Bank')
  const rehydrated = createListingSellerProfileBuilderDraft({ id: listing.id, sellerType: 'individual', sellerCanonicalFacts: canonicalSellerFacts })
  assert.equal(rehydrated.schemeName, 'Central Scheme')
  assert.equal(rehydrated.sectionNumber, '7')
  assert.equal(rehydrated.bondStatus, 'bonded')

  const noBondDraft = updateListingSellerProfileDraftField(sectional, 'bondStatus', 'no_bond')
  const noBondPatch = buildListingSellerProfileFormPatch(noBondDraft)
  const update = buildListingSellerCanonicalUpdate({ listing, formPatch: noBondPatch })
  assert.equal(updateListingSellerProfileDraftField(noBondDraft, 'bondStatus', 'bonded').bondHolder, 'Old Bank')
  assert.equal(noBondPatch.existingBond, false)
  assert.equal(noBondPatch.bondBank, '')
  assert.equal(noBondPatch.outstandingBond, '')
  assert.equal(update.nextFormData.bondBank, '')
  assert.equal(update.nextFormData.currentBondBank, '')
  assert.equal(update.nextFormData.bondAccountReference, '')
  assert.equal(update.nextFormData.currentBondAccountNumber, '')
  assert.equal(update.nextFormData.sellerHasExistingBond, false)
  assert.equal(update.nextFormData.estimatedSettlementAmount, '')
  assert.equal(update.canonicalFacts.finance.existing_bond, false)
  assert.equal(update.canonicalFacts.finance.bond_bank, '')
})

await test('owner-type changes discard only prior branch details after confirmation', async () => {
  const multiple = selectListingSellerProfileBranch({ branch: 'married', sellerFirstName: 'Jane', spouseName: 'Alex', propertyAddress: '10 Road' }, 'multiple_owners')
  assert.equal(hasListingSellerProfileBranchDetailsToDiscard({ branch: 'married', spouseName: 'Alex' }, 'multiple_owners'), true)
  assert.equal(multiple.spouseName, '')
  assert.equal(multiple.sellerFirstName, 'Jane')
  assert.equal(multiple.multipleOwners.length, 2)
  const individual = selectListingSellerProfileBranch(multiple, 'individual')
  assert.equal(hasListingSellerProfileBranchDetailsToDiscard(multiple, 'individual'), true)
  assert.deepEqual(individual.multipleOwners, [])
  assert.equal(individual.propertyAddress, '10 Road')
  const source = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
  const builder = source.slice(source.indexOf('open={sellerProfileBuilderOpen}'), source.indexOf('open={Boolean(activeSellerSectionEditor)}'))
  assert.match(builder, /handleSellerProfileBuilderBranchSelection\(branch\.value\)/)
  assert.match(source, /window\.confirm\('Changing the owner type/)
  assert.match(builder, /minimumRows=\{2\}/)
  assert.doesNotMatch(builder, /Co-owner details/)
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
