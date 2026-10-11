import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTransactionPartiesSnapshot, createTransactionPartyPerson, getTransactionParties, normalizeTransactionPartyProfile, partyPurchaserType, transactionPartiesOnboardingSeed, transactionPartyDocumentSubjects, transactionPartyMissingDetails, transactionSellerProfileFromSource } from '../transactionPartyProfile.js'
import { buildCanonicalRequiredDocumentRowsForTransactionContext } from '../../../services/documents/documentRequestCanonicalTransactionSyncService.js'
import { buildCanonicalSellerOnboardingPayload } from '../../../services/documents/sellerOnboardingFactTransformer.js'
import { transactionSellerProfileFormData, transactionSellerContactSlotId } from '../transactionPartyProfile.js'

const owner = (name, maritalRegime = 'unknown') => ({ ...createTransactionPartyPerson(), name, isOwner: true, primaryContact: true, signatory: true, maritalStatus: maritalRegime === 'unknown' ? 'single' : 'married', maritalRegime })
test('keeps identities, relationships and entity identity separate through a saved snapshot', () => {
  const person = owner('Jane', 'in_community')
  const spouse = { ...createTransactionPartyPerson('spouse'), name: 'Pat', spouseOfId: person.id, isOwner: true }
  const snapshot = buildTransactionPartiesSnapshot({ buyer: { entityType: 'company', name: 'Example Pty Ltd', registrationNumber: '2026/123', people: [{ ...person, role: 'director', isOwner: false }] }, seller: { entityType: 'multiple_owners', people: [person, spouse] } })
  const seed = transactionPartiesOnboardingSeed(snapshot)
  assert.equal(seed.company_name, 'Example Pty Ltd')
  assert.equal(seed.company_registration_number, '2026/123')
  assert.deepEqual(getTransactionParties(JSON.parse(JSON.stringify(seed))), snapshot)
  assert.equal(snapshot.seller.people[1].spouseOfId, person.id)
  assert.equal(snapshot.buyer.people[0].signatory, true)
})
test('requires confirmation instead of treating unknown marriage details as single', () => {
  const profile = normalizeTransactionPartyProfile({ entityType: 'individual', people: [createTransactionPartyPerson()] })
  assert.equal(profile.people[0].maritalStatus, 'unknown')
  assert(transactionPartyMissingDetails(profile).some((item) => item.includes('marital status')))
  assert.equal(profile.people[0].signatory, false)
  assert(transactionPartyMissingDetails({ entityType: 'multiple_owners', people: [owner('Jane')] }).some((item) => item.includes('two owners')))
})
test('maps marriage regime to existing buyer persona without discarding the individual status', () => {
  for (const [regime, persona] of [['in_community', 'married_coc'], ['out_of_community', 'married_anc'], ['out_of_community_with_accrual', 'married_anc_accrual']]) assert.equal(partyPurchaserType({ entityType: 'individual', people: [owner('Jane', regime)] }), persona)
  assert.equal(partyPurchaserType({ entityType: 'close_corporation' }), 'company')
})
test('mixed owners generate both marriage document sets for each side and preserve existing evidence', () => {
  const first = owner('Jane', 'in_community')
  const second = { ...owner('Alex', 'out_of_community_with_accrual'), primaryContact: false }
  const parties = buildTransactionPartiesSnapshot({ buyer: { entityType: 'multiple_owners', people: [first, second] }, seller: { entityType: 'multiple_owners', people: [first, second] } })
  const result = buildCanonicalRequiredDocumentRowsForTransactionContext({ transaction: { id: 'deal' }, onboardingFormData: transactionPartiesOnboardingSeed(parties), existingRows: [{ document_key: 'seller_id_document', is_uploaded: true, status: 'approved', uploaded_document_id: 'file', notes: 'Keep this' }] })
  const rows = new Map(result.rows.map((row) => [row.document_key, row]))
  for (const side of ['buyer', 'seller']) for (const suffix of ['id_document', 'marriage_certificate', 'spouse_id_document']) assert(rows.has(`${side}_${suffix}`), `${side}_${suffix}`)
  assert(rows.has('seller_anc_document'))
  assert(result.scenarioTokens.includes('buyer_married_anc'))
  assert.equal(rows.get('seller_id_document').uploaded_document_id, 'file')
  assert.equal(rows.get('seller_id_document').status, 'approved')
  assert.equal(rows.get('seller_id_document').allow_multiple, true)
  assert.match(rows.get('seller_id_document').description, /Jane, Alex/)
  assert.deepEqual(transactionPartyDocumentSubjects('buyer_anc_document', parties).map((person) => person.id), [second.id])
})
test('company, CC, trust and estate document sets use existing checklist branches', () => {
  for (const [entityType, side, requiredKey] of [['company', 'buyer', 'buyer_company_registration'], ['close_corporation', 'buyer', 'buyer_company_resolution'], ['trust', 'buyer', 'buyer_trust_deed'], ['company', 'seller', 'seller_company_registration'], ['close_corporation', 'seller', 'seller_company_resolution'], ['trust', 'seller', 'seller_letters_of_authority'], ['deceased_estate', 'seller', 'seller_executor_authority']]) {
    const parties = buildTransactionPartiesSnapshot({ [side]: { entityType, name: 'Entity', people: [] } })
    const result = buildCanonicalRequiredDocumentRowsForTransactionContext({ transaction: { id: 'deal' }, onboardingFormData: transactionPartiesOnboardingSeed(parties) })
    assert(result.rows.some((row) => row.document_key === requiredKey), requiredKey)
    assert(!result.rows.some((row) => row.document_key === `${side}_marriage_certificate`))
  }
})
test('unidentified parties do not receive invented individual document sets', () => {
  const parties = buildTransactionPartiesSnapshot({})
  const result = buildCanonicalRequiredDocumentRowsForTransactionContext({ transaction: { id: 'deal', purchaser_type: 'individual' }, onboardingFormData: transactionPartiesOnboardingSeed(parties) })
  assert.equal(result.audience, 'none')
  assert.equal(result.rows.length, 0)
})
test('removing a marriage clears its old regime from the saved profile', () => {
  const person = owner('Jane', 'in_community')
  const profile = normalizeTransactionPartyProfile({ entityType: 'individual', people: [{ ...person, maritalStatus: 'divorced' }] })
  assert.equal(profile.people[0].maritalRegime, 'unknown')
})

