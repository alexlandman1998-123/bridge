import { afterEach, expect, it, vi } from 'vitest'
import { uploadRentalApplicationFile } from '../rentalApplicationFileUpload.js'
afterEach(() => vi.unstubAllGlobals())
it('sends large document bytes only to the signed storage URL and verifies the upload through the authenticated API callback', async () => {
  const file = { name: 'Evidence.pdf', type: 'application/pdf', size: 8 * 1024 * 1024 }
  const request = vi.fn().mockResolvedValueOnce({ uploadUrl: 'https://storage.example.test/signed', ticket: 'signed-receipt' }).mockResolvedValueOnce({ document: { id: 'doc' }, application: { version: 5 } })
  const fetch = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('fetch', fetch)
  const result = await uploadRentalApplicationFile(file, { subjectId: 'guarantor', purpose: 'proof_of_income' }, 4, request)
  expect(request.mock.calls[0][0]).toEqual({ action: 'prepare_upload', version: 4, fileName: 'Evidence.pdf', mimeType: 'application/pdf', fileSize: 8 * 1024 * 1024, subjectId: 'guarantor', purpose: 'proof_of_income' })
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
