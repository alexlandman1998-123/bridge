import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ listings: vi.fn(), activity: vi.fn() }))
vi.mock('../rentalListingDraftService', () => ({ listRentalListingsForAgent: api.listings }))
vi.mock('../../privateListingService', () => ({ getPrivateListingActivity: api.activity }))
import { listRentalManagementWorkspace } from '../rentalManagementService'
beforeEach(() => { vi.resetAllMocks() })

it('reads each listing history once for both its leases and management calendar events', async () => {
  api.listings.mockResolvedValue([{ id: 'listing' }])
  api.activity.mockResolvedValue([{ id: 'activity', private_listing_id: 'listing', activity_type: 'rental_lease_workflow_created', metadata: { reference: 'lease', captureVersion: 'arch9_rental_lease_capture_v1' } }])
  const result = await listRentalManagementWorkspace('agent', { organisationId: 'org' })
  expect(result.leases).toHaveLength(1)
  expect(result.leases[0].listingId).toBe('listing')
  expect(api.activity).toHaveBeenCalledTimes(1)
})

it('does not begin activity enrichment after the calendar request has been cancelled', async () => {
  const controller = new AbortController()
  api.listings.mockImplementation(async () => { controller.abort(); return [{ id: 'listing' }] })
  await expect(listRentalManagementWorkspace('agent', { organisationId: 'org', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  expect(api.activity).not.toHaveBeenCalled()
})
