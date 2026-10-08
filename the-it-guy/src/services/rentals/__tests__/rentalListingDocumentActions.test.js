import { expect, it, vi } from 'vitest'
import { rentalListingDocumentProgress } from '../rentalListingDocumentMatrixModel.js'
import { rentalListingCanUpload, uploadRentalListingRequirement, reviewRentalListingDocument, getRentalListingDocumentUrl } from '../rentalListingDocumentActions.js'
import { buildRentalListingOverview } from '../rentalListingOverviewModel.js'

const requirement = { id: 'r', active: true, generation: 2, mode: 'active', required: true, subjectId: 'person', purpose: 'proof_of_income', scopeKey: 'application', state: 'received' }
const row = { ...requirement, requirementId: 'r', title: 'Person income evidence', documents: [{ id: 'doc', name: 'income.pdf' }] }
const tenant = { id: 'app', rows: [row], application: { id: 'app', status: 'submitted', version: 10, requirements: [requirement] } }
const file = (name) => ({ name, type: 'application/pdf', size: 10 })

it('uploads one replacement pack in sequence using each acknowledged version and exact subject/generation', async () => {
  const upload = vi.fn().mockResolvedValueOnce({ application: { ...tenant.application, version: 11 } }).mockResolvedValueOnce({ application: { ...tenant.application, version: 12 } })
  expect(await uploadRentalListingRequirement('tenant', tenant, row, [file('one.pdf'), file('two.pdf')], { uploadRentalApplicationEvidence: upload })).toEqual({ savedCount: 2 })
  expect(upload.mock.calls[0][0].version).toBe(10)
  expect(upload.mock.calls[1][0].version).toBe(11)
  expect(upload.mock.calls[0][2]).toMatchObject({ requirementId: 'r', generation: 2, subjectId: 'person', purpose: 'proof_of_income', appendToPack: false })
  expect(upload.mock.calls[1][2].appendToPack).toBe(true)
})

it('reports partial commits and stops on failed checklist readback without re-uploading saved files', async () => {
  const upload = vi.fn().mockResolvedValueOnce({ application: { ...tenant.application, version: 11 } }).mockRejectedValueOnce(new Error('Network unavailable'))
  await expect(uploadRentalListingRequirement('tenant', tenant, row, [file('one.pdf'), file('two.pdf')], { uploadRentalApplicationEvidence: upload })).rejects.toMatchObject({ savedCount: 1, message: expect.stringContaining('1 of 2 files saved') })
  upload.mockReset().mockResolvedValue({ application: { ...tenant.application, version: 11, requirements: null } })
  await expect(uploadRentalListingRequirement('tenant', tenant, row, [file('one.pdf'), file('two.pdf')], { uploadRentalApplicationEvidence: upload })).rejects.toMatchObject({ savedCount: 1 })
  expect(upload).toHaveBeenCalledTimes(1)
})

it('blocks final applications, accepted current evidence, stale generations and invalid files before writes', async () => {
  const upload = vi.fn()
  expect(rentalListingCanUpload('tenant', { ...tenant, application: { ...tenant.application, status: 'approved' } }, row)).toBe(false)
  expect(rentalListingCanUpload('tenant', tenant, { ...row, state: 'accepted' })).toBe(false)
  expect(rentalListingCanUpload('tenant', tenant, { ...row, state: 'accepted', expiresAt: '2000-01-01' })).toBe(true)
  await expect(uploadRentalListingRequirement('tenant', tenant, { ...row, generation: 3 }, [file('one.pdf')], { uploadRentalApplicationEvidence: upload })).rejects.toThrow('requirement changed')
  await expect(uploadRentalListingRequirement('tenant', tenant, row, [file('one.pdf'), { ...file('bad.exe'), type: 'application/octet-stream' }], { uploadRentalApplicationEvidence: upload })).rejects.toThrow()
  expect(upload).not.toHaveBeenCalled()
})

