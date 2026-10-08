import { resolveAppointmentSchedule } from './appointmentTime.js'

export function canonicalReservationStatus(value = '') {
  const status = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return ({ pending: 'requested', pending_confirmation: 'requested', buyer_confirmed: 'confirmed',
    canceled: 'cancelled', needs_reschedule: 'alternative_requested', reschedule_requested: 'alternative_requested' })[status] || status
}

export function appointmentReservationState(appointment = {}, now = Date.now()) {
  const status = canonicalReservationStatus(appointment.status)
  if (['draft', 'cancelled', 'declined', 'completed', 'no_show'].includes(status)) return 'released'
  const schedule = resolveAppointmentSchedule(appointment, { strict: false })
  const end = Date.parse(schedule.endDateTime)
  if (status === 'confirmed' || appointment.hasConfirmedReservation === true || appointment.has_confirmed_reservation === true) {
    return Number.isFinite(end) && end <= Number(now) ? 'released' : 'confirmed'
  }
  if (!['requested', 'accepted', 'alternative_requested', 'alternative_proposed'].includes(status)) return 'needs_review'
  const issued = Date.parse(appointment.requestIssuedAt || appointment.request_issued_at || appointment.createdAt || appointment.created_at)
  const explicit = Date.parse(appointment.holdExpiresAt || appointment.hold_expires_at)
  const deadline = Math.min(Number.isFinite(explicit) ? explicit : issued + 86400000, Date.parse(schedule.dateTime))
  // A date alone is not evidence of a live hold on an unverified historical row.
  return Number.isFinite(deadline) && deadline > Number(now) ? 'held' : 'needs_follow_up'
}

export function appointmentReservesTime(appointment, now = Date.now()) {
  return ['confirmed', 'held'].includes(appointmentReservationState(appointment, now))
}
