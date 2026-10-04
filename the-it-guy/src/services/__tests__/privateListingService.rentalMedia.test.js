// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { saveRentalListingSnapshot, signPrivateListingMediaAsset, uploadPrivateListingMediaAsset } from '../privateListingService'

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

it('uses the combined media transaction and passes the selected link edits', async () => {
  const receipt = { listingId: 'listing-1', updatedAt: '2026-10-04T00:00:00Z', publication: {}, media: [], externalLinks: [] }
  const rpc = vi.fn().mockResolvedValue({ data: receipt, error: null })
  const mediaEdits = [{ id: null, type: 'video', url: 'https://video.test/watch' }]
  await expect(saveRentalListingSnapshot('listing-1', { expectedUpdatedAt: 'old-version', listingPatch: {}, publicationData: {}, galleryImages: [], mediaEdits }, { client: { rpc } })).resolves.toEqual(receipt)
  expect(rpc).toHaveBeenCalledWith('save_rental_listing_media_snapshot', expect.objectContaining({ p_media_edits: mediaEdits, p_cover_index: null }))
})

it('sends only gallery fields for photo actions and accepts a legacy rental without publication data', async () => {
  const receipt = { listingId: 'listing-1', updatedAt: '2026-10-04T00:00:00Z', publication: null, media: [], externalLinks: [] }
  const rpc = vi.fn().mockResolvedValue({ data: receipt, error: null })
  await saveRentalListingSnapshot('listing-1', { expectedUpdatedAt: 'old-version', galleryOnly: true, galleryImages: [] }, { client: { rpc } })
  expect(rpc).toHaveBeenCalledWith('save_rental_listing_gallery', { p_listing_id: 'listing-1', p_expected_updated_at: 'old-version', p_gallery: [], p_cover_index: null })
})

it('fails clearly when the media controls migration is missing and rejects unconfirmed receipts', async () => {
  const payload = { galleryOnly: true, galleryImages: [] }
  const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'Could not find public.save_rental_listing_gallery' } }).mockResolvedValueOnce({ data: { listingId: 'wrong-listing' }, error: null })
  await expect(saveRentalListingSnapshot('listing-1', payload, { client: { rpc } })).rejects.toThrow('migrations before saving')
  await expect(saveRentalListingSnapshot('listing-1', payload, { client: { rpc } })).rejects.toThrow('no confirmation')
})
