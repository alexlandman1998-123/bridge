import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {
  auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-only' } } }) },
} }))
vi.mock('../../privateListingService', () => ({
  createPrivateListing: vi.fn(), createPrivateListingActivity: vi.fn(), getAgentPrivateListings: vi.fn(),
  getPrivateListing: vi.fn(), saveRentalListingSnapshot: vi.fn(), saveRentalListingExpiry: vi.fn(),
  updatePrivateListing: vi.fn(), signPrivateListingMediaAsset: vi.fn(), uploadPrivateListingMediaAsset: vi.fn(),
} ))
import { previewRentalProperty24Listing, publishRentalProperty24Listing, previewPrivatePropertyRentalListing, publishPrivatePropertyRentalListing } from '../rentalListingDraftService.js'

beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) }))))
afterEach(() => vi.unstubAllGlobals())

it.each([previewRentalProperty24Listing, publishRentalProperty24Listing, previewPrivatePropertyRentalListing, publishPrivatePropertyRentalListing])('lets the server decide photo changes for %s', async action => {
  await action('listing')
  expect(JSON.parse(fetch.mock.calls[0][1].body).photosChanged).toBe('auto')
  expect(fetch).toHaveBeenCalledOnce()
})

it('preserves an explicit forced photo refresh', async () => {
  await publishRentalProperty24Listing('listing', { photosChanged: true })
  expect(JSON.parse(fetch.mock.calls[0][1].body).photosChanged).toBe(true)
})

it('keeps the actual nested Private Property rejection', async () => {
  fetch.mockResolvedValue({ ok: false, status: 422, json: async () => ({ report: { error: { message: 'Branch is not approved for publishing.' } } }) })
  await expect(publishPrivatePropertyRentalListing('listing')).rejects.toMatchObject({ message: 'Branch is not approved for publishing.', definiteRejection: true })
})

it('keeps the actual nested Property24 rejection', async () => {
  fetch.mockResolvedValue({ ok: false, status: 422, json: async () => ({ report: { error: { message: 'Agent does not belong to this agency.' } } }) })
  await expect(publishRentalProperty24Listing('listing')).rejects.toMatchObject({ message: 'Agent does not belong to this agency.', definiteRejection: true })
})
