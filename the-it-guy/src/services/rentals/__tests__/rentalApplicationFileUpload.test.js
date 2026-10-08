import { afterEach, expect, it, vi } from 'vitest'
import { uploadRentalApplicationFile } from '../rentalApplicationFileUpload.js'
afterEach(() => vi.unstubAllGlobals())
it('sends large document bytes only to the signed storage URL and verifies the upload through the authenticated API callback', async () => {
  const file = { name: 'Evidence.pdf', type: 'application/pdf', size: 8 * 1024 * 1024 }
  const request = vi.fn().mockResolvedValueOnce({ uploadUrl: 'https://storage.example.test/signed', ticket: 'signed-receipt' }).mockResolvedValueOnce({ document: { id: 'doc' }, application: { version: 5 } })
  const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', fetch)
  const result = await uploadRentalApplicationFile(file, { subjectId: 'guarantor', purpose: 'proof_of_income' }, 4, request)
  expect(request.mock.calls[0][0]).toEqual({ action: 'prepare_upload', version: 4, fileName: 'Evidence.pdf', mimeType: 'application/pdf', fileSize: 8 * 1024 * 1024, subjectId: 'guarantor', purpose: 'proof_of_income', appendToPack: false })
  expect(fetch).toHaveBeenCalledWith('https://storage.example.test/signed', expect.objectContaining({ method: 'PUT', body: file }))
  expect(request.mock.calls[1][0]).toEqual({ action: 'complete_upload', version: 4, ticket: 'signed-receipt' })
  expect(result.application.version).toBe(5)
})
it('does not create a document record if the direct storage upload fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  const request = vi.fn().mockResolvedValue({ uploadUrl: 'https://storage.example.test/signed', ticket: 'signed-receipt' })
  await expect(uploadRentalApplicationFile({ name: 'Evidence.pdf', type: 'application/pdf', size: 100 }, { subjectId: 'primary', purpose: 'identity' }, 2, request)).rejects.toThrow('retry')
  expect(request).toHaveBeenCalledOnce()
})

it('reconciles a lost Storage response through the original completion ticket instead of uploading another file', async () => {
  const file = { name: 'Lost-PUT.pdf', type: 'application/pdf', size: 100 }
  const request = vi.fn().mockResolvedValueOnce({ uploadUrl: 'https://storage.example.test/signed', ticket: 'original-ticket' }).mockResolvedValue({ document: { id: 'saved-doc' }, application: { version: 5 } })
  const fetch = vi.fn().mockRejectedValue(new TypeError('Storage response lost'))
  vi.stubGlobal('fetch', fetch)
  const slot = { subjectId: 'g', purpose: 'identity', requirementId: 'lost-put-requirement', generation: 1 }
  const saved = await uploadRentalApplicationFile(file, slot, 4, request)
  const retried = await uploadRentalApplicationFile(file, slot, 5, request)
  expect(saved.document.id).toBe('saved-doc')
  expect(retried.document.id).toBe('saved-doc')
  expect(fetch).toHaveBeenCalledOnce()
  expect(request.mock.calls.filter(([value]) => value.action === 'prepare_upload')).toHaveLength(1)
  expect(request.mock.calls.slice(1).every(([value]) => value.ticket === 'original-ticket')).toBe(true)
})
