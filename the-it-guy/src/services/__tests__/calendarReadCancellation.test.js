import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), abort: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { rpc: api.rpc, from: api.from } }))
import { readCalendarHealth, readAppointmentSupport } from '../calendarSupportService'
import { readCalendarProviderStatus } from '../calendarProviderService'
import { readCalendarDeliveryJobs } from '../appointmentNotificationService'
import { listShortTermBookings } from '../rentals/rentalShortTermBookingRepository'
import { listShortTermUnitInventory } from '../rentals/rentalShortTermInventoryRepository'

beforeEach(() => { vi.resetAllMocks() })
for (const [name, read, data] of [
  ['health', signal => readCalendarHealth('org', { signal }), { verified: true, organisationId: 'org', issues: [], monitor: { status: 'current' }, truncated: false }],
  ['support', signal => readAppointmentSupport('org', 'booking', { signal }), { verified: true, organisationId: 'org', appointmentId: 'booking', revision: 1, status: 'confirmed', jobs: [], history: [], participants: [], reconcileAllowed: false }],
  ['provider', signal => readCalendarProviderStatus('org', 'booking', { signal }), { verified: true, connections: [], events: [] }],
  ['delivery', signal => readCalendarDeliveryJobs('booking', { signal }), []],
  ['rental bookings', signal => listShortTermBookings({ organisationId: 'org' }, { signal }), []],
  ['rental inventory', signal => listShortTermUnitInventory({ organisationId: 'org' }, { signal }), []],
]) {
  it(`${name} forwards the actual cancellation signal to PostgREST`, async () => {
    const query = { abortSignal: api.abort }
    for (const method of ['select', 'eq', 'order', 'limit']) query[method] = () => query
    api.rpc.mockReturnValue(query)
    api.from.mockReturnValue(query)
    api.abort.mockImplementation(signal => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      // The query is intentionally unresolved until the transport is cancelled.
    }))
    const controller = new AbortController()
    const pending = expect(read(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(api.abort).toHaveBeenCalledWith(controller.signal)
    controller.abort()
    await pending
    api.abort.mockResolvedValue({ data, error: null })
    await expect(read(new AbortController().signal)).resolves.toBeDefined()
  })
}
