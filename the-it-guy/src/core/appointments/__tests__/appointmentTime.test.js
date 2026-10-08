import { describe, expect, it } from 'vitest'
import {
  appointmentLocalToIso, mergeAppointmentSchedule, parseAppointmentInstant, resolveAppointmentSchedule,
} from '../appointmentTime.js'
import { checkAppointmentConflicts, getSuggestedAvailabilitySlots } from '../../../lib/appointmentAvailabilityEngine'
import {
  buildAppointmentICSPayload, generateAppointmentICSFromAppointment, getGoogleCalendarLink, getOutlookCalendarLink,
} from '../../../services/appointmentCalendarInviteService'

const BOOKING = {
  appointmentId: 'booking-1', appointmentType: 'viewing', assignedAgentId: 'agent-1', status: 'confirmed',
  date: '2027-10-01', startTime: '11:30', endTime: '12:00', timezone: 'Africa/Johannesburg',
  dateTime: '2027-10-01T09:30:00Z',
}

describe('Appointment civil time conversion', () => {
  it('uses the chosen timezone for ordinary times and dates near midnight', () => {
    expect(appointmentLocalToIso('2027-10-01', '11:30')).toBe('2027-10-01T09:30:00.000Z')
    expect(appointmentLocalToIso('2027-10-01', '00:15')).toBe('2027-09-30T22:15:00.000Z')
    expect(appointmentLocalToIso('2027-07-20', '11:30', 'America/New_York')).toBe('2027-07-20T15:30:00.000Z')
    expect(appointmentLocalToIso('2027-07-20', '11:30', 'Asia/Kathmandu')).toBe('2027-07-20T05:45:00.000Z')
  })

  for (const [date, time] of [['2027-02-29', '11:00'], ['2027-04-31', '11:00'], ['2027-10-01', '24:00'], ['2027-10-01', '11:60']]) {
    it(`rejects an impossible date or clock value: ${date} ${time}`, () => {
      expect(() => appointmentLocalToIso(date, time)).toThrow(/valid appointment/)
    })
  }
  it('accepts leap day and rejects an invalid timezone', () => {
    expect(appointmentLocalToIso('2028-02-29', '11:00')).toBe('2028-02-29T09:00:00.000Z')
    expect(() => appointmentLocalToIso('2028-02-29', '11:00', 'Unknown/Timezone')).toThrow(/timezone/)
    expect(() => parseAppointmentInstant('2027-02-30T11:00:00Z')).toThrow(/valid appointment/)
  })
  it('rejects a nonexistent DST time rather than shifting the appointment', () => {
    expect(() => appointmentLocalToIso('2027-03-14', '02:30', 'America/New_York')).toThrow(/does not exist/)
  })
  it('requires an explicit instant for a repeated DST clock time', () => {
    expect(() => appointmentLocalToIso('2027-11-07', '01:30', 'America/New_York')).toThrow(/occurs twice/)
    expect(appointmentLocalToIso('2027-11-07', '01:30', 'America/New_York', '2027-11-07T01:30:00-04:00')).toBe('2027-11-07T05:30:00.000Z')
    expect(appointmentLocalToIso('2027-11-07', '01:30', 'America/New_York', '2027-11-07T01:30:00-05:00')).toBe('2027-11-07T06:30:00.000Z')
  })
})

