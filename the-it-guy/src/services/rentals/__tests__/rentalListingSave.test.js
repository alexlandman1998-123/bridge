// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { listRentalListingsForAgent, createRentalListingDraft, updateRentalListingDraft, updateRentalListingGallery, uploadRentalGalleryImages } from '../rentalListingDraftService'
import { buildRentalListingEditForm } from '../rentalListingEditModel'
import { buildRentalListingIndexRow } from '../rentalListingIndexModel'

const mocks = vi.hoisted(() => ({ listings: vi.fn(), create: vi.fn(), update: vi.fn(), get: vi.fn(), upload: vi.fn(), sign: vi.fn(), sync: vi.fn(), saved: null }))
vi.mock('../../privateListingService', () => ({
  createPrivateListing: mocks.create,
  updatePrivateListing: mocks.update,
  uploadPrivateListingMediaAsset: mocks.upload,
  signPrivateListingMediaAsset: mocks.sign,
  saveRentalListingSnapshot: mocks.sync,
  createPrivateListingActivity: async () => null,
  getAgentPrivateListings: mocks.listings,
  getPrivateListing: mocks.get,
}))
vi.mock('../../../lib/supabaseClient', () => ({ isSupabaseConfigured: false, supabase: null }))

const photo = (index) => ({ id: `photo-${index}`, name: `${index}.jpg`, url: `blob:${index}`, file: new File(['image'], `${index}.jpg`, { type: 'image/jpeg' }) })
const asset = (file) => ({ path: `saved/${file.name}`, url: `https://storage.example/${file.name}` })
const form = (images = []) => ({ landlordName: 'Test Owner', propertyAddress: '12 Example Road', monthlyRent: 11000, rentalPriceFrequency: 'monthly', depositPolicy: 'no_deposit', availableFrom: '2026-10-01', description: 'Rental home', galleryImages: images, coverImageId: images[1]?.id })
const context = { organisationId: '11111111-1111-4111-8111-111111111111' }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.saved = null
  mocks.create.mockResolvedValue({ listing: { id: 'listing-1', updatedAt: '2026-10-01T00:00:00Z' } })
  mocks.update.mockResolvedValue({ id: 'listing-1' })
  mocks.get.mockImplementation(async () => mocks.saved || { id: 'listing-1', updatedAt: '2026-10-01T00:00:00Z', listingCategory: 'rental', sellerCanonicalFacts: { landlordIdentity: { reference: 'existing-owner' } } })
  mocks.sync.mockImplementation(async (id, payload) => {
    const map = { propertyType: 'property_type', listingType: 'listing_type', askingPrice: 'asking_price', parkingBays: 'parking_bays', floorSize: 'floor_size', erfSize: 'erf_size' }
    const publication = payload.publicationData ? Object.fromEntries(Object.entries(payload.publicationData).map(([key, value]) => [map[key] || key, value])) : null
    const media = payload.galleryImages.map((image, index) => ({ id: image.id, media_type: 'image', file_url: image.url, caption: image.name, sort_order: index, is_cover: index === payload.coverIndex }))
    for (const edit of payload.mediaEdits || []) if (edit.url) media.push({ id: edit.id || `saved-${edit.type}`, media_type: edit.type, file_url: edit.url, sort_order: 0, is_cover: false })
    const receipt = { listingId: id, updatedAt: '2026-10-04T09:00:00Z', facts: payload.listingPatch.sellerCanonicalFacts, publication, media, externalLinks: [] }
    mocks.saved = { id, listingCategory: 'rental', updatedAt: receipt.updatedAt, sellerCanonicalFacts: receipt.facts,
      listingPublicationData: payload.publicationData, listingMedia: media, listingExternalLinks: [] }
    return receipt
  })
  mocks.upload.mockImplementation(async (file) => asset(file))
})

it('saves video and virtual tour links, returns saved media and rehydrates their editor values', async () => {
  const links = { videoLink: 'https://video.test/watch', virtualTourLink: 'https://tour.test/view' }
  const result = await createRentalListingDraft({ ...form(), ...links }, context)
  expect(mocks.sync.mock.calls[0][1].mediaEdits).toEqual([{ type: 'video', id: null, url: links.videoLink }, { type: 'virtual_tour', id: null, url: links.virtualTourLink }])
  expect(buildRentalListingEditForm(result.listing)).toMatchObject(links)
})

