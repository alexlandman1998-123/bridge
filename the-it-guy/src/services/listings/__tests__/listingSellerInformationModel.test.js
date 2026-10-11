import assert from 'node:assert/strict'
import test from 'node:test'

import { buildListingSellerInformationModel } from '../listingSellerInformationModel.js'
import { createListingSellerProfileBuilderDraft, updateListingSellerProfileDraftField, buildListingSellerProfileFormPatch } from '../../../lib/listingSellerProfileBuilderModel.js'
import { buildCanonicalSellerOnboardingPayload } from '../../documents/sellerOnboardingFactTransformer.js'

function rowLabels(model) {
  return model.groups.flatMap((group) => group.rows.map((row) => row.label))
}

test('current capture clearing wins over stale canonical, listing and CRM-style fallbacks', () => {
  const model = buildListingSellerInformationModel({ sellerName: 'Old contact', sellerEmail: 'stale@example.com', sellerPhone: 'stale', sellerCanonicalFacts: { seller: { legal_type: 'company', company: { name: 'Old company', registration_number: 'OLD', directors: [{ id: 'old-person', full_name: 'Old Director' }] }, contact: { name: 'Old Contact', email: 'stale@example.com' } } }, sellerOnboarding: { formData: { ownerStructureType: 'company', companyName: '', companyRegistrationNumber: null, companyDirectors: [], primaryContactName: '', email: null, phone: '' } } })
  assert.equal(model.draft.companyName, '')
  assert.equal(model.draft.companyRegistrationNumber, '')
  assert.deepEqual(model.draft.companyDirectors, [])
  assert.equal(model.draft.primaryContactName, '')
  assert.equal(model.draft.email, '')
  assert.equal(model.draft.phone, '')
  assert(!model.groups.flatMap((group) => group.rows).some((row) => String(row.value).includes('Old') || String(row.value).includes('stale')))
})

test('SA residency, tax residency, section and unit remain independent through read and save', () => {
  const listing = { sellerOnboarding: { formData: { ownerStructureType: 'individual', saResident: 'yes', taxResident: 'no', sectionNumber: '4', unitNumber: 'Door 12' } } }
  const draft = createListingSellerProfileBuilderDraft(listing)
  assert.equal(draft.saResident, 'yes'); assert.equal(draft.taxResident, 'no')
  const edited = updateListingSellerProfileDraftField(draft, 'sectionNumber', '9')
  assert.equal(edited.unitNumber, 'Door 12')
  const saved = buildListingSellerProfileFormPatch(edited)
  assert.equal(saved.taxResident, 'no'); assert.equal(saved.saResident, 'yes')
  assert.equal(saved.unitNumber, 'Door 12'); assert.equal(saved.sectionNumber, '9')
  const facts = buildCanonicalSellerOnboardingPayload(saved).canonicalSellerFacts
  assert.equal(facts.seller.sa_resident, 'yes'); assert.equal(facts.seller.tax_resident, 'no')
  assert.equal(facts.property.scheme.section_number, '9'); assert.equal(facts.property.scheme.unit_number, 'Door 12')
  const taxOnly = createListingSellerProfileBuilderDraft({ sellerOnboarding: { formData: { taxResident: 'yes', unitNumber: '12' } } })
  assert.equal(taxOnly.saResident, '')
  assert.equal(taxOnly.sectionNumber, '')
})

test('marriage regime and spouse contact survive a contact-only profile edit and reopen', () => {
  const formData = { ownerStructureType: 'married', sellerFirstName: 'Jane', sellerSurname: 'Owner', maritalStatus: 'married', maritalRegime: 'out_of_community_with_accrual', spouseName: 'Pat Owner', spousePhone: 'saved-spouse-phone', saResident: 'yes', taxResident: 'no' }
  const draft = createListingSellerProfileBuilderDraft({ sellerOnboarding: { formData } })
  const patch = buildListingSellerProfileFormPatch({ ...draft, phone: 'new-contact-phone' })
  const facts = buildCanonicalSellerOnboardingPayload(patch).canonicalSellerFacts
  const reopened = createListingSellerProfileBuilderDraft({ sellerOnboarding: { formData: patch }, sellerCanonicalFacts: facts })
  assert.equal(reopened.maritalStatus, 'married')
  assert.equal(reopened.maritalRegime, 'out_of_community_with_accrual')
  assert.equal(facts.seller.marital_regime, 'out_of_community_with_accrual')
  assert.equal(reopened.spousePhone, 'saved-spouse-phone')
})

