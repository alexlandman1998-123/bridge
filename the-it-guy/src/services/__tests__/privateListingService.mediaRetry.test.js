// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { uploadPrivateListingMediaAsset } from '../privateListingService'

const mocks = vi.hoisted(() => ({ upload: vi.fn(), sign: vi.fn(), bucket: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
  supabase: { storage: { from: mocks.bucket } },
}))
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.bucket.mockReturnValue({
    upload: mocks.upload,
    createSignedUrl: mocks.sign,
    getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/photo' } }),
  })
  mocks.upload.mockResolvedValue({ data: {}, error: null })
  mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://example.test/signed' }, error: null })
})
afterEach(() => vi.useRealTimers())
const options = { listingId: '11111111-1111-4111-8111-111111111111' }

it('retries an ambiguous upload timeout with the same object path and file', async () => {
  const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })
  mocks.upload.mockResolvedValueOnce({ error: { statusCode: 544 } })
  const pending = uploadPrivateListingMediaAsset(file, options)
  await vi.runAllTimersAsync()
  const asset = await pending
  expect(mocks.upload).toHaveBeenCalledTimes(2)
  expect(mocks.upload.mock.calls[0]).toEqual(mocks.upload.mock.calls[1])
  expect(mocks.upload.mock.calls[0][0]).toBe(asset.path)
  expect(mocks.upload.mock.calls[0][2].upsert).toBe(true)
})

it('retries preparing the viewing link without uploading the photo again', async () => {
  mocks.sign.mockResolvedValueOnce({ error: { statusCode: 544 } })
  const pending = uploadPrivateListingMediaAsset(new File(['photo'], 'photo.jpg'), options)
  await vi.runAllTimersAsync()
  expect((await pending).signedUrl).toBe('https://example.test/signed')
  expect(mocks.upload).toHaveBeenCalledTimes(1)
  expect(mocks.sign).toHaveBeenCalledTimes(2)
})

it('does not retry writes that explicitly disallow overwrites', async () => {
  mocks.upload.mockResolvedValue({ error: { statusCode: 544 } })
  const pending = expect(uploadPrivateListingMediaAsset(new File(['photo'], 'photo.jpg'), { ...options, upsert: false })).rejects.toMatchObject({ statusCode: 544 })
  await vi.runAllTimersAsync()
  await pending
  expect(mocks.upload).toHaveBeenCalledTimes(1)
})