it('rejects unsafe video links before any listing or storage write', async () => {
  await expect(createRentalListingDraft({ ...form(), videoLink: 'javascript:alert(1)' }, context)).rejects.toThrow('Video link')
  expect(mocks.create).not.toHaveBeenCalled()
  expect(mocks.sync).not.toHaveBeenCalled()
})

it('allows gallery-only actions on incomplete legacy rentals and uses the photo-only RPC mode', async () => {
  const result = await updateRentalListingGallery('listing-1', { galleryImages: [], expectedUpdatedAt: '2026-10-01T00:00:00Z' }, context)
  expect(mocks.sync.mock.calls[0][1]).toMatchObject({ galleryOnly: true, mediaEdits: [], publicationData: null })
  expect(result.listing.id).toBe('listing-1')
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
  const media = mocks.sync.mock.calls[0][1]
  expect(media.galleryImages.map((image) => image.id)).toEqual(images.map((image) => image.id))
  expect(media.coverIndex).toBe(1)
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
  expect(mocks.update).not.toHaveBeenCalled()
  expect(mocks.sync.mock.calls[0][1].listingPatch.sellerCanonicalFacts.landlordIdentity).toEqual({ reference: 'existing-owner' })
  expect(mocks.upload).toHaveBeenCalledTimes(27)
  expect(mocks.sync.mock.calls[0][1].galleryImages).toHaveLength(26)
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
  expect(mocks.sync.mock.calls[0][1].galleryImages[0].url).toBe('https://storage.example/0.jpg')
})

it('does not report success when distribution tables are unavailable', async () => {
  mocks.sync.mockRejectedValue(new Error('Safe rental storage is unavailable until the migration is applied'))
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

it('returns the reloaded snapshot, saves P24 expiry separately, and carries the editor version', async () => {
  const draft = { ...form(), property24ExpiryDate: '2027-04-01', mandateEndDate: '2026-12-31', expectedUpdatedAt: '2026-10-01T00:00:00Z' }
  const result = await updateRentalListingDraft('listing-1', draft, context)
  expect(result.listing).toBe(mocks.saved)
  const payload = mocks.sync.mock.calls[0][1]
  expect(payload.expectedUpdatedAt).toBe(draft.expectedUpdatedAt)
  expect(payload.listingPatch.sellerCanonicalFacts.rentalInfo).toMatchObject({ property24ExpiryDate: '2027-04-01', mandateEndDate: '2026-12-31' })
  expect(payload).not.toHaveProperty('externalLinks')
})

it('does not claim success when readback is stale or fails after a confirmed save', async () => {
  mocks.get.mockResolvedValueOnce({ id: 'listing-1', listingCategory: 'rental', updatedAt: '2026-10-01T00:00:00Z' }).mockRejectedValueOnce(new Error('readback timeout'))
  await expect(updateRentalListingDraft('listing-1', form([photo(0)]), context)).rejects.toMatchObject({ code: 'RENTAL_SAVE_READBACK_FAILED', committed: true, galleryImages: [expect.objectContaining({ url: 'https://storage.example/0.jpg' })] })
})

it('rejects a refreshed snapshot that is missing saved media', async () => {
  const originalSave = mocks.sync.getMockImplementation()
  mocks.sync.mockImplementation(async (...args) => {
    const receipt = await originalSave(...args)
    mocks.saved.listingMedia = []
    return receipt
  })
  await expect(createRentalListingDraft(form([photo(0)]), context)).rejects.toMatchObject({ code: 'RENTAL_SAVE_READBACK_FAILED', committed: true })
})


it('requests previous rental stock within the existing organisation and agent query', async () => {
  mocks.listings.mockResolvedValue([{ id: 'archive', listingCategory: 'rental', listingVisibility: 'archived' }])
  const rows = await listRentalListingsForAgent('agent-1', { organisationId: context.organisationId, includePreviousListings: true })
  expect(rows.map(row => row.id)).toEqual(['archive'])
  expect(mocks.listings).toHaveBeenCalledWith('agent-1', expect.objectContaining({ organisationId: context.organisationId, includeArchivedListings: true, includeArchivedImports: true, includeWithdrawnListings: true }))
  await listRentalListingsForAgent('agent-1', { organisationId: context.organisationId })
  expect(mocks.listings.mock.calls[1][1]).toMatchObject({ includeArchivedListings: false, includeArchivedImports: false })
})
