// Complaint baseline: all originally reproduced defects are now ordinary regressions.
// These tests exercise public application functions with local fixtures only.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  appointments: [], participants: [], reminders: [], insertError: null,
  rpc: vi.fn(), invoke: vi.fn(),
}))

vi.mock('../../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  getEdgeFunctionInvokeError: vi.fn(),
  invokeEdgeFunction: db.invoke,
  supabase: {
    rpc: db.rpc,
    from(table) {
      let insert = null
      const query = {
        select: () => query, eq: () => query, in: () => query,
        is: () => query, order: () => query, gte: () => query,
        lt: () => query, limit: () => query,
        insert: value => { insert = value; return query },
        async maybeSingle() {
          if (table === 'appointments') return { data: db.appointments[0] || null, error: null }
          if (table === 'appointment_reminders') {
            if (!insert) return { data: null, error: null }
            if (db.insertError) return { data: null, error: db.insertError }
            const row = { id: `reminder-${db.reminders.length + 1}`, ...insert }
            db.reminders.push(row)
            return { data: row, error: null }
          }
          throw new Error(`Unexpected single-row query: ${table}`)
        },
        then(resolve, reject) {
          const rows = table === 'appointment_participants' ? db.participants
            : table === 'appointment_resources' ? [] : null
          return rows === null
            ? Promise.reject(new Error(`Unexpected query: ${table}`)).then(resolve, reject)
            : Promise.resolve({ data: rows, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  },
}))
vi.mock('../../../lib/envValidation', () => ({ isUnsafeFallbackAllowed: () => true }))
vi.mock('../../../services/notificationOutboxService', () => ({ prepareNotificationOutbox: vi.fn() }))

import {
  checkAppointmentSchedulingIntegrityAsync,
  createAppointment,
  updateAppointment,
} from '../../../lib/agencyPipelineService'
import { checkAppointmentConflicts, getUserAvailability } from '../../../lib/appointmentAvailabilityEngine'
import { getPrincipalAgentDetailCommandCentre } from '../../../modules/agency/agents/principalAgentCommandCentreService'
import { getAppointmentDashboardData } from '../../../services/appointmentDashboardService'
import { scheduleAppointmentReminders } from '../../../services/appointmentNotificationService'

const ORG = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const ATTENDEE = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2027-10-01T06:00:00Z')
const AGENT = { id: USER, userId: USER, email: 'agent@example.test', name: 'Agent A', status: 'active' }
const BOOKING = {
  appointmentId: 'booking-1', organisationId: ORG, appointmentType: 'viewing',
  status: 'requested', date: '2027-10-01', startTime: '11:30', endTime: '12:00',
  dateTime: '2027-10-01T09:30:00Z', timezone: 'Africa/Johannesburg',
  assignedAgentId: USER, assignedAgentEmail: AGENT.email, createdAt: NOW.toISOString(),
}
const DB_BOOKING = {
  appointment_id: BOOKING.appointmentId, organisation_id: ORG, agent_id: USER,
  appointment_type: 'viewing', appointment_date: BOOKING.date,
  start_time: BOOKING.startTime, end_time: BOOKING.endTime, date_time: BOOKING.dateTime,
  status: 'confirmed', timezone: BOOKING.timezone, visibility_scope: 'shared_role_players',
}


function conflictAgainst(status) {
  return checkAppointmentConflicts(BOOKING, {
    appointments: [{ ...BOOKING, appointmentId: 'other-booking', status }],
    maxSuggestions: 1,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  const stored = new Map()
  vi.stubGlobal('window', {
    localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
    dispatchEvent: vi.fn(),
  })
  db.appointments = [{ ...DB_BOOKING }]
  db.participants = [{
    participant_id: ATTENDEE, appointment_id: BOOKING.appointmentId, organisation_id: ORG,
    user_id: USER, name: 'Agent A', email: AGENT.email, participant_role: 'Agent',
    is_required: true, rsvp_status: 'Accepted',
  }]
  db.reminders = []
  db.insertError = null
  db.rpc.mockReset().mockImplementation(async name => {
    if (name !== 'bridge_list_calendar_appointments_with_times') throw new Error(`Unexpected RPC: ${name}`)
    return { data: db.appointments, error: null }
  })
  db.invoke.mockReset().mockImplementation(() => { throw new Error('External delivery is forbidden in baseline tests') })
})

afterEach(() => {
  expect(db.invoke).not.toHaveBeenCalled()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Appointment integrity baseline', () => {
  it('F01: moving a booking replaces its authoritative timestamp', () => {
    const saved = createAppointment(ORG, { ...BOOKING, assignedAgent: AGENT })
    const moved = updateAppointment(ORG, saved.appointmentId, { date: '2027-10-02', startTime: '15:00', endTime: '15:30' })
    expect(moved.dateTime).toBe('2027-10-02T13:00:00.000Z')
  })

  it('F02: creating a SAST booking is independent of the computer timezone', () => {
    const saved = createAppointment(ORG, { ...BOOKING, dateTime: null, assignedAgent: AGENT })
    expect(saved.dateTime).toBe('2027-10-01T09:30:00.000Z')
  })

  it('F02: a saved 30 minute booking remains 30 minutes in availability', async () => {
    const result = await getUserAvailability(USER, {}, { appointments: [{ ...BOOKING, status: 'confirmed' }] })
    expect(result.busySlots[0].endsAt).toBe('2027-10-01T10:00:00.000Z')
  })

  for (const status of ['requested', 'accepted', 'alternative_requested', 'alternative_proposed']) {
    it(`F03: an unexpired ${status} booking reserves the slot`, () => {
      expect(conflictAgainst(status).hasHardConflicts).toBe(true)
    })
  }

  for (const status of ['confirmed', 'Pending Confirmation']) {
    it(`F03 control: ${status} prevents a duplicate reservation`, () => {
      expect(conflictAgainst(status).hasHardConflicts).toBe(true)
    })
  }

  it('F04: the scheduling precheck retains required participant identities', async () => {
    db.appointments[0].agent_id = 'other-agent'
    const result = await checkAppointmentSchedulingIntegrityAsync(ORG, {
      ...BOOKING, appointmentId: 'new-booking', assignedAgentId: 'third-agent', assignedAgentEmail: '',
      participants: [{ userId: USER, email: AGENT.email, participantRole: 'Agent', isRequired: true }],
    }, { maxSuggestions: 1 })
    expect(result.hasHardConflicts).toBe(true)
  })

  it('F05: cancelling an overlapping booking releases it without a scheduling rejection', () => {
    const result = checkAppointmentConflicts({ ...BOOKING, status: 'cancelled' }, {
      appointments: [{ ...BOOKING, appointmentId: 'other-booking', status: 'confirmed' }],
      excludeAppointmentId: BOOKING.appointmentId, maxSuggestions: 1,
    })
    expect(result.hasHardConflicts).toBe(false)
  })

  for (const status of ['alternative_requested', 'alternative_proposed', 'no_show']) {
    it(`F06: saving preserves ${status}`, () => {
      const saved = createAppointment(ORG, {
        ...BOOKING, status, assignedAgent: AGENT,
        ...(status === 'no_show' ? { date: '2027-09-30', dateTime: '2027-09-30T09:30:00Z' } : {}),
      })
      expect(saved.status).toBe(status)
    })
  }
})

describe('Appointment visibility baseline', () => {
  const shared = {
    ...BOOKING, assignedAgentId: 'other-agent', assignedAgentEmail: '', createdBy: 'other-agent',
    participants: [{ userId: USER, email: AGENT.email, participantRole: 'Agent' }],
  }

  it('F11: a co-agent attendee sees the booking in their profile', () => {
    const profile = getPrincipalAgentDetailCommandCentre({ agent: AGENT, appointments: [shared], now: NOW })
    expect(profile.calendarSummary.upcomingItems).toHaveLength(1)
  })

  it('F11 control: the same co-agent attendee sees the booking on their dashboard', async () => {
    const dashboard = await getAppointmentDashboardData({
      module: 'agent', appointments: [shared], userId: USER, userEmail: AGENT.email, includeAll: false, now: NOW,
    })
    expect(dashboard.appointments).toHaveLength(1)
  })

  it('F14: a completed future-dated booking is excluded from profile upcoming work', () => {
    const profile = getPrincipalAgentDetailCommandCentre({
      agent: AGENT, appointments: [{ ...BOOKING, status: 'completed' }], now: NOW,
    })
    expect(profile.calendarSummary.upcomingItems).toHaveLength(0)
  })

  it('F14: an old unresolved request cannot replace the next future appointment', async () => {
    const dashboard = await getAppointmentDashboardData({
      module: 'agent', appointments: [{ ...BOOKING, appointmentId: 'old', dateTime: '2027-08-01T09:30:00Z' }, BOOKING],
      userId: USER, includeAll: false, now: NOW,
    })
    expect(dashboard.nextAppointment?.id).toBe(BOOKING.appointmentId)
  })
})

describe('Appointment reminder baseline', () => {
  it('F07: an internal reminder uses the user profile ID rather than the attendee row ID', async () => {
    const rows = await scheduleAppointmentReminders(BOOKING.appointmentId)
    expect(rows[0].recipient_id).toBe(USER)
  })

  it('F07: a foreign key failure is surfaced instead of reporting an empty successful schedule', async () => {
    db.insertError = {
      code: '23503',
      message: 'insert on table "appointment_reminders" violates foreign key constraint "appointment_reminders_recipient_id_fkey"',
    }
    await expect(scheduleAppointmentReminders(BOOKING.appointmentId)).rejects.toMatchObject({ code: '23503' })
  })

  it('F18: a saved custom 30 minute reminder replaces the type defaults', async () => {
    db.appointments[0].reminderRules = [{ reminderType: 'custom_30m', offsetMinutes: 30 }]
    const rows = await scheduleAppointmentReminders(BOOKING.appointmentId)
    expect(rows.map(row => ({ type: row.reminder_type, at: row.scheduled_for }))).toEqual([
      { type: 'custom_30m', at: '2027-10-01T09:00:00.000Z' },
    ])
  })
})