test('inherits existing seller ownership and marriage facts without changing the source', () => {
  const facts = { ownershipType: 'multiple_individuals', multipleOwners: [{ id: 'saved-jane', name: 'Jane', surname: 'Seller', maritalStatus: 'married', maritalRegime: 'in_community' }, { id: 'saved-alex', name: 'Alex', surname: 'Seller', maritalStatus: 'single' }] }
  const before = JSON.stringify(facts)
  const id = crypto.randomUUID()
  const profile = transactionSellerProfileFromSource({ facts, personId: id })
  assert.equal(profile.entityType, 'multiple_owners')
  assert.equal(profile.people[0].maritalRegime, 'in_community')
  assert.equal(profile.people[1].maritalStatus, 'single')
  assert.notEqual(profile.people[0].id, profile.people[1].id)
  assert.deepEqual(transactionSellerProfileFromSource({ facts, personId: id }), profile)
  assert.equal(JSON.stringify(facts), before)
})

test('the actual company capture retains registration, contact, directors and full person facts', () => {
  const formData = { ownerStructureType: 'company', companyName: 'Saved Company', companyRegistrationNumber: 'REG-1', primaryContactName: 'Office Contact', email: 'office@example.com', phone: 'new-phone',
    companyDirectors: [{ id: 'director-legacy-id', name: 'Dina', surname: 'Director', idNumber: 'identity', nationality: 'ZA', residentialAddress: 'Saved address', dateOfBirth: '1980-01-02', incomeTaxNumber: 'tax', signingAuthority: true }] }
  const facts = buildCanonicalSellerOnboardingPayload(formData).canonicalSellerFacts
  const profile = transactionSellerProfileFromSource({ facts, personId: 'contact-slot', onboardingId: 'capture-1' })
  assert.equal(profile.entityType, 'company')
  assert.equal(profile.registrationNumber, 'REG-1')
  assert.equal(profile.name, 'Saved Company')
  const director = profile.people.find((person) => person.role === 'director')
  assert.equal(director.id, 'director-legacy-id')
  assert.equal(director.sourceKey, JSON.stringify(['private_listing_seller_onboarding', 'capture-1', 'director-legacy-id']))
  assert.equal(director.residentialAddress, 'Saved address')
  assert.equal(director.dateOfBirth, '1980-01-02')
  assert.equal(director.incomeTaxNumber, 'tax')
  assert.equal(profile.people.find((person) => person.primaryContact).name, 'Office Contact')
  assert.deepEqual(getTransactionParties({ __bridge_transaction_parties: buildTransactionPartiesSnapshot({ seller: profile }) }).seller, profile)
})

