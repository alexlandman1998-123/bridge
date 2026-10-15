import { expect, it, vi } from 'vitest'
import { uploadRentalLeaseDocument } from '../rentalLeaseDocumentUploadService.js'
function fixture() {
  const workspace = { lease: { id: crypto.randomUUID() }, version: { id: crypto.randomUUID(), organisation_id: crypto.randomUUID(), version_number: 2 } }
  const paths = new Set()
  const storage = { upload: vi.fn(async path => { paths.add(path); return { data: { path } } }), createSignedUrl: vi.fn(async path => paths.has(path) ? { data: { signedUrl: 'https://private.test/lease' } } : { error: { status: 404 } }) }
  let row
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'agent' } } }) }, storage: { from: () => storage }, rpc: vi.fn(async (_name, args) => { row ||= { id: args.p_upload_id, lease_version_id: workspace.version.id, storage_bucket: 'rental-lease-files', storage_path: args.p_storage_path }; return { data: row } }) }
  const file = new File(['%PDF-1.7\nLease\n%%EOF'], 'Agreement.pdf', { type: 'application/pdf' })
  return { workspace, file, client, storage, paths }
}
it('recovers an unacknowledged lease transfer without duplicate bytes and reports Sales upload stages', async () => {
  const f = fixture(), progress = vi.fn(), put = f.storage.upload.getMockImplementation()
  f.storage.upload.mockImplementationOnce(async path => { await put(path); throw new TypeError('Response lost') })
  let receipt
  try { await uploadRentalLeaseDocument({ workspace: f.workspace, file: f.file }, { client: f.client, onProgress: progress }) } catch (cause) { receipt = cause.uploadReceipt }
  expect(receipt).toBeTruthy()
  const saved = await uploadRentalLeaseDocument({ workspace: f.workspace, file: f.file, receipt }, { client: f.client, onProgress: progress })
  expect(saved.storage_path).toBe(receipt.path)
  expect(f.storage.upload).toHaveBeenCalledTimes(1)
  expect(progress.mock.calls.map(([event]) => event.stage)).toContain('saving')
  expect(progress.mock.calls.at(-1)[0].stage).toBe('complete')
  expect((await uploadRentalLeaseDocument({ workspace: f.workspace, file: f.file }, { client: f.client })).id).toBe(saved.id)
  expect(f.storage.upload).toHaveBeenCalledTimes(1)
})
it('retries an absent lease object at the same path and keeps it bound to its version and signer', async () => {
  const f = fixture()
  f.storage.upload.mockRejectedValueOnce(new TypeError('No connection'))
  let receipt
  try { await uploadRentalLeaseDocument({ workspace: f.workspace, file: f.file }, { client: f.client }) } catch (cause) { receipt = cause.uploadReceipt }
  expect(receipt.storageUnconfirmed).toBe(true)
  const saved = await uploadRentalLeaseDocument({ workspace: f.workspace, file: f.file, receipt }, { client: f.client })
  expect(saved.storage_path).toBe(receipt.path)
  expect(f.storage.upload.mock.calls.map(([path]) => path)).toEqual([receipt.path, receipt.path])
  await expect(uploadRentalLeaseDocument({ workspace: { ...f.workspace, version: { ...f.workspace.version, id: 'other-version' } }, receipt }, { client: f.client })).rejects.toThrow('different lease version')
})