it('binds landlord uploads to the saved lead version and requirement and honours submitted locks', async () => {
  const landlord = { id: 'lead', rows: [row], onboarding: { status: 'draft', version: 5, requirements: [requirement] } }
  const request = vi.fn().mockResolvedValue({ onboarding: landlord.onboarding })
  const upload = vi.fn(async (_file, _slot, _version, call) => call({ action: 'complete_upload', version: 5, ticket: 'signed-receipt' }))
  await uploadRentalListingRequirement('landlord', landlord, row, [file('one.pdf')], { uploadRentalApplicationFile: upload, requestRentalLandlordOnboarding: request })
  expect(upload.mock.calls[0][1]).toMatchObject({ requirementId: 'r', generation: 2 })
  expect(upload.mock.calls[0][2]).toBe(5)
  expect(request).toHaveBeenCalledWith('lead', 'POST', { action: 'complete_upload', version: 5, ticket: 'signed-receipt' })
  expect(rentalListingCanUpload('landlord', { ...landlord, onboarding: { ...landlord.onboarding, status: 'submitted' } }, row)).toBe(false)
})

it('reviews only current matrix files with notes and an explicit signed disclosure confirmation', async () => {
  const review = vi.fn().mockResolvedValue({ version: 11 })
  await reviewRentalListingDocument('tenant', tenant, row.documents[0], { status: 'accepted', note: 'Readable evidence' }, { recordRentalApplicationReview: review })
  expect(review).toHaveBeenCalledWith({ applicationId: 'app', expectedVersion: 10, command: 'review_document', payload: { documentId: 'doc', status: 'accepted', note: 'Readable evidence' } })
  await expect(reviewRentalListingDocument('tenant', tenant, { id: 'historic' }, { status: 'accepted', note: 'Old file' }, { recordRentalApplicationReview: review })).rejects.toThrow('not current')
  const landlord = { id: 'lead', onboarding: { version: 7 }, rows: [{ ...row, purpose: 'property_disclosure' }] }
  const request = vi.fn()
  await expect(reviewRentalListingDocument('landlord', landlord, row.documents[0], { status: 'accepted', note: 'Checked' }, { requestRentalLandlordOnboarding: request })).rejects.toThrow('completed and signed')
  expect(request).not.toHaveBeenCalled()
  await reviewRentalListingDocument('landlord', landlord, row.documents[0], { status: 'accepted', note: 'Checked', completedSigned: true }, { requestRentalLandlordOnboarding: request })
  expect(request).toHaveBeenCalledWith('lead', 'POST', { action: 'review_document', version: 7, patch: { documentId: 'doc', status: 'accepted', note: 'Checked', completedSigned: true } })
})

it('gets private evidence URLs from the correct scoped workflow', async () => {
  const tenantUrl = vi.fn().mockResolvedValue('https://private.test/tenant')
  expect(await getRentalListingDocumentUrl('tenant', tenant, row.documents[0], { getRentalApplicationDocumentUrl: tenantUrl })).toBe('https://private.test/tenant')
  expect(tenantUrl).toHaveBeenCalledWith('app', 'doc')
  const request = vi.fn().mockResolvedValue({ url: 'https://private.test/owner' })
  expect(await getRentalListingDocumentUrl('landlord', { id: 'lead', onboarding: { version: 9 } }, row.documents[0], { requestRentalLandlordOnboarding: request })).toBe('https://private.test/owner')
  expect(request).toHaveBeenCalledWith('lead', 'POST', { action: 'document_url', version: 9, documentId: 'doc' })
})

it('counts saved active requirements rather than files, optional rows or previews and marks failed reads unknown', () => {
  const matrix = { issues: [], landlords: [{ rows: [{ mode: 'preview', required: true, state: 'accepted' }] }], tenants: [{ rows: [row, { ...row, state: 'accepted' }, { ...row, state: 'rejected' }, { ...row, state: 'accepted', expiresAt: '2000-01-01' }, { ...row, required: false }] }] }
  expect(rentalListingDocumentProgress(matrix)).toMatchObject({ available: true, total: 4, complete: 1, received: 2, awaiting: 2, review: 2, preview: 1, percent: 25 })
  expect(buildRentalListingOverview({ documentMatrix: matrix }).documentProgress).toEqual({ total: 4, complete: 1, percent: 25 })
  expect(buildRentalListingOverview({ documentMatrix: { ...matrix, issues: ['Unavailable'] } }).documentProgress).toBeNull()
  expect(rentalListingDocumentProgress({ ...matrix, issues: ['Unavailable'] }).available).toBe(false)
})