test('trust and CC handoffs retain applicable roles and saved person identities', () => {
  const trust = { ownerStructureType: 'trust', trustName: 'Saved Trust', trustRegistrationNumber: 'TRUST-1', trustees: [{ id: 't-1', name: 'Trustee' }], trustFounders: [{ id: 'f-1', name: 'Founder' }], trustBeneficiaries: [{ id: 'b-1', name: 'Beneficiary' }], primaryContactName: 'Office' }
  const result = transactionSellerProfileFromSource({ facts: buildCanonicalSellerOnboardingPayload(trust).canonicalSellerFacts, personId: 'office', onboardingId: 'trust-capture' })
  assert.equal(result.registrationNumber, 'TRUST-1')
  assert.deepEqual(result.people.filter((person) => person.sourcePersonId).map((person) => [person.id, person.role]), [['t-1', 'trustee'], ['f-1', 'founder'], ['b-1', 'beneficiary']])
  const cc = transactionSellerProfileFromSource({ facts: { ownerStructureType: 'close_corporation', companyName: 'CC', companyDirectors: [{ id: 'member-1', name: 'Member' }] }, personId: 'contact' })
  assert.equal(cc.entityType, 'close_corporation')
  assert.equal(cc.people[0].role, 'member')
})

test('married canonical handoffs keep the spouse relationship and distinct identity / tax fields', () => {
  const formData = { ownerStructureType: 'married', sellerFirstName: 'Jane', sellerSurname: 'Owner', idNumber: 'owner-id', dateOfBirth: '1980-02-03', nationality: 'ZA', residentialAddress: 'Home', maritalRegime: 'in_community', spouseName: 'Pat Owner', spouseIdNumber: 'spouse-id', spousePhone: 'spouse-phone', incomeTaxNumber: 'owner-tax', saResident: 'yes', taxResident: 'no' }
  const profile = transactionSellerProfileFromSource({ facts: buildCanonicalSellerOnboardingPayload(formData).canonicalSellerFacts, personId: 'owner-slot', onboardingId: 'capture' })
  const primary = profile.people.find((person) => person.primaryContact)
  const spouse = profile.people.find((person) => person.role === 'spouse')
  assert.equal(primary.maritalStatus, 'married')
  assert.equal(primary.maritalRegime, 'in_community')
  assert.equal(primary.saResident, 'yes')
  assert.equal(primary.taxResident, 'no')
  assert.equal(spouse.spouseOfId, primary.id)
  assert.equal(spouse.identityNumber, 'spouse-id')
  assert.equal(spouse.phone, 'spouse-phone')
})

test('reordering owners preserves source identities and missing legacy identities require review', () => {
  const multipleOwners = [{ id: 'one', name: 'First' }, { id: 'two', name: 'Second' }]
  const first = transactionSellerProfileFromSource({ facts: { ownerStructureType: 'multiple_owners', multipleOwners }, onboardingId: 'capture', personId: 'contact' })
  const reordered = transactionSellerProfileFromSource({ facts: { ownerStructureType: 'multiple_owners', multipleOwners: [...multipleOwners].reverse() }, onboardingId: 'capture', personId: 'contact' })
  assert.deepEqual(first.people.filter((person) => person.isOwner).map((person) => person.id).sort(), reordered.people.filter((person) => person.isOwner).map((person) => person.id).sort())
  const legacy = transactionSellerProfileFromSource({ facts: { ownerStructureType: 'multiple_owners', multipleOwners: [{ name: 'No saved ID' }, { name: 'Another' }] }, personId: 'contact' })
  assert(legacy.people.filter((person) => person.isOwner).every((person) => person.id === '' && person.sourceLinkStatus === 'review_required'))
  assert(transactionPartyMissingDetails(legacy, 'Seller').some((message) => message.includes('saved person link requires review')))
})

test('a transaction snapshot adapter reads current people instead of stale capture contacts', () => {
  const profile = transactionSellerProfileFromSource({ facts: { ownerStructureType: 'individual', sellerFirstName: 'Jane', sellerSurname: 'Owner', email: 'old@example.com', phone: 'old', idNumber: 'identity', residentialAddress: 'Home' }, personId: 'contact' })
  profile.people[0].email = ''
  profile.people[0].phone = 'saved-new-phone'
  const fields = transactionSellerProfileFormData(profile)
  assert.equal(fields.email, '')
  assert.equal(fields.phone, 'saved-new-phone')
  assert.equal(fields.idNumber, 'identity')
  assert.equal(fields.residentialAddress, 'Home')
})

test('only a transaction-local contact slot can become the seller participant row identity', () => {
  const slot = crypto.randomUUID()
  const profile = transactionSellerProfileFromSource({ facts: { ownerStructureType: 'individual', sellerFirstName: 'Jane' }, personId: slot })
  assert.equal(transactionSellerContactSlotId(profile), slot)
  const sharedRosterId = crypto.randomUUID()
  assert.equal(transactionSellerContactSlotId({ people: [{ id: sharedRosterId, sourcePersonId: sharedRosterId, primaryContact: true }] }), null)
  assert.equal(transactionSellerContactSlotId({ people: [...profile.people, { id: crypto.randomUUID(), sourceSlot: 'primary_contact', primaryContact: true }] }), null)
})
