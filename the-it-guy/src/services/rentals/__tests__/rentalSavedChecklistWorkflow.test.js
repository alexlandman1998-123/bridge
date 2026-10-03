import { expect, it } from 'vitest'
import { rentalApplicationSavedDocumentSlots, rentalApplicationDocumentForSlot, rentalApplicationDocumentProgress } from '../rentalApplicationWizardModel.js'
import { rentalSavedRequirementProgress } from '../rentalSavedRequirementModel.js'
const data = { entity: { type: 'individual' }, documentLinks: [{ documentId: 'old', subjectId: 'primary', purpose: 'identity' }] }
const documents = [{ id: 'old', document_type: 'identity', status: 'accepted' }, { id: 'new', document_type: 'identity', status: 'rejected' }]
const requirement = { id: 'identity-requirement', generation: 2, scopeKey: 'application', subjectId: 'primary', purpose: 'identity', required: true, active: true, mode: 'active', documentId: null, state: 'missing' }
it('never revives accepted historical evidence when the saved generation has no current assignment', () => {
  const slots = rentalApplicationSavedDocumentSlots(data, [requirement])
  expect(slots[0]).toMatchObject({ requirementId: 'identity-requirement', generation: 2, state: 'missing' })
  expect(rentalApplicationDocumentForSlot(slots[0], documents, data)).toBeUndefined()
  expect(rentalApplicationDocumentProgress({ data, documents, requirements: [requirement] }).uploaded).toBe(0)
})
it('shows the saved rejected replacement and keeps expiry and preview out of completion', () => {
  const slots = rentalApplicationSavedDocumentSlots(data, [{ ...requirement, documentId: 'new', state: 'rejected' }])
  expect(rentalApplicationDocumentForSlot(slots[0], documents, data)?.id).toBe('new')
  expect(rentalSavedRequirementProgress([{ ...requirement, state: 'accepted', expiresAt: '2000-01-01' }]).approvalComplete).toBe(false)
  expect(rentalSavedRequirementProgress([{ ...requirement, state: 'accepted', mode: 'preview' }]).collectionComplete).toBe(false)
  expect(rentalSavedRequirementProgress(null).collectionComplete).toBe(false)
})
