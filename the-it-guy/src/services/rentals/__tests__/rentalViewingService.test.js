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
function primaryKeyStore(initial = []) {
  const saved = new Map(initial.map(row => [row.id, row]))
  api.history.mockImplementation(async () => [...saved.values()])
  api.create.mockImplementation(async payload => {
    if (saved.has(payload.activityId)) throw Object.assign(new Error('Duplicate primary key'), { code: '23505' })
    const row = { id: payload.activityId, activity_type: payload.activityType, metadata: payload.metadata }
    saved.set(row.id, row)
    return row
  })
  return saved
}
it('concurrent agents scheduling the same tenant and instant recover one saved viewing', async () => {
  const saved = primaryKeyStore()
  const results = await Promise.all([createRentalViewing(form), createRentalViewing({ ...form, startsAt: '2026-11-09T12:00:00+02:00' })])
  expect(results[0].id).toBe(results[1].id)
  expect(saved.size).toBe(1)
  expect(api.create.mock.calls[0][0].activityId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})
it('concurrent conflicting outcomes retain one result and explain the conflict', async () => {
  const viewing = { id: 'view', ...form }
  const saved = primaryKeyStore([{ id: viewing.id, activity_type: 'rental_viewing_scheduled', metadata: form }])
  const results = await Promise.allSettled([recordRentalViewingOutcome(viewing, 'attended'), recordRentalViewingOutcome(viewing, 'cancelled')])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find(result => result.status === 'rejected').reason.message).toContain('different recorded outcome')
  expect(saved.size).toBe(2)
})