describe('Appointment schedule validation and edits', () => {
  it('derives local display fields from an explicit timestamp in the booking timezone', () => {
    expect(resolveAppointmentSchedule({ dateTime: '2027-09-30T22:15:00Z' })).toMatchObject({
      date: '2027-10-01', startTime: '00:15', endTime: '01:00',
    })
  })
  it('recalculates the instant after date, clock or timezone edits', () => {
    const saved = resolveAppointmentSchedule(BOOKING)
    const moved = resolveAppointmentSchedule(mergeAppointmentSchedule(saved, { date: '2027-10-02', startTime: '15:00', endTime: '15:30' }))
    expect(moved).toMatchObject({ dateTime: '2027-10-02T13:00:00.000Z', endDateTime: '2027-10-02T13:30:00.000Z' })
    const changedZone = resolveAppointmentSchedule(mergeAppointmentSchedule(saved, { timezone: 'UTC' }))
    expect(changedZone.dateTime).toBe('2027-10-01T11:30:00.000Z')
  })
  it('updates duration and timestamp-only edits without inherited contradictory fields', () => {
    const saved = resolveAppointmentSchedule(BOOKING)
    expect(resolveAppointmentSchedule(mergeAppointmentSchedule(saved, { endTime: '13:00' })).endDateTime).toBe('2027-10-01T11:00:00.000Z')
    expect(resolveAppointmentSchedule(mergeAppointmentSchedule(saved, { dateTime: '2027-10-02T13:00:00Z' }))).toMatchObject({ date: '2027-10-02', startTime: '15:00', endTime: '15:30' })
    expect(resolveAppointmentSchedule(mergeAppointmentSchedule(saved, { startTime: '15:00' }))).toMatchObject({ startTime: '15:00', endTime: '15:30' })
  })
  it('rejects a contradictory caller timestamp but preserves and flags old data on read', () => {
    const bad = { ...BOOKING, dateTime: '2027-10-01T11:30:00Z', endTime: '15:00' }
    expect(() => resolveAppointmentSchedule(bad)).toThrow(/disagree/)
    expect(resolveAppointmentSchedule(bad, { strict: false })).toMatchObject({
      dateTime: '2027-10-01T11:30:00.000Z', schedulingTimeIssue: 'APPOINTMENT_TIME_MISMATCH',
    })
  })
  for (const endTime of ['11:30', '10:30', '99:00']) {
    it(`rejects an invalid end time: ${endTime}`, () => {
      expect(() => resolveAppointmentSchedule({ ...BOOKING, endTime })).toThrow()
    })
  }
  it('rejects a non-positive duration instead of replacing it with a default', () => {
    for (const durationMinutes of [0, -30]) {
      expect(() => resolveAppointmentSchedule({ ...BOOKING, endTime: '', durationMinutes })).toThrow(/duration/)
    }
  })
  it('represents all-day appointments using local midnight and an exclusive end', () => {
    expect(resolveAppointmentSchedule({ date: '2027-10-01', allDay: true })).toMatchObject({
      dateTime: '2027-09-30T22:00:00.000Z', endDateTime: '2027-10-01T22:00:00.000Z',
    })
    const spring = resolveAppointmentSchedule({ date: '2027-03-14', allDay: true, timezone: 'America/New_York' })
    expect((Date.parse(spring.endDateTime) - Date.parse(spring.dateTime)) / 3600000).toBe(23)
    const autumn = resolveAppointmentSchedule({ date: '2027-11-07', allDay: true, timezone: 'America/New_York' })
    expect((Date.parse(autumn.endDateTime) - Date.parse(autumn.dateTime)) / 3600000).toBe(25)
  })
})

describe('Availability and exports use the same schedule', () => {
  it('does not disguise an invalid end as a default-duration reservation', () => {
    expect(checkAppointmentConflicts({ ...BOOKING, endTime: '10:30' }).hardConflicts[0].type).toBe('invalid_datetime')
  })
  it('requires review before reusing a related booking with contradictory times', () => {
    const existing = { ...BOOKING, appointmentId: 'old', dateTime: '2027-10-01T11:30:00Z' }
    expect(checkAppointmentConflicts(BOOKING, { appointments: [existing], maxSuggestions: 0 }).hardConflicts[0].type).toBe('unverified_existing_datetime')
  })
  for (const status of ['cancelled', 'declined', 'completed', 'no_show']) {
    it(`${status} releases a booking even when its old time is invalid`, () => {
      expect(checkAppointmentConflicts({ status, date: 'invalid' }, { appointments: [BOOKING] }).hasHardConflicts).toBe(false)
    })
  }
  it('suggests local business-hour slots and checks existing reservations', () => {
    const appointment = { ...BOOKING, date: '2099-10-01', dateTime: '2099-10-01T06:00:00Z', startTime: '08:00', endTime: '09:00' }
    const suggestions = getSuggestedAvailabilitySlots(appointment, { appointments: [appointment], maxSuggestions: 1, slotMinutes: 30, businessHours: { days: [0,1,2,3,4,5,6], start: '08:00', end: '17:00' } })
    expect(suggestions[0].start).toBe('2099-10-01T07:00:00.000Z')
  })
  it('exports the actual timezone and saved duration', () => {
    const appointment = { ...BOOKING, timezone: 'America/New_York', dateTime: null }
    const event = buildAppointmentICSPayload(appointment)
    expect(event.start.toISOString()).toBe('2027-10-01T15:30:00.000Z')
    expect(event.end.toISOString()).toBe('2027-10-01T16:00:00.000Z')
    expect(new URL(getOutlookCalendarLink(appointment)).searchParams.get('startdt')).toBe(event.start.toISOString())
  })
  it('exports absolute instants so a repeated clock hour retains its chosen occurrence', () => {
    const appointment = { date: '2027-11-07', startTime: '00:30', endTime: '01:30', timezone: 'America/New_York', endDateTime: '2027-11-07T06:30:00Z' }
    const ics = generateAppointmentICSFromAppointment(appointment).content
    expect(ics).toContain('DTSTART:20271107T043000Z')
    expect(ics).toContain('DTEND:20271107T063000Z')
    expect(new URL(getGoogleCalendarLink(appointment)).searchParams.get('dates')).toBe('20271107T043000Z/20271107T063000Z')
  })
  it('exports an all-day event as dates with the following day as its exclusive end', () => {
    const appointment = { appointmentId: 'all-day', date: '2027-10-01', allDay: true }
    const ics = generateAppointmentICSFromAppointment(appointment).content
    expect(ics).toContain('DTSTART;VALUE=DATE:20271001')
    expect(ics).toContain('DTEND;VALUE=DATE:20271002')
    expect(new URL(getGoogleCalendarLink(appointment)).searchParams.get('dates')).toBe('20271001/20271002')
    expect(new URL(getOutlookCalendarLink(appointment)).searchParams.get('allday')).toBe('true')
  })
})
