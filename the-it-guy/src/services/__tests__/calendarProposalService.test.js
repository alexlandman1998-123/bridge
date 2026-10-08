import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ appointment: null, request: null, rpc: vi.fn(), notify: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {
  rpc: fixture.rpc,
  from(table) {
    const query = { select: () => query, eq: () => query, in: () => query, then: resolve => Promise.resolve({ data: [] }).then(resolve),
      maybeSingle: async () => ({ data: fixture.appointment }), single: async () => ({ data: table === 'appointment_reschedule_requests' ? fixture.request : fixture.appointment }) }
    return query
  },
} }))
vi.mock('../../lib/agencyPipelineService', () => ({ checkAppointmentSchedulingIntegrityAsync: vi.fn(async () => ({ hasHardConflicts: false, suggestedSlots: [] })) }))
vi.mock('../appointmentNotificationService', () => ({ notifyAppointmentParticipants: fixture.notify }))
import { proposeCalendarAppointmentReplacement, proposeAppointmentReschedule, resolveAppointmentRescheduleRequest } from '../appointmentRescheduleService.js'

const appointmentId = '10000000-0000-4000-8000-000000000006'
const organisationId = '10000000-0000-4000-8000-000000000001'
const requestId = '10000000-0000-4000-8000-000000000010'
const proposal = { preferredStart: '2099-07-20T10:00:00Z', preferredEnd: '2099-07-20T11:00:00Z' }
beforeEach(() => {
  fixture.appointment = { appointment_id: appointmentId, organisation_id: organisationId, calendar_revision: 5,
    status: 'confirmed', reservation_managed: true, timezone: 'Africa/Johannesburg', date_time: '2099-07-20T08:00Z', end_date_time: '2099-07-20T09:00Z' }
  fixture.request = { id: requestId, appointment_id: appointmentId, status: 'proposed', preferred_start: proposal.preferredStart, preferred_end: proposal.preferredEnd }
  fixture.notify.mockReset().mockResolvedValue([])
  fixture.rpc.mockReset().mockResolvedValue({ data: { verified: true, appointment: fixture.appointment, participants: [], request: fixture.request } })
})

it('proposes through the atomic endpoint using the displayed revision and a repeatable command', async () => {
  const commandId = '10000000-0000-4000-8000-000000000011'
  await proposeCalendarAppointmentReplacement(appointmentId, { ...proposal, expectedRevision: 3, commandId })
  expect(fixture.rpc).toHaveBeenCalledWith('mutate_calendar_proposal', expect.objectContaining({ p_expected_revision: 3, p_command_id: commandId, p_action: 'propose', p_start: proposal.preferredStart }))
  expect(fixture.notify).toHaveBeenCalledWith(appointmentId, 'appointment_reschedule_requested', expect.objectContaining({ proposal: fixture.request }))
})

it('keeps a manager approval tied to the existing proposal instead of an override time', async () => {
  await resolveAppointmentRescheduleRequest(requestId, { decision: 'accepted', confirmedStart: '2099-07-22T10:00Z', confirmedEnd: '2099-07-22T11:00Z' })
  expect(fixture.rpc).toHaveBeenCalledWith('mutate_calendar_proposal', expect.objectContaining({ p_action: 'approve', p_request_id: requestId, p_start: null, p_end: null }))
})

it('surfaces missing approvals or permissions without sending a proposal notice', async () => {
  fixture.rpc.mockResolvedValue({ error: { code: '42501', message: 'Not authorised' } })
  await expect(proposeCalendarAppointmentReplacement(appointmentId, proposal)).rejects.toMatchObject({ code: '42501' })
  expect(fixture.notify).not.toHaveBeenCalled()
})

it('does not acknowledge a proposal belonging to another appointment', async () => {
  fixture.rpc.mockResolvedValue({ data: { verified: true, appointment: fixture.appointment, participants: [], request: { ...fixture.request, appointment_id: 'another' } } })
  await expect(proposeCalendarAppointmentReplacement(appointmentId, proposal)).rejects.toThrow(/verified/)
  expect(fixture.notify).not.toHaveBeenCalled()
})

it('does not repeat optional notifications when the database replays a command', async () => {
  fixture.rpc.mockResolvedValue({ data: { verified: true, appointment: fixture.appointment, participants: [], request: fixture.request, replayed: true } })
  await proposeCalendarAppointmentReplacement(appointmentId, proposal)
  expect(fixture.notify).not.toHaveBeenCalled()
})

it('keeps specialist reschedule proposals on their existing endpoint', async () => {
  fixture.appointment.attorney_delivery_enabled = false
  fixture.rpc.mockResolvedValue({ data: [{ request_id: requestId, appointment_id: appointmentId, request_status: 'proposed', preferred_start: proposal.preferredStart, preferred_end: proposal.preferredEnd }] })
  await proposeAppointmentReschedule(requestId, proposal)
  expect(fixture.rpc).toHaveBeenCalledWith('propose_attorney_appointment_reschedule', expect.objectContaining({ p_request_id: requestId }))
})
