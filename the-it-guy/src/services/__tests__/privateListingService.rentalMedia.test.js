// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { signPrivateListingMediaAsset, uploadPrivateListingMediaAsset } from '../privateListingService'

const mocks = vi.hoisted(() => ({ upload: vi.fn(), sign: vi.fn(), bucket: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
  supabase: { storage: { from: mocks.bucket } },
}))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.bucket.mockReturnValue({ upload: mocks.upload, createSignedUrl: mocks.sign })
  mocks.upload.mockResolvedValue({ data: {}, error: null })
  mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.example/signed/photo' }, error: null })
})

it('uploads new rental photos without overwrite checks, using distinct paths and signed viewing links', async () => {
  const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })
  const options = { listingId: '11111111-1111-4111-8111-111111111111', upsert: false, requireSignedUrl: true }
  const first = await uploadPrivateListingMediaAsset(file, options)
  const second = await uploadPrivateListingMediaAsset(file, options)
  expect(first.path).not.toBe(second.path)
  expect(first.bucket).toBe('documents')
  expect(mocks.upload.mock.calls.every(([, , uploadOptions]) => uploadOptions.upsert === false)).toBe(true)
  expect(first.url).toBe('https://storage.example/signed/photo')
  expect(mocks.sign).toHaveBeenCalledWith(first.path, 2592000)
})

it('keeps the uploaded object identity when signing fails and does not substitute a public URL', async () => {
  const asset = { bucket: 'documents', path: 'private-listings/listing/gallery/photo.jpg' }
  mocks.sign.mockResolvedValue({ data: null, error: { message: 'statement timeout' } })
  await expect(signPrivateListingMediaAsset(asset)).rejects.toMatchObject({ savedAsset: asset, message: expect.stringContaining('statement timeout') })
  expect(mocks.bucket).toHaveBeenCalledTimes(1)
  expect(mocks.bucket).toHaveBeenCalledWith('documents')
})
