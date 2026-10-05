import { expect, it } from 'vitest'
import { buildProjectedTransactionRequirementCandidates, buildTransactionDocumentFacts } from '../transactionCanonicalDocumentRequirementService.js'
import { buildTransactionPartiesSnapshot, createTransactionPartyPerson, transactionPartiesOnboardingSeed } from '../../../core/transactions/transactionPartyProfile.js'

it('creates separate canonical identity instances for co-owners, stable after reorder and reload', () => {
  const people = ['Jane', 'Alex'].map((name) => ({ ...createTransactionPartyPerson(), name, maritalStatus: 'single' }))
  const parties = buildTransactionPartiesSnapshot({ buyer: { entityType: 'multiple_owners', people }, seller: { entityType: 'trust', name: 'Seller Trust', people: [{ ...createTransactionPartyPerson('trustee'), name: 'Pat' }] } })
  const definitions = ['buyer_id_document', 'buyer_proof_of_address', 'seller_trust_deed', 'seller_trustee_fica'].map((key) => ({ key, display_label: key, pack_key: key.startsWith('seller_') ? 'seller_identity_fica' : 'buyer_identity_fica', default_visibility: ['agent'], default_upload_roles: ['agent'] }))
  const build = (snapshot) => buildProjectedTransactionRequirementCandidates({ transaction: { id: 'deal', purchaser_type: 'individual', finance_type: 'cash' }, formData: transactionPartiesOnboardingSeed(snapshot), definitions, rules: [] }).candidates
  const before = build(parties)
  const ids = before.filter((candidate) => candidate.generated.document_definition_key === 'buyer_id_document')
  expect(ids).toHaveLength(2)
  expect(ids.map((candidate) => candidate.generated.requested_from_contact_id).sort()).toEqual(people.map((person) => person.id).sort())
  const after = build({ ...parties, buyer: { ...parties.buyer, people: [...people].reverse() } })
  expect(after.map((candidate) => `${candidate.generated.document_definition_key}:${candidate.generated.requested_from_contact_id}`).sort()).toEqual(before.map((candidate) => `${candidate.generated.document_definition_key}:${candidate.generated.requested_from_contact_id}`).sort())
  expect(before.find((candidate) => candidate.generated.document_definition_key === 'seller_trustee_fica').explicitMeta.party.name).toBe('Pat')
})
it('company capture does not produce individual identity requirements for the entity', () => {
  const parties = buildTransactionPartiesSnapshot({ buyer: { entityType: 'company', name: 'Buyer Pty Ltd', people: [{ ...createTransactionPartyPerson('director'), name: 'Jane' }] } })
  const definitions = ['buyer_id_document', 'buyer_director_fica', 'buyer_company_registration'].map((key) => ({ key, pack_key: 'buyer_identity_fica', default_visibility: ['agent'], default_upload_roles: ['agent'] }))
  const result = buildProjectedTransactionRequirementCandidates({ transaction: { id: 'deal', purchaser_type: 'company' }, formData: transactionPartiesOnboardingSeed(parties), definitions, rules: [] })
  expect(result.candidates.some((candidate) => candidate.generated.document_definition_key === 'buyer_id_document')).toBe(false)
  expect(result.candidates.find((candidate) => candidate.generated.document_definition_key === 'buyer_director_fica').explicitMeta.party.name).toBe('Jane')
})

it('includes the captured seller bond position in canonical requirements without approving the buyer bond', () => {
  const facts = buildTransactionDocumentFacts({ transaction: { id: 'deal', finance_type: 'bond' }, formData: { __bridge_finance: { captureSnapshot: { sellerBondStatus: 'yes', bondStatus: 'approved' } } } })
  expect(facts.seller.existing_bond).toBe(true)
  const cleared = buildTransactionDocumentFacts({ transaction: { id: 'deal', finance_type: 'cash' }, formData: { __bridge_finance: { captureSnapshot: { sellerBondStatus: 'no' } } } })
  expect(cleared.seller.existing_bond).toBe(false)
})
