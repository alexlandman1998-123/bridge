// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createBondWetInkSigningService, validateBondSignedPdf } from '../../../../services/bondWetInkSigningService.js'
import { sealBondReviewedVersion } from '../submission/bondApplicationReviewedVersion.js'
const pdf = () => new File(['%PDF-1.7\noriginal bytes'], 'signed.pdf', { type: 'application/pdf' })
it('rejects disguised and oversized files before upload', async () => {
  await expect(validateBondSignedPdf(new File(['not a PDF'], 'signed.pdf'))).rejects.toThrow('not a PDF')
  await expect(validateBondSignedPdf({ name: 'signed.pdf', size: 26214401 })).rejects.toThrow('25 MB')
})
it('retries metadata without overwriting the original when recording fails', async () => {
  const upload = vi.fn().mockResolvedValue({ data: {} })
  const rpc = vi.fn().mockResolvedValueOnce({ error: new Error('Connection interrupted') }).mockResolvedValueOnce({ data: { version: { status: 'awaiting_review' } } })
  const service = createBondWetInkSigningService({ rpc, storage: { from: () => ({ upload }) } })
  const version = { id: 'version', bond_application_id: 'application' }, file = pdf()
  let attempt
  try { await service.upload({ version, file }) } catch (failure) { attempt = failure.retryAttempt }
  expect(attempt.stored).toBe(true)
  const result = await service.upload({ version, file, attempt })
  expect(result.version.status).toBe('awaiting_review')
  expect(upload).toHaveBeenCalledTimes(1)
  expect(upload.mock.calls[0][2].upsert).toBe(false)
  expect(rpc.mock.calls[0][1].p_upload).toBe(rpc.mock.calls[1][1].p_upload)
})
it('fails closed when an original file differs from its recorded fingerprint', async () => {
  const file = pdf(), bytes = new Uint8Array(await file.arrayBuffer())
  const originalFetch = globalThis.fetch
  globalThis.fetch = vi.fn().mockImplementation(async () => new Response(bytes))
  try {
    const service = createBondWetInkSigningService({ storage: { from: () => ({ createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://private.example/original' } }) }) } })
    await expect(service.readOriginal({ file_path: 'original.pdf', bytes: bytes.length, sha256: 'a'.repeat(64) })).rejects.toThrow('could not be verified')
    const validated = await validateBondSignedPdf(file)
    expect(await service.readOriginal({ file_path: 'original.pdf', bytes: bytes.length, sha256: validated.sha256 })).toEqual(bytes)
  } finally { globalThis.fetch = originalFetch }
})
it('does not render a signing copy if the fixed application was altered', async () => {
  const snapshot = await sealBondReviewedVersion({ transaction: { id: 'tx' }, submissionVersion: 1, createdAt: new Date().toISOString(), finance: { requestedBondAmount: '1000000' }, documentManifest: [] })
  snapshot.finance.requestedBondAmount = '2000000'
  const service = createBondWetInkSigningService({})
  await expect(service.signingPdf({ snapshot_json: snapshot })).rejects.toThrow()
})
