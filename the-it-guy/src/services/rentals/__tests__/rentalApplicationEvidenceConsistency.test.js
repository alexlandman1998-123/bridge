import { expect, it } from 'vitest'
import { mergeRentalApplicationData, publicRentalApplicationData, validateRentalApplicationFields, RENTAL_APPLICATION_SCHEMA_VERSION } from '../rentalApplicationFieldContract.js'
import { rentalApplicationDocumentForSlot, rentalApplicationDocumentSlots, rentalApplicationDocumentProgress, initialiseRentalApplicationWizard } from '../rentalApplicationWizardModel.js'
import { rentalReviewDocument, rentalReviewSubjects } from '../rentalApplicationReviewModel.js'
import { isRentalApplicantPortalReadyToSubmit } from '../rentalApplicantPortalModel.js'
const slot = { subjectId: 'primary', purpose: 'identity' }
const docs = [{ id: 'old', type: 'identity', status: 'accepted', uploaded_at: '2026-01-01' }, { id: 'new', type: 'identity', status: 'rejected', uploaded_at: '2026-02-01' }]
const complete = () => ({ schemaVersion: RENTAL_APPLICATION_SCHEMA_VERSION, entity: { type: 'individual' }, identity: { firstName: 'Alex', lastName: 'Tenant', email: 'a@example.test', identityNumber: 'passport' }, household: { occupantCount: 1, intendedOccupationDate: '2026-11-01' }, employment: { employmentType: 'student', incomeSource: 'Guarantor support' }, income: { monthlyIncome: 0 }, rentalHistory: { currentAddress: '12 Road', reasonForMoving: 'Work' }, people: [{ id: 'g', role: 'guarantor', firstName: 'Sam', lastName: 'Support', identityNumber: 'id-g', phone: '082', monthlyIncome: 40000 }] })
const consents = { privacy: true, credit_check: true, identity_verification: true }
it('shows the current rejection regardless of order, and cannot count the older acceptance', () => {
  for (const documents of [docs, [...docs].reverse()]) {
    expect(rentalApplicationDocumentForSlot(slot, documents, {}).id).toBe('new')
    expect(rentalReviewDocument(slot, { documents }).id).toBe('new')
    expect(rentalApplicationDocumentProgress({ documents, data: { documents: { old: true }, requiredDocuments: ['fake'] } }).uploaded).toBe(0)
  }
})
it('uses created time and ID to resolve equal or missing uploaded timestamps consistently', () => {
  const documents = [{ ...docs[0], uploaded_at: null, created_at: '2026-01-01' }, { ...docs[1], uploaded_at: null, created_at: '2026-02-01' }]
  expect(rentalApplicationDocumentForSlot(slot, documents).id).toBe('new')
})
it.each(['agent', 'applicant'])('invalidates explicit and legacy evidence after %s identity edits, through reload and reversal', (source) => {
  const before = { identity: { identityNumber: 'A' }, documentLinks: [{ documentId: 'old', subjectId: 'primary', purpose: 'identity' }] }
  const changed = mergeRentalApplicationData(before, { identity: { identityNumber: 'B' } }, { source })
  const reloaded = publicRentalApplicationData(JSON.parse(JSON.stringify(changed)))
  expect(reloaded.documentLinks[0].invalidated).toBe(true)
  expect(rentalApplicationDocumentForSlot(slot, docs, reloaded)).toBeUndefined()
  const reversed = mergeRentalApplicationData(changed, { identity: { identityNumber: 'A' }, documentInvalidations: [], documentLinks: [] }, { source })
  expect(rentalApplicationDocumentForSlot(slot, docs, reversed)).toBeUndefined()
  const uploaded = mergeRentalApplicationData(changed, { documentLinks: [...changed.documentLinks, { documentId: 'new', subjectId: 'primary', purpose: 'identity' }] })
  expect(rentalApplicationDocumentForSlot(slot, docs, uploaded).id).toBe('new')
})
it('invalidates a changed representative, removed person and changed entity authority without losing files', () => {
  const before = { entity: { type: 'company', primaryContactRole: 'authorised_signatory' }, people: [{ id: 's', role: 'authorised_signatory', identityNumber: 'A' }], documentLinks: [{ documentId: 's-id', subjectId: 's', purpose: 'identity' }, { documentId: 'authority', subjectId: 'entity', purpose: 'authority' }] }
  expect(mergeRentalApplicationData(before, { people: [{ ...before.people[0], identityNumber: 'B' }] }).documentLinks[0].invalidated).toBe(true)
  expect(mergeRentalApplicationData(before, { people: [] }).documentLinks[0].invalidated).toBe(true)
  expect(mergeRentalApplicationData(before, { entity: { primaryContactRole: 'trustee' } }).documentLinks.every((link) => link.invalidated)).toBe(true)
})
it('allows a complete guarantor-funded student to submit without primary income evidence', () => {
  const data = complete()
  const slots = rentalApplicationDocumentSlots(data).filter((item) => item.required)
  expect(slots.map((item) => item.key)).not.toContain('primary:proof_of_income')
  expect(rentalReviewSubjects(data, 'affordability').map((item) => item.id)).toEqual(['g'])
  expect(rentalReviewSubjects(data, 'identity').map((item) => item.id)).toEqual(['primary', 'g'])
  data.documentLinks = slots.map((item, i) => ({ documentId: `d${i}`, subjectId: item.subjectId, purpose: item.purpose }))
  const documents = slots.map((item, i) => ({ id: `d${i}`, document_type: item.type, status: 'uploaded' }))
  expect(isRentalApplicantPortalReadyToSubmit({ data, documents, consents })).toBe(true)
  documents[0].status = 'rejected'
  expect(isRentalApplicantPortalReadyToSubmit({ data, documents, consents })).toBe(false)
})
it('requires additional person identity and contact, and assigns entity income to the entity', () => {
  const data = complete(); delete data.people[0].identityNumber; delete data.people[0].phone
  expect(validateRentalApplicationFields(data)).toContain('Additional person ID / passport number is required.')
  expect(validateRentalApplicationFields(data)).toContain('Each additional person needs an email or phone.')
  const entity = { entity: { type: 'company' }, income: { monthlyIncome: 50000 } }
  const income = rentalApplicationDocumentSlots(entity).find((item) => item.purpose === 'proof_of_income')
  expect(income.subjectId).toBe('entity')
  expect(rentalApplicationDocumentForSlot(income, [{ id: 'income', type: 'proof_of_income', status: 'accepted' }], entity)).toBeUndefined()
})

it('preserves database timestamp precision when selecting a replacement in the same millisecond', () => {
  const documents = [{ id: 'z-old', type: 'identity', status: 'accepted', uploaded_at: '2026-01-01T00:00:00.123001Z' }, { id: 'a-new', type: 'identity', status: 'rejected', uploaded_at: '2026-01-01T00:00:00.123002+00:00' }]
  expect(rentalApplicationDocumentForSlot(slot, documents).id).toBe('a-new')
})

it('reopens an entity application without treating its saved type as an identity edit', () => {
  const saved = { entity: { type: 'company', legalName: 'Company' }, people: [{ id: 's', role: 'authorised_signatory' }], documentLinks: [{ documentId: 'income', subjectId: 'entity', purpose: 'proof_of_income' }] }
  const reopened = initialiseRentalApplicationWizard(saved)
  expect(reopened.documentLinks).toEqual(saved.documentLinks)
  expect(reopened.documentInvalidations).toBeUndefined()
})
