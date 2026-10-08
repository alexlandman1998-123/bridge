import { expect, it } from 'vitest'
import { initialiseRentalApplicationWizard, rentalApplicationVisibleFields, rentalApplicationDocumentSlots, rentalApplicationDocumentForSlot, rentalApplicationDocumentProgress, rentalApplicationPersonFields, reuseRentalTenantIdentity } from '../rentalApplicationWizardModel.js'
import { RENTAL_APPLICATION_FIELD_GROUPS, RENTAL_APPLICATION_SCHEMA_VERSION, validateRentalApplicationFields } from '../rentalApplicationFieldContract.js'
import { isRentalApplicantPortalReadyToSubmit } from '../rentalApplicantPortalModel.js'
const group = (key) => RENTAL_APPLICATION_FIELD_GROUPS.find((item) => item.key === key)
const complete = () => ({ schemaVersion: RENTAL_APPLICATION_SCHEMA_VERSION, entity: { type: 'individual' }, identity: { firstName: 'Alex', lastName: 'Tenant', email: 'a@example.test', identityNumber: 'passport' }, household: { occupantCount: 1, intendedOccupationDate: '2026-11-01' }, employment: { employmentType: 'employed', employer: 'Acme' }, income: { monthlyIncome: 25000 }, rentalHistory: { currentAddress: '12 Road', reasonForMoving: 'Work' } })
it('uses the new schema for legacy drafts, and shows fields for the selected income and entity scenario', () => {
  expect(initialiseRentalApplicationWizard({ schemaVersion: 'old' }).schemaVersion).toBe(RENTAL_APPLICATION_SCHEMA_VERSION)
  expect(rentalApplicationVisibleFields(group('entity'), { entity: { type: 'individual' } }).map((item) => item.key)).toEqual(['type'])
  expect(rentalApplicationVisibleFields(group('employment'), { entity: { type: 'company' } })).toEqual([])
  const fields = rentalApplicationVisibleFields(group('employment'), { employment: { employmentType: 'self_employed' } }).map((item) => item.key)
  expect(fields).toContain('businessName'); expect(fields).not.toContain('employer')
  expect(rentalApplicationVisibleFields(group('household'), { household: { pets: 'no' } }).map((item) => item.key)).not.toContain('petDetails')
})
it('reuses contact details without copying finances, roles, documents or private stored fields', () => {
  const result = reuseRentalTenantIdentity({ identity: { firstName: 'Previous', verifiedBy: 'internal' }, income: { monthlyIncome: 1 }, people: [{ id: 'old' }], documentLinks: [{ documentId: 'old' }] }, { identity: { phone: '082' }, income: { monthlyIncome: 20000 }, people: [] })
  expect(result.identity).toEqual({ firstName: 'Previous', phone: '082' }); expect(result.income.monthlyIncome).toBe(20000); expect(result.people).toEqual([]); expect(result.documentLinks).toBeUndefined()
})
it('keeps evidence attached to the correct person and requires entity authority and other people consent', () => {
  const data = { ...complete(), entity: { type: 'trust', legalName: 'Trust', registrationNumber: 'IT1', primaryContactRole: 'trustee' }, income: { monthlyIncome: 100000, incomeSource: 'Rental income' }, people: [{ id: 'g', role: 'guarantor', firstName: 'Sam', identityNumber: 'support-id', email: 'sam@example.test', lastName: 'Person' }] }
  const slots = rentalApplicationDocumentSlots(data).filter((item) => item.required)
  expect(slots.map((item) => item.key)).toContain('entity:authority'); expect(slots.map((item) => item.key)).toContain('g:signed_consent')
  const documents = slots.map((slot, index) => ({ id: `d${index}`, document_type: slot.type, status: 'uploaded' }))
  data.documentLinks = slots.map((slot, index) => ({ documentId: `d${index}`, subjectId: slot.subjectId, purpose: slot.purpose }))
  const consents = { privacy: true, credit_check: true, identity_verification: true }
  expect(isRentalApplicantPortalReadyToSubmit({ data, documents, consents })).toBe(true)
  const wrong = { ...data, documentLinks: data.documentLinks.map((item) => item.subjectId === 'g' ? { ...item, subjectId: 'wrong' } : item) }
  // Details submission is deferred from evidence collection; person assignment
  // must still prevent another person's files from fulfilling this checklist.
  expect(isRentalApplicantPortalReadyToSubmit({ data: wrong, documents, consents })).toBe(true)
  const guarantorIdentity = slots.find((slot) => slot.key === 'g:identity')
  expect(rentalApplicationDocumentForSlot(guarantorIdentity, documents, data)).toBeTruthy()
  expect(rentalApplicationDocumentForSlot(guarantorIdentity, documents, wrong)).toBeUndefined()
  expect(rentalApplicationDocumentProgress({ data: wrong, documents }).uploaded).toBeLessThan(rentalApplicationDocumentProgress({ data, documents }).uploaded)
  expect(rentalApplicationDocumentForSlot(slots[0], [{ id: 'legacy', type: 'identity', name: 'ID.pdf', status: 'uploaded' }], {})).toBeTruthy()
})
it('shows financial questions for a guarantor and supports student sponsorship without inventing primary income', () => {
  const person = { id: 'g', role: 'guarantor', firstName: 'Sam', identityNumber: 'support-id', email: 'sam@example.test', lastName: 'Person', monthlyIncome: 40000 }
  expect(rentalApplicationPersonFields(group('people'), person).map((item) => item.key)).toContain('monthlyIncome')
  expect(rentalApplicationPersonFields(group('people'), { role: 'beneficial_owner' }).map((item) => item.key)).not.toContain('monthlyIncome')
  const data = { ...complete(), employment: { employmentType: 'student', incomeSource: 'Guarantor support' }, income: { monthlyIncome: 0 }, people: [person] }
  expect(validateRentalApplicationFields(data)).toEqual([])
  data.people[0].id = 'primary'; data.household.intendedOccupationDate = '2026-02-31'; data.identity.email = 'bad-email'
  expect(validateRentalApplicationFields(data)).toContain('Additional people need their own unique references.')
  expect(validateRentalApplicationFields(data)).toContain('Intended move date must be a valid date.')
  expect(validateRentalApplicationFields(data)).toContain('Email must be a valid email address.')
})