test('estate and POA saves preserve captured rosters and their source IDs', () => {
  for (const [branch, key, flatName] of [['deceased_estate', 'executors', 'executorName'], ['power_of_attorney', 'powerOfAttorneyRepresentatives', 'powerOfAttorneyName']]) {
    const formData = { ownerStructureType: branch, [flatName]: 'Primary person', [key]: [{ id: 'saved-one', name: 'One', surname: 'Person' }, { id: 'saved-two', name: 'Two', surname: 'Person' }] }
    const draft = createListingSellerProfileBuilderDraft({ sellerOnboarding: { formData } })
    const saved = buildListingSellerProfileFormPatch(draft)
    assert.deepEqual(saved[key].map((person) => person.id), ['saved-one', 'saved-two'])
    const canonical = buildCanonicalSellerOnboardingPayload(saved).canonicalSellerFacts
    const collection = branch === 'deceased_estate' ? canonical.seller.deceased_estate.executors : canonical.seller.power_of_attorney.representatives
    assert.deepEqual(collection.map((person) => person.id), ['saved-one', 'saved-two'])
  }
})

test('company sellers show company, contact, authority and relevant property groups', () => {
  const model = buildListingSellerInformationModel({
    sellerOnboarding: {
      formData: {
        sellerProfileCaptureSource: 'listing_seller_profile_capture',
        sellerOwnershipConfirmed: true,
        ownerStructureType: 'company',
        companyName: 'Arch Holdings',
        companyRegistrationNumber: '2020/123456/07',
        companyRegisteredAddress: '1 Company Road',
        companyDirectors: [{ name: 'Dina', surname: 'Director', email: 'dina@example.com' }],
        authorisedSignatoryName: 'Dina Director',
        authorisedSignatoryCapacity: 'Director',
        email: 'contact@example.com',
        propertyAddress: '10 Example Street',
        bondStatus: 'no_bond',
      },
    },
  })

  assert.equal(model.profileType, 'company')
  assert.equal(model.profileLabel, 'Company')
  assert.deepEqual(model.groups.map((group) => group.title), [
    'Company details',
    'Directors',
    'Signing authority',
    'Primary contact details',
    'Property and ownership details',
  ])
  assert.ok(rowLabels(model).includes('Registration number'))
  assert.ok(!rowLabels(model).includes('Outstanding bond'))
  assert.ok(!rowLabels(model).includes('Marital status'))
})

test('individual sellers do not show entity or spouse fields unless relevant', () => {
  const model = buildListingSellerInformationModel({
    sellerOnboarding: {
      formData: {
        sellerProfileCaptureSource: 'listing_seller_profile_capture',
        sellerOwnershipConfirmed: true,
        ownerStructureType: 'individual',
        sellerFirstName: 'Indi',
        sellerSurname: 'Owner',
        idNumber: '9001010000000',
        propertyAddress: '20 Example Street',
      },
    },
  })

  assert.equal(model.profileType, 'individual')
  assert.ok(model.groups.some((group) => group.title === 'Individual details'))
  assert.ok(!model.groups.some((group) => group.title === 'Spouse details'))
  assert.ok(!model.groups.some((group) => group.title === 'Company details'))
})

test('trust sellers show trustees and beneficial owners without individual defaults', () => {
  const model = buildListingSellerInformationModel({
    sellerOnboarding: {
      formData: {
        sellerProfileCaptureSource: 'listing_seller_profile_capture',
        sellerOwnershipConfirmed: true,
        ownerStructureType: 'trust',
        trustName: 'Example Family Trust',
        trustRegistrationNumber: 'IT123/2020',
        trustees: [{ name: 'Terry', surname: 'Trustee' }],
        trustBeneficiaries: [{ name: 'Ben', surname: 'Beneficiary' }],
        authorisedTrusteeName: 'Terry Trustee',
        propertyAddress: '30 Example Street',
        bondStatus: 'bonded',
        bondHolder: 'Example Bank',
        outstandingBond: '1000000',
      },
    },
  })

  assert.deepEqual(model.groups.slice(0, 4).map((group) => group.title), [
    'Trust details',
    'Trustees',
    'Beneficial owners',
    'Signing authority',
  ])
  assert.ok(rowLabels(model).includes('Bond holder'))
  assert.ok(rowLabels(model).includes('Outstanding bond'))
  assert.ok(!rowLabels(model).includes('Marital status'))
})
