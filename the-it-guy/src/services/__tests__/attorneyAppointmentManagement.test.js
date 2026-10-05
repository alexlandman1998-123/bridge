import { beforeEach, describe, expect, it, vi } from 'vitest'

const notifications = vi.hoisted(() => ({ notify: vi.fn(), reminders: vi.fn() }))
vi.mock('../appointmentNotificationService', () => ({ notifyAppointmentParticipants: notifications.notify, scheduleAppointmentReminders: notifications.reminders }))
import { appointmentEditDraft, buildAppointmentEditChanges, manageAttorneyAppointment } from '../attorneyAppointmentManagement'

const appointment = { appointment_id: 'appointment-1', transaction_id: 'matter-1', start_time: '10:00:00', end_time: '11:30:00', status: 'Pending Confirmation' }
const saved = { appointment, participants: [{ user_id: 'staff-1', email: 'staff@example.test', participant_role: 'Other Contact', is_scheduling_owner: true }] }
beforeEach(() => {
  notifications.notify.mockReset().mockResolvedValue([{ email: { status: 'sent', sent: true } }])
  notifications.reminders.mockReset().mockResolvedValue([])
})

describe('Attorney appointment management service', () => {
  it('uses saved SAST time and duration for editing', () => {
    expect(appointmentEditDraft({ dateTime: '2099-07-20T08:00Z', endTime: '11:30:00' })).toEqual({ date: '2099-07-20', startTime: '10:00', endTime: '11:30' })
    expect(buildAppointmentEditChanges({ date: '2099-07-20', startTime: '10:00', endTime: '11:30' })).toEqual({ start: '2099-07-20T08:00:00.000Z', end: '2099-07-20T09:30:00.000Z' })
  })
  it.each([
    { date: '2099-02-30', startTime: '10:00', endTime: '11:00' },
    { date: '2099-07-20', startTime: '11:00', endTime: '10:00' },
    { date: '2099-07-20', startTime: '25:00', endTime: '26:00' },
    { date: '2020-07-20', startTime: '10:00', endTime: '11:00' },
  ])('rejects invalid or past edits: %j', draft => {
    expect(() => buildAppointmentEditChanges(draft)).toThrow()
  })
  it('returns saved data and relies on durable RPC delivery with no browser work', async () => {
    const client = {rpc:vi.fn(async () => ({data:saved}))}
    const outcome = await manageAttorneyAppointment('appointment-1','edit','2026-10-03T12:00Z',{start:'2099-07-20T08:00Z',end:'2099-07-20T09:30Z'},{client})
    expect(outcome.appointment).toBe(appointment)
    expect(client.rpc).toHaveBeenCalledWith('manage_attorney_appointment',expect.objectContaining({p_expected_updated_at:'2026-10-03T12:00Z',p_action:'edit'}))
    expect(outcome.communicationCompletion).toBeUndefined()
    expect(outcome.delivery.status).toBe('queued')
    expect(notifications.notify).not.toHaveBeenCalled()
    expect(notifications.reminders).not.toHaveBeenCalled()
  })
  it('retains notification-off feedback on a confirmed management save', async () => {
    const outcome = await manageAttorneyAppointment('appointment-1','cancel','2026-10-03T12:00Z',{reason:'Unavailable'},{client:{rpc:vi.fn(async () => ({data:{...saved,appointment:{...appointment,attorney_delivery_enabled:false}}}))}})
    expect(outcome.delivery.status).toBe('disabled')
    expect(notifications.notify).not.toHaveBeenCalled()
  })
  it('does not report a success without a confirmed record', async () => {
    await expect(manageAttorneyAppointment('appointment-1', 'owner', '2026-10-03T12:00Z', { userId: 'staff-1' }, { client: { rpc: vi.fn(async () => ({ data: null })) } })).rejects.toThrow(/could not be confirmed/)
    expect(notifications.notify).not.toHaveBeenCalled()
  })
  it('fails visibly when the database migration is missing', async () => {
    await expect(manageAttorneyAppointment('appointment-1', 'resource', '2026-10-03T12:00Z', {}, { client: { rpc: vi.fn(async () => ({ error: { code: 'PGRST202' } })) } })).rejects.toThrow(/latest database migration/)
  })
})
