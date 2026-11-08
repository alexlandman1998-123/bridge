import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ listings: vi.fn(), history: vi.fn(), create: vi.fn() }))
vi.mock('../../privateListingService', () => ({ getPrivateListingActivity: api.history, createPrivateListingActivity: api.create }))
vi.mock('../rentalListingDraftService', () => ({ listRentalListingsForAgent: api.listings }))
import { createRentalViewing, listRentalViewings, recordRentalViewingOutcome } from '../rentalViewingService'
const form = { listingId: 'listing', tenantLeadId: 'tenant', startsAt: '2026-11-09T10:00:00Z' }
beforeEach(() => { vi.clearAllMocks(); api.history.mockResolvedValue([]); api.create.mockResolvedValue({ id: 'new' }) })
it('does not create a second viewing when history cannot be read reliably', async () => {
  api.history.mockRejectedValue(new Error('Viewing history is unavailable'))
  await expect(createRentalViewing(form)).rejects.toThrow('unavailable')
  expect(api.history).toHaveBeenCalledWith('listing', { requireAvailable: true })
  expect(api.create).not.toHaveBeenCalled()
})
it('reuses a confirmed scheduled viewing on retry', async () => {
  api.history.mockResolvedValue([{ id: 'existing', activity_type: 'rental_viewing_scheduled', metadata: { ...form, startsAt: '2026-11-09T10:00:00.000Z' } }])
  expect((await createRentalViewing(form)).id).toBe('existing')
  expect(api.create).not.toHaveBeenCalled()
})
it('does not write an outcome if the scheduled history is unavailable', async () => {
  api.history.mockRejectedValue(new Error('Viewing read denied'))
  await expect(recordRentalViewingOutcome({ id: 'view', ...form }, 'attended')).rejects.toThrow('denied')
  expect(api.history).toHaveBeenCalledWith('listing', { requireAvailable: true })
  expect(api.create).not.toHaveBeenCalled()
})
it('bounds portfolio history reads while retaining every viewing', async () => {
  let active = 0; let peak = 0
  api.listings.mockResolvedValue(Array.from({ length: 18 }, (_, i) => ({ id: `listing-${i}` })))
  api.history.mockImplementation(async id => {
    active += 1; peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 1))
    active -= 1
    return [{ id, activity_type: 'rental_viewing_scheduled', metadata: { ...form, startsAt: form.startsAt } }]
  })
  expect(await listRentalViewings('agent', { organisationId: 'org' })).toHaveLength(18)
  expect(peak).toBeLessThanOrEqual(4)
})
it('reports a failed portfolio read instead of showing a false empty calendar', async () => {
  api.listings.mockResolvedValue(Array.from({ length: 18 }, (_, i) => ({ id: `listing-${i}` })))
  api.history.mockRejectedValue(new Error('History permission denied'))
  await expect(listRentalViewings('agent', {})).rejects.toThrow('permission denied')
  expect(api.history.mock.calls.length).toBeLessThanOrEqual(4)
})
it('gives a useful invalid-time error before reading or writing', async () => {
  await expect(createRentalViewing({ ...form, startsAt: 'invalid' })).rejects.toThrow('valid rental viewing date')
  expect(api.history).not.toHaveBeenCalled()
})
