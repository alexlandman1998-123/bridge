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

it('uses explicit take-home income and replaces legacy commitments without double counting', async () => {
  const { rentalAffordabilitySummary, updateRentalApplicationGroup } = await import('../rentalApplicationWizardModel.js')
  const old = { income: { monthlyIncome: 40000, monthlyObligations: 9000 }, property: { monthlyRent: 10000 } }
  expect(rentalAffordabilitySummary(old).netKnown).toBe(false)
  const next = updateRentalApplicationGroup(old, 'income', 'netMonthlyIncome', '25000')
  expect(next.income).toMatchObject({ monthlyIncome: '25000', incomeBasis: 'net' })
  expect(rentalAffordabilitySummary({ ...next, income: { ...next.income, debtRepayments: 2000, livingExpenses: 5000, otherObligations: 0 } })).toMatchObject({ net: 25000, expenses: 7000, available: 18000, rentPercent: 40 })
  expect(old.income.monthlyIncome).toBe(40000)
})
it('supports a sponsored first-time renter without personal income and keeps sponsor evidence separate', () => {
  const data = complete()
  data.employment = { employmentType: 'student', incomeSource: 'Parent sponsorship' }
  data.income = { netMonthlyIncome: 0, rentPayer: 'sponsor', depositPayer: 'sponsor' }
  data.rentalHistory = { currentAddress: 'Family home', reasonForMoving: 'Study', housingSituation: 'living_with_family', firstTimeRenter: true }
  data.people = [{ id: 's', role: 'sponsor', firstName: 'Sam', lastName: 'Support', identityNumber: 'SUPPORT-ID', phone: '0821234567', monthlyIncome: 35000, rentContribution: 11000 }]
  expect(validateRentalApplicationFields(data)).toEqual([])
  expect(rentalApplicationVisibleFields(group('rentalHistory'), data).map(field => field.key)).not.toContain('landlordName')
  expect(rentalApplicationDocumentSlots(data).filter(slot => slot.required).map(slot => slot.key)).toEqual(['primary:identity', 's:identity', 's:signed_consent', 's:proof_of_income'])
})
it('fills missing qualification answers without replacing edits or copying screening consent', async () => {
  const { prefillRentalApplicationFromQualification } = await import('../rentalApplicationWizardModel.js')
  const existing = { household: { occupantCount: 1, pets: 'yes' }, income: { depositAvailable: false } }
  const result = prefillRentalApplicationFromQualification(existing, { occupationDate: '2026-12-01', occupants: 3, pets: 'No pets', employmentStatus: 'Employed', depositAvailable: 'Yes', screeningConsent: 'Yes', additionalNotes: 'Internal' })
  expect(result).toEqual({ household: { occupantCount: 1, pets: 'yes', intendedOccupationDate: '2026-12-01' }, income: { depositAvailable: false }, employment: { employmentType: 'employed' } })
  expect(existing.household).toEqual({ occupantCount: 1, pets: 'yes' })
})
it('does not treat an occupant who signs as an applicant with completed screening', () => {
  const data = complete()
  data.occupants = [{ id: 'adult', firstName: 'Sam', lastName: 'Resident', signsLease: true }]
  expect(validateRentalApplicationFields(data)).toContain('Add each adult occupant who will sign the lease as a co-tenant under People & contacts.')
  data.people = [{ id: 'co-tenant', role: 'co_tenant', firstName: 'Sam', lastName: 'Resident', identityNumber: 'ID', phone: '082' }]
  expect(validateRentalApplicationFields(data)).toEqual([])
})
it('keeps entity income editable when earlier individual net figures remain in history', async () => {
  const { updateRentalApplicationGroup, rentalAffordabilitySummary } = await import('../rentalApplicationWizardModel.js')
  const data = { entity: { type: 'company' }, income: { monthlyIncome: 25000, netMonthlyIncome: 25000 } }
  const next = updateRentalApplicationGroup(data, 'income', 'monthlyIncome', 50000)
  expect(next.income.monthlyIncome).toBe(50000)
  expect(rentalAffordabilitySummary(next).netKnown).toBe(false)
})
it('recognises an entity representative who also lives at the property without making them a co-tenant', () => {
  const data = complete()
  data.entity = { type: 'company', legalName: 'Example Ltd', registrationNumber: 'REG-1' }
  data.income.incomeSource = 'Business operations'
  data.occupants = [{ id: 'adult', firstName: 'Sam', lastName: 'Resident', signsLease: true }]
  data.people = [{ id: 'signer', role: 'authorised_signatory', firstName: 'Sam', lastName: 'Resident', identityNumber: 'ID', phone: '082' }]
  expect(validateRentalApplicationFields(data)).toEqual([])
})
