import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTransactionPartiesSnapshot, createTransactionPartyPerson, getTransactionParties, normalizeTransactionPartyProfile, partyPurchaserType, transactionPartiesOnboardingSeed, transactionPartyDocumentSubjects, transactionPartyMissingDetails, transactionSellerProfileFromSource } from '../transactionPartyProfile.js'
import { buildCanonicalRequiredDocumentRowsForTransactionContext } from '../../../services/documents/documentRequestCanonicalTransactionSyncService.js'

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
  const facts = { ownershipType: 'multiple_individuals', multipleOwners: [{ name: 'Jane', surname: 'Seller', maritalStatus: 'married', maritalRegime: 'in_community' }, { name: 'Alex', surname: 'Seller', maritalStatus: 'single' }] }
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
