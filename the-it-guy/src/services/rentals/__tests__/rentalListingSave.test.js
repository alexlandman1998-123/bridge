// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { createRentalListingDraft, updateRentalListingDraft, uploadRentalGalleryImages } from '../rentalListingDraftService'
import { buildRentalListingIndexRow } from '../rentalListingIndexModel'

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), get: vi.fn(), upload: vi.fn(), sign: vi.fn(), sync: vi.fn() }))
vi.mock('../../privateListingService', () => ({
  createPrivateListing: mocks.create,
  updatePrivateListing: mocks.update,
  uploadPrivateListingMediaAsset: mocks.upload,
  signPrivateListingMediaAsset: mocks.sign,
  syncPrivateListingDistributionData: mocks.sync,
  createPrivateListingActivity: async () => null,
  getAgentPrivateListings: async () => [],
  getPrivateListing: mocks.get,
}))
vi.mock('../../../lib/supabaseClient', () => ({ isSupabaseConfigured: false, supabase: null }))

const photo = (index) => ({ id: `photo-${index}`, name: `${index}.jpg`, url: `blob:${index}`, file: new File(['image'], `${index}.jpg`, { type: 'image/jpeg' }) })
const asset = (file) => ({ path: `saved/${file.name}`, url: `https://storage.example/${file.name}` })
const form = (images = []) => ({ landlordName: 'Test Owner', propertyAddress: '12 Example Road', monthlyRent: 11000, rentalPriceFrequency: 'monthly', depositPolicy: 'no_deposit', availableFrom: '2026-10-01', description: 'Rental home', galleryImages: images, coverImageId: images[1]?.id })
const context = { organisationId: '11111111-1111-4111-8111-111111111111' }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue({ listing: { id: 'listing-1' } })
  mocks.update.mockResolvedValue({ id: 'listing-1' })
  mocks.get.mockResolvedValue({ id: 'listing-1', listingCategory: 'rental', sellerCanonicalFacts: { landlordIdentity: { reference: 'existing-owner' } } })
  mocks.sync.mockResolvedValue({ skipped: false })
  mocks.upload.mockImplementation(async (file) => asset(file))
})

it('saves 26 photos with at most two concurrent uploads and preserves order and the selected cover', async () => {
  let active = 0
  let peak = 0
  mocks.upload.mockImplementation(async (file) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active -= 1
    return asset(file)
  })
  const images = Array.from({ length: 26 }, (_, index) => photo(index))
  const progress = vi.fn()
  await createRentalListingDraft(form(images), { ...context, onUploadProgress: progress })
  expect(peak).toBe(2)
  expect(mocks.upload).toHaveBeenCalledTimes(26)
  expect(mocks.upload.mock.calls.every(([, options]) => options.upsert === false)).toBe(true)
  const media = mocks.sync.mock.calls[0][1].media
  expect(media.galleryImages.map((image) => image.id)).toEqual(images.map((image) => image.id))
  expect(media.coverImageId).toBe('photo-1')
  expect(media.galleryImages.every((image) => !image.file && image.url.startsWith('https:'))).toBe(true)
  expect(progress).toHaveBeenLastCalledWith({ completed: 26, total: 26, phase: 'saving' })
})

it('retains the saved draft, successful uploads and unprocessed files when storage fails; retries only missing photos', async () => {
  mocks.upload.mockImplementation(async (file) => {
    if (file.name === '1.jpg') throw new Error('canceling statement due to statement timeout')
    await new Promise((resolve) => setTimeout(resolve, 1))
    return asset(file)
  })
  const images = Array.from({ length: 26 }, (_, index) => photo(index))
  const created = vi.fn()
  let failure
  try { await createRentalListingDraft(form(images), { ...context, onListingCreated: created }) } catch (error) { failure = error }
  expect(created).toHaveBeenCalledWith('listing-1')
  expect(failure.listingId).toBe('listing-1')
  expect(failure.message).toContain('statement timeout')
  expect(failure.galleryImages).toHaveLength(26)
  expect(failure.galleryImages[0].file).toBeUndefined()
  expect(failure.galleryImages[1].file).toBe(images[1].file)
  expect(mocks.upload).toHaveBeenCalledTimes(2)
  expect(mocks.sync).not.toHaveBeenCalled()
  mocks.upload.mockImplementation(async (file) => asset(file))
  await updateRentalListingDraft(failure.listingId, form(failure.galleryImages), context)
  expect(mocks.create).toHaveBeenCalledTimes(1)
  expect(mocks.update).toHaveBeenCalledWith('listing-1', expect.any(Object), expect.any(Object))
  expect(mocks.update.mock.calls[0][1].sellerCanonicalFacts.landlordIdentity).toEqual({ reference: 'existing-owner' })
  expect(mocks.upload).toHaveBeenCalledTimes(27)
  expect(mocks.sync.mock.calls[0][1].media.galleryImages).toHaveLength(26)
})

