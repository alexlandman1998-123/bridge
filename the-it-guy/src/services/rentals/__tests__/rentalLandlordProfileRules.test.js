import { buildRentalListingLandlordMatrix } from '../rentalListingDocumentMatrixModel.js'
import { expect, it } from 'vitest'
import { landlordProfileErrors, landlordProfileFields, landlordPersonFields, resolvedLandlordType, LANDLORD_LEGAL_STRUCTURES } from '../rentalLandlordProfileRules.js'
import { normalizeLandlordProfile } from '../rentalLandlordWorkspaceModel.js'
import { publicRentalLandlordDiscovery, mergeRentalLandlordDiscovery, rentalLandlordSubmissionErrors } from '../rentalLandlordOnboardingModel.js'
import { rentalLandlordRequirementDefinitions } from '../rentalOnboardingRequirementModel.js'
const core = { name: 'Owner', email: 'owner@example.test', type: 'individual', residentialAddress: 'One Road', idNumber: 'PASSPORT' }
const person = { id: 'owner', name: 'Owner', role: 'Owner', idNumber: 'PASSPORT', residentialAddress: 'One Road', ownershipShare: '50', signingAuthority: true }
const entity = { ...core, type: 'company', registrationNumber: 'REG', authorisedSignatoryName: 'Signer', authorisedSignatoryCapacity: 'Director', authorisedSignatoryIdNumber: 'SIGNER-ID', authorisedSignatoryEmail: 'signer@example.test', authorityBasis: 'Resolution', people: [{ ...person, role: 'Director' }] }
const fields = profile => landlordProfileFields(profile).map(([key]) => key)
it('saves partial people and identity answers without silently removing the draft card', () => {
 const profile = { type: 'company', name: 'Partial', phone: '0821234567', people: [{ id: 'draft-person', email: 'person@example.test' }] }
 expect(landlordProfileErrors(profile)).toEqual([])
 expect(normalizeLandlordProfile(profile).people).toMatchObject([{ id: 'draft-person', name: '', email: 'person@example.test' }])
 expect(landlordProfileErrors(profile, { phase: 'submission' })).toContain('Enter the entity or trust registration number.')
})
it.each(LANDLORD_LEGAL_STRUCTURES)('resolves foreign and other %s owners without losing their classification', (type) => {
 for (const classification of ['foreign_owner', 'other_entity']) {
  let profile = { ...(type === 'individual' ? core : entity), type: classification, legalStructure: type, country: 'Canada', otherEntityDescription: 'Reviewed structure' }
  if (type === 'multiple_owners') profile = { ...profile, hasRepresentative: 'no', people: [person, { ...person, id: 'second', name: 'Second', signingAuthority: false }] }
  expect(resolvedLandlordType(profile)).toBe(type)
  expect(landlordProfileErrors(profile, { phase: 'submission' })).toEqual([])
  expect(normalizeLandlordProfile(profile)).toMatchObject({ type: classification, legalStructure: type })
  expect(rentalLandlordRequirementDefinitions({ profile, portfolio: [{ id: 'p' }] })).not.toHaveLength(0)
 }
})
it('keeps unresolved legal types as drafts and blocks declaration submission', () => {
 const profile = { ...core, type: 'foreign_owner', legalStructure: 'unresolved' }
 expect(landlordProfileErrors(profile)).toEqual([])
 expect(rentalLandlordSubmissionErrors({ profile, portfolio: [{ id: 'p', address: 'Road' }] })).toContain('Choose the underlying legal structure, or ask your agent to resolve it before submission.')
 expect(rentalLandlordRequirementDefinitions({ profile })).toEqual([])
})
it('uses conditional marital, VAT and representative fields and validates only active answers', () => {
 const profile = { ...core, maritalStatus: 'single', maritalRegime: 'unknown', vatRegistered: 'no', vatNumber: 'historical', hasRepresentative: 'no', authorisedSignatoryEmail: 'invalid', resolutionDate: '2026-02-31' }
 expect(fields(profile)).not.toContain('spouseName')
 expect(fields(profile)).not.toContain('vatNumber')
 expect(fields(profile)).not.toContain('authorisedSignatoryEmail')
 expect(landlordProfileErrors(profile, { phase: 'submission' })).toEqual([])
 expect(fields({ ...profile, maritalStatus: 'married', maritalRegime: 'in_community' })).toContain('spouseName')
 expect(landlordProfileErrors({ ...profile, maritalStatus: 'married' }, { phase: 'submission' })).toContain('Confirm the marital regime before submission.')
 expect(landlordProfileErrors({ ...profile, hasRepresentative: 'yes' })).toContain('Enter a valid signatory email.')
 expect(landlordProfileErrors({ ...profile, hasRepresentative: 'yes' })).toContain('Enter a valid resolution date.')
})
it('requires complete group ownership and an authorised signer at submission', () => {
 const profile = { ...core, type: 'multiple_owners', hasRepresentative: 'no', people: [person, { ...person, id: 'second', signingAuthority: false }] }
 expect(landlordProfileErrors(profile, { phase: 'submission' })).toEqual([])
 expect(landlordProfileErrors({ ...profile, people: profile.people.map(p => ({ ...p, ownershipShare: '20' })) }, { phase: 'submission' })).toContain('The owners’ shares must total 100%.')
 expect(landlordProfileErrors({ ...profile, people: profile.people.map(p => ({ ...p, signingAuthority: false })) }, { phase: 'submission' })).toContain('Confirm an authorised signer for the multiple owners.')
 expect(landlordPersonFields({ ...entity, type: 'trust' }).map(([key]) => key)).not.toContain('ownershipShare')
})
it('round trips conditional answers and signing authority through the public projection while retaining private notes', () => {
 const current = { profile: { ...entity, taxNumber: 'TAX', vatRegistered: 'yes', vatNumber: 'VAT', legalStructure: 'company', notes: 'PRIVATE', people: [{ ...person, notes: 'PRIVATE PERSON' }] }, portfolio: [{ id: 'p', listingId: 'internal', address: 'Road' }] }
 const projected = publicRentalLandlordDiscovery(current)
 expect(projected.profile).toMatchObject({ vatRegistered: 'yes', vatNumber: 'VAT', taxNumber: 'TAX' })
 expect(projected.profile.people[0].signingAuthority).toBe(true)
 expect(projected.profile.notes).toBeUndefined()
 projected.profile.vatRegistered = 'no'; projected.profile.people[0].signingAuthority = false
 const next = mergeRentalLandlordDiscovery(current, projected, { publicSource: true })
 expect(next.profile.notes).toBe('PRIVATE')
 expect(next.profile.people[0]).toMatchObject({ signingAuthority: false, notes: 'PRIVATE PERSON' })
 expect(next.portfolio[0].listingId).toBe('internal')
})
it('changes ownership evidence fingerprints when control changes and ignores inactive personal IDs for companies', () => {
 const data = { profile: entity, portfolio: [{ id: 'p' }] }
 const before = rentalLandlordRequirementDefinitions(data)
 const after = rentalLandlordRequirementDefinitions({ ...data, profile: { ...entity, people: [{ ...entity.people[0], signingAuthority: false }] } })
 expect(after.find(r => r.purpose === 'beneficial_ownership').fingerprint).not.toEqual(before.find(r => r.purpose === 'beneficial_ownership').fingerprint)
 expect(rentalLandlordRequirementDefinitions({ ...data, profile: { ...entity, idNumber: 'inactive changed' } })).toEqual(before)
})

it('uses the resolved legal structure for the listing checklist review state', () => {
 const onboarding = { data: { profile: { ...entity, type: 'foreign_owner', legalStructure: 'company' }, portfolio: [{ id: 'p', listingId: 'listing' }] }, requirements: [], documents: [] }
 expect(buildRentalListingLandlordMatrix({ id: 'listing' }, { id: 'lead' }, onboarding).manualReviewReason).toBe('')
 expect(buildRentalListingLandlordMatrix({ id: 'listing' }, { id: 'lead' }, { ...onboarding, data: { ...onboarding.data, profile: { ...onboarding.data.profile, legalStructure: 'unresolved' } } }).manualReviewReason).toContain('legal type')
})
