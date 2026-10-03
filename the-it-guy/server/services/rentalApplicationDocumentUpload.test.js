import { expect, it, vi } from 'vitest'
import { rentalApplicationDocumentSlots } from '../../src/services/rentals/rentalApplicationWizardModel.js'
import { uploadRentalApplicationDocument, validateRentalDocumentUpload } from './rentalApplicationDocumentUpload.js'
const application = { id: 'app', organisation_id: 'org', status: 'draft', version: 4, application_data: { people: [{ id: 'g', role: 'guarantor', firstName: 'Sam' }], internalNotes: 'Keep' } }
const body = { version: 4, subjectId: 'g', purpose: 'identity', fileName: 'id.pdf', mimeType: 'application/pdf', contentBase64: Buffer.from('mock evidence').toString('base64') }
function fake({ insertError = null, conflict = false, deleteError = null, generation = 1, missingChecklist = false } = {}) {
  const storage = { upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) }
  const writes = []; const deleted = []; const filters = []
  const db = { storage: { from: () => storage }, from(table) {
    let patch
    const query = { insert(value) { writes.push(value); return query }, update(value) { patch = value; writes.push(value); return query }, delete() { deleted.push(table); return query }, select: () => query, eq(key, value) { filters.push([key, value]); return query }, single: async () => ({ error: insertError, data: insertError ? null : { id: 'document', document_type: 'identity', status: 'uploaded' } }), maybeSingle: async () => ({ data: conflict ? null : { id: 'app', status: 'draft', version: 5, application_data: patch.application_data } }), then: (resolve) => Promise.resolve(table === 'rental_onboarding_requirement_summaries' ? { data: missingChecklist ? [] : rentalApplicationDocumentSlots(application.application_data).map((slot) => ({ id: `${slot.subjectId}-${slot.purpose}`, subject_id: slot.subjectId, scope_key: 'application', purpose: slot.purpose, active: true, mode: 'active', generation })), error: null } : { error: deleteError }).then(resolve) }
    return query
  } }
  return { db, writes, deleted, filters, storage }
}
it('saves person assignments with an optimistic application version while preserving unrelated data', async () => {
  const fixture = fake(); const result = await uploadRentalApplicationDocument(fixture.db, application, body)
  expect(result.application.version).toBe(5)
  expect(result.application.application_data.internalNotes).toBe('Keep')
  expect(result.application.application_data.documentLinks).toEqual([{ documentId: 'document', subjectId: 'g', purpose: 'identity', source: 'applicant', requirementId: 'g-identity', generation: 1 }])
  expect(fixture.filters).toContainEqual(['version', 4]); expect(fixture.filters).toContainEqual(['status', 'draft'])
})
it('rejects forged subjects, stale versions and mismatched file types before uploading', async () => {
  for (const patch of [{ version: 3 }, { subjectId: 'outsider' }, { mimeType: 'image/png' }]) {
    const fixture = fake(); await expect(uploadRentalApplicationDocument(fixture.db, application, { ...body, ...patch })).rejects.toThrow(); expect(fixture.storage.upload).not.toHaveBeenCalled()
  }
  expect(() => validateRentalDocumentUpload({ fileName: 'x.pdf', mimeType: 'application/pdf', binary: Buffer.alloc(8 * 1024 * 1024 + 1) })).toThrow('8 MB')
})
it('cleans up storage and inserted document rows if the application changes during upload', async () => {
  const fixture = fake({ conflict: true }); await expect(uploadRentalApplicationDocument(fixture.db, application, body)).rejects.toThrow('changed')
  expect(fixture.deleted).toEqual(['rental_application_documents']); expect(fixture.storage.remove).toHaveBeenCalledOnce()
  const insertFailure = fake({ insertError: new Error('Insert failed') }); await expect(uploadRentalApplicationDocument(insertFailure.db, application, body)).rejects.toThrow('Insert failed'); expect(insertFailure.storage.remove).toHaveBeenCalledOnce()
})
it('uses a signed upload receipt, verifies actual stored metadata, and refuses tampering or another application', async () => {
  const fixture = fake()
  fixture.storage.createSignedUploadUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/signed' } })
  fixture.storage.info = vi.fn().mockResolvedValue({ data: { size: 1000, contentType: 'application/pdf' } })
  const options = { signingSecret: 'fake-test-secret' }
  const prepared = await uploadRentalApplicationDocument(fixture.db, application, { ...body, action: 'prepare_upload', fileSize: 1000 }, options)
  expect(prepared.uploadUrl).toBe('https://storage.example.test/signed'); expect(fixture.writes).toEqual([])
  const finish = { version: 4, action: 'complete_upload', ticket: prepared.ticket }
  await expect(uploadRentalApplicationDocument(fixture.db, application, { ...finish, ticket: prepared.ticket + 'x' }, options)).rejects.toThrow('Invalid')
  await expect(uploadRentalApplicationDocument(fixture.db, { ...application, id: 'other' }, finish, options)).rejects.toThrow('unavailable')
  const result = await uploadRentalApplicationDocument(fixture.db, application, finish, options)
  expect(result.document.id).toBe('document'); expect(fixture.storage.upload).not.toHaveBeenCalled()
})
it('rejects a signed upload whose stored MIME or size differs from the prepared receipt', async () => {
  const fixture = fake()
  fixture.storage.createSignedUploadUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/signed' } })
  fixture.storage.info = vi.fn().mockResolvedValue({ data: { size: 2000, contentType: 'application/pdf' } })
  const options = { signingSecret: 'fake-test-secret' }
  const prepared = await uploadRentalApplicationDocument(fixture.db, application, { ...body, action: 'prepare_upload', fileSize: 1000 }, options)
  await expect(uploadRentalApplicationDocument(fixture.db, application, { version: 4, action: 'complete_upload', ticket: prepared.ticket }, options)).rejects.toThrow('differs')
  expect(fixture.storage.remove).toHaveBeenCalledOnce(); expect(fixture.writes).toEqual([])
})

