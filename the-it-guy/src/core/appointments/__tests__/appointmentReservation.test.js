import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appointmentReservationState, appointmentReservesTime } from '../appointmentReservation.js'
import { checkAppointmentConflicts } from '../../../lib/appointmentAvailabilityEngine.js'

const now = Date.parse('2027-10-01T06:00:00Z')
const booking = { appointmentId: 'one', status: 'requested', date: '2027-10-02', startTime: '10:00', endTime: '11:00',
  timezone: 'Africa/Johannesburg', dateTime: '2027-10-02T08:00:00Z', endDateTime: '2027-10-02T09:00:00Z',
  createdAt: '2027-10-01T06:00:00Z', requestIssuedAt: '2027-10-01T06:00:00Z', holdExpiresAt: '2027-10-02T06:00:00Z' }

describe('Reservation deadlines', () => {
  it.each(['requested', 'accepted', 'alternative_requested', 'alternative_proposed', 'Pending Confirmation', 'Reschedule Requested'])(
    'holds %s only until the original deadline', status => {
      expect(appointmentReservationState({ ...booking, status }, now)).toBe('held')
      expect(appointmentReservationState({ ...booking, status }, now + 86400000)).toBe('needs_follow_up')
    },
  )
  it('does not let updated timestamps renew an expired request', () => {
    expect(appointmentReservesTime({ ...booking, updatedAt: '2027-10-02T06:30:00Z' }, now + 86400000)).toBe(false)
  })
  it('preserves a confirmed original through an unapproved replacement', () => {
    expect(appointmentReservationState({ ...booking, status: 'alternative_proposed', hasConfirmedReservation: true }, now + 86400000)).toBe('confirmed')
  })
  it.each(['draft', 'cancelled', 'completed', 'no_show', 'declined'])('releases %s even with a future deadline', status => {
    expect(appointmentReservesTime({ ...booking, status }, now)).toBe(false)
  })
  it('caps a legacy short-notice request at its start, without guessing from a date alone', () => {
    const legacy = { ...booking, dateTime: '2027-10-01T08:00:00Z', date: '2027-10-01', holdExpiresAt: null }
    expect(appointmentReservesTime(legacy, now + 2 * 3600000)).toBe(false)
    expect(appointmentReservesTime({ ...legacy, createdAt: null, requestIssuedAt: null }, now)).toBe(false)
  })
  it('releases a confirmed interval after its end', () => {
    expect(appointmentReservationState({ ...booking, status: 'confirmed' }, Date.parse(booking.endDateTime))).toBe('released')
  })
})

describe('Attendee conflict severity', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now) })
  afterEach(() => vi.useRealTimers())
  const conflict = attendees => checkAppointmentConflicts({ ...booking, status: 'confirmed', participants: [{ userId: 'shared', participantRole: 'Buyer' }] }, {
    appointments: [{ ...booking, appointmentId: 'other', status: 'confirmed', participants: attendees }],
    excludeAppointmentId: 'one', maxSuggestions: 1,
  })
  it('warns for an optional attendee and excludes removed or declined attendees', () => {
    // These fixtures are future relative to the fixed reservation evaluation below.
    const optional = conflict([{ userId: 'shared', participantRole: 'Buyer', isRequired: false }])
    expect(optional.hardConflicts).toHaveLength(0)
    expect(optional.softConflicts.some(row => row.type === 'optional_participant_overlap')).toBe(true)
    for (const attendee of [{ rsvpStatus: 'Declined' }, { rsvpRevokedAt: '2026-10-01T00:00:00Z' }]) {
      expect(conflict([{ userId: 'shared', participantRole: 'Buyer', ...attendee }]).hardConflicts).toHaveLength(0)
    }
  })
})
