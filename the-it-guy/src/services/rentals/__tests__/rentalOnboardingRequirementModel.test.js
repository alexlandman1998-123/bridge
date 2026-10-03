import { expect, it } from 'vitest'
import { rentalTenantRequirementDefinitions, rentalLandlordRequirementDefinitions, rentalRequirementProgress } from '../rentalOnboardingRequirementModel.js'
it('uses the current tenant matrix for both capture routes without activating proposed rules', () => {
  const data = { entity: { type: 'company' }, identity: { identityNumber: 'contact' }, people: [{ id: 's', role: 'authorised_signatory' }] }
  const rows = rentalTenantRequirementDefinitions(data)
  expect(rows.find((row) => row.purpose === 'proof_of_income').subjectId).toBe('entity')
  expect(rows.some((row) => row.purpose === 'address')).toBe(false)
  expect(rows.find((row) => row.purpose === 'bank_statement').required).toBe(false)
  expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
})
it('generates one reusable landlord identity pack and separate property packs', () => {
  const rows = rentalLandlordRequirementDefinitions({ profile: { type: 'individual', name: 'Owner', idNumber: 'A' }, portfolio: [{ id: 'p1' }, { id: 'p2' }] })
  expect(rows.filter((row) => row.purpose === 'identity')).toHaveLength(1)
  expect(rows.filter((row) => row.purpose === 'property_disclosure').map((row) => row.scopeKey)).toEqual(['property:p1', 'property:p2'])
  expect(rows.some((row) => row.purpose === 'proof_of_income')).toBe(false)
})
it.each(['company','close_corporation','trust'])('previews %s evidence with actual authority purposes', (type) => {
  const rows = rentalLandlordRequirementDefinitions({ profile: { type, name: 'Entity' }, portfolio: [{ id: 'p1' }] })
  expect(rows.some((row) => row.purpose === 'signing_authority')).toBe(true)
  expect(rows.some((row) => row.purpose === 'beneficial_ownership')).toBe(true)
  expect(rows.some((row) => row.purpose === (type === 'trust' ? 'trust_founding' : 'entity_registration'))).toBe(true)
})
it('leaves unresolved or exceptional landlord types unresolved rather than defaulting to individual', () => {
  for (const type of [undefined, 'foreign_owner', 'other_entity']) expect(rentalLandlordRequirementDefinitions({ profile: { type } })).toEqual([])
})
it('distinguishes collection from acceptance, and excludes preview and superseded requirements', () => {
  const rows = [{ active: true, required: true, mode: 'active', state: 'accepted' }, { active: true, required: true, mode: 'active', state: 'received' }, { active: false, required: true, mode: 'active', state: 'rejected' }, { active: true, required: true, mode: 'preview', state: 'missing' }]
  expect(rentalRequirementProgress(rows)).toEqual({ required: 2, received: 2, accepted: 1, collectionComplete: true, approvalComplete: false })
  expect(rentalRequirementProgress([{ ...rows[1], state: 'rejected' }]).collectionComplete).toBe(false)
  expect(rentalRequirementProgress([]).approvalComplete).toBe(false)
})