it('preserves stored bytes if cleanup cannot delete a document protected by a committed requirement assignment', async () => {
  const fixture = fake({ conflict: true, deleteError: { code: '23503', message: 'Document is referenced by the requirement ledger' } })
  await expect(uploadRentalApplicationDocument(fixture.db, application, body)).rejects.toThrow('changed')
  expect(fixture.deleted).toEqual(['rental_application_documents'])
  expect(fixture.storage.remove).not.toHaveBeenCalled()
})
it('binds both agent and applicant receipts to the current saved generation before touching storage', async () => {
  for (const source of ['agent', 'applicant']) {
    const first = fake()
    first.storage.createSignedUploadUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/signed' } })
    const options = { signingSecret: 'test-secret', source }
    const receipt = await uploadRentalApplicationDocument(first.db, application, { ...body, action: 'prepare_upload', fileSize: 100, requirementId: 'g-identity', generation: 1 }, options)
    const newer = fake({ generation: 2 })
    newer.storage.info = vi.fn()
    await expect(uploadRentalApplicationDocument(newer.db, application, { action: 'complete_upload', version: 4, ticket: receipt.ticket }, options)).rejects.toThrow('requirement changed')
    expect(newer.storage.info).not.toHaveBeenCalled(); expect(newer.writes).toEqual([])
    await expect(uploadRentalApplicationDocument(newer.db, application, { ...body, requirementId: 'other-requirement', generation: 2 }, options)).rejects.toThrow('requirement changed')
    expect(newer.storage.upload).not.toHaveBeenCalled()
  }
})
it('blocks uploads until a durable checklist exists and never treats missing rows as a fulfilled requirement', async () => {
  const fixture = fake({ missingChecklist: true })
  await expect(uploadRentalApplicationDocument(fixture.db, application, body)).rejects.toThrow('Save the draft')
  expect(fixture.storage.upload).not.toHaveBeenCalled(); expect(fixture.writes).toEqual([])
})