it('retains uploaded photo URLs if publication saving times out', async () => {
  mocks.sync.mockRejectedValueOnce(new Error('statement timeout'))
  let failure
  try { await createRentalListingDraft(form([photo(0), photo(1)]), context) } catch (error) { failure = error }
  expect(failure.listingId).toBe('listing-1')
  expect(failure.galleryImages.every((image) => !image.file)).toBe(true)
  await updateRentalListingDraft('listing-1', form(failure.galleryImages), context)
  expect(mocks.upload).toHaveBeenCalledTimes(2)
})

it('retries the viewing link for an uploaded private photo without uploading its bytes again', async () => {
  mocks.upload.mockRejectedValueOnce(Object.assign(new Error('Viewing link timed out'), { savedAsset: { path: 'saved/0.jpg', bucket: 'documents' } }))
  let failure
  try { await createRentalListingDraft(form([photo(0)]), context) } catch (error) { failure = error }
  expect(failure.galleryImages[0].path).toBe('saved/0.jpg')
  mocks.sign.mockResolvedValue({ path: 'saved/0.jpg', bucket: 'documents', url: 'https://storage.example/0.jpg' })
  await updateRentalListingDraft('listing-1', form(failure.galleryImages), context)
  expect(mocks.upload).toHaveBeenCalledTimes(1)
  expect(mocks.sign).toHaveBeenCalledTimes(1)
  expect(mocks.sync.mock.calls[0][1].media.galleryImages[0].url).toBe('https://storage.example/0.jpg')
})

it('does not report success when distribution tables are unavailable', async () => {
  mocks.sync.mockResolvedValue({ skipped: true, reason: 'distribution_tables_missing' })
  await expect(createRentalListingDraft(form(), context)).rejects.toMatchObject({ listingId: 'listing-1', message: expect.stringContaining('storage is unavailable') })
})

it('rejects a preview-only photo rather than silently discarding it', async () => {
  await expect(uploadRentalGalleryImages([{ id: 'preview', url: 'blob:missing-original' }], 'listing-1')).rejects.toMatchObject({ galleryImages: expect.arrayContaining([expect.objectContaining({ id: 'preview' })]) })
})

it('keeps agent and landlord contact details separate', () => {
  const row = buildRentalListingIndexRow({ assignedAgentName: 'Agent', assignedAgentEmail: 'agent@example.com', sellerEmail: 'owner@example.com', sellerPhone: '0123456789' })
  expect(row.assignedAgentContact).toBe('agent@example.com')
  expect(row.landlordContact).toBe('owner@example.com / 0123456789')
  expect(buildRentalListingIndexRow({ sellerEmail: 'owner@example.com' }).assignedAgentContact).toBe('')
})

it('rejects incomplete owner details and prevents edits to missing or non-rental listings', async () => {
  await expect(createRentalListingDraft({ ...form(), landlordName: '' }, context)).rejects.toThrow('Landlord or entity name is required')
  expect(mocks.create).not.toHaveBeenCalled()
  for (const existing of [null, { id: 'listing-1', listingCategory: 'private_sale' }]) {
    mocks.get.mockResolvedValueOnce(existing)
    await expect(updateRentalListingDraft('listing-1', form(), context)).rejects.toThrow('Rental listing not found')
  }
  expect(mocks.update).not.toHaveBeenCalled()
  expect(mocks.sync).not.toHaveBeenCalled()
})
