import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ status: 'cancelled', updates: [], failUpdate: false }))
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true, getEdgeFunctionInvokeError: vi.fn(), invokeEdgeFunction: vi.fn(),
  supabase: {
    from(table) {
      let payload = null
      const chain = {
        select: () => chain, eq: () => chain, is: () => chain, limit: () => chain,
        update: value => { payload = value; mocks.updates.push(value); return chain },
        maybeSingle: async () => ({ error: null, data: table === 'appointments' ? {
          appointment_id: 'appointment-1', appointment_type: 'attorney_consultation', appointment_date: '2099-07-20', start_time: '10:00:00', end_time: '11:00:00', date_time: '2099-07-20T08:00Z', status: 'Pending Confirmation', visibility_scope: 'client_visible',
        } : payload ? (mocks.failUpdate ? null : { id: 'reminder-1', ...payload }) : { id: 'reminder-1', status: mocks.status } }),
        then: resolve => resolve({ data: [{ participant_id: 'client-1', name: 'Buyer', email: 'buyer@example.test', participant_role: 'Client', rsvp_status: 'Pending' }], error: null }),
      }
      return chain
    },
  },
}))
vi.mock('../notificationOutboxService', () => ({ prepareNotificationOutbox: vi.fn() }))
import { scheduleAppointmentReminders } from '../appointmentNotificationService'
beforeEach(() => { mocks.status = 'cancelled'; mocks.updates = []; mocks.failUpdate = false })

describe('Reminders after editing an appointment', () => {
  it('reactivates cancelled reminders when returning to a previous slot', async () => {
    const rows = await scheduleAppointmentReminders('appointment-1', { reactivateCancelled: true })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(row => row.status === 'pending')).toBe(true)
    expect(mocks.updates.length).toBe(rows.length)
    expect(mocks.updates[0]).toMatchObject({ status: 'pending', sent_at: null, metadata: { appointmentDate: '2099-07-20', appointmentTime: '10:00' } })
  })
  it('keeps cancellation unchanged for existing callers without the explicit reschedule option', async () => {
    const rows = await scheduleAppointmentReminders('appointment-1')
    expect(rows.every(row => row.status === 'cancelled')).toBe(true)
    expect(mocks.updates).toHaveLength(0)
  })
  it('does not reactivate sent reminders', async () => {
    mocks.status = 'sent'
    await scheduleAppointmentReminders('appointment-1', { reactivateCancelled: true })
    expect(mocks.updates).toHaveLength(0)
  })
  it('reports an unconfirmed reminder update', async () => {
    mocks.failUpdate = true
    await expect(scheduleAppointmentReminders('appointment-1', { reactivateCancelled: true })).rejects.toThrow(/could not be confirmed/)
  })
})
