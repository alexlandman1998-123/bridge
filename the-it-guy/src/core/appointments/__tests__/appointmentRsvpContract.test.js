import assert from 'node:assert/strict'
import {
  actionToAppointmentRsvpStatus,
  buildAppointmentRsvpContract,
  getAppointmentRsvpStatusCopy,
  isCompletedAppointmentRsvp,
} from '../appointmentRsvpContract.js'

const NOW = new Date('2026-07-18T08:00:00.000Z')

for (const [action, status] of [
  ['accept', 'Accepted'],
  ['decline', 'Declined'],
  ['reschedule', 'Proposed New Time'],
]) {
  assert.equal(actionToAppointmentRsvpStatus(action), status)
  assert.equal(isCompletedAppointmentRsvp(status), true)
  assert.match(getAppointmentRsvpStatusCopy(status), /Thanks/)
}

const accepted = buildAppointmentRsvpContract({ action: 'accept' }, { now: NOW })
assert.equal(accepted.isValid, true)
assert.equal(accepted.value.proposedNewTime, null)

const rescheduled = buildAppointmentRsvpContract({
  action: 'reschedule',
  preferredDate: '2026-07-20',
  preferredStartTime: '10:00',
  preferredEndTime: '11:00',
  message: 'A later time works better.',
}, { now: NOW })
assert.equal(rescheduled.isValid, true)
assert.equal(rescheduled.value.proposedNewTime, '2026-07-20T08:00:00.000Z')
assert.equal(rescheduled.value.preferredEnd, '2026-07-20T09:00:00.000Z')

for (const [label, input, code] of [
  ['missing action', {}, 'missing_action'],
  ['missing date', { action: 'reschedule', preferredStartTime: '10:00' }, 'invalid_preferred_date'],
  ['past', { action: 'reschedule', preferredDate: '2026-07-18', preferredStartTime: '09:00' }, 'preferred_time_in_past'],
  ['bad end', { action: 'reschedule', preferredDate: '2026-07-20', preferredStartTime: '10:00', preferredEndTime: '09:00' }, 'preferred_end_before_start'],
]) {
  const result = buildAppointmentRsvpContract(input, { now: NOW })
  assert.equal(result.isValid, false, label)
  assert.ok(result.errors.some((error) => error.code === code), `${label} should include ${code}`)
}

console.log('appointment RSVP contract tests passed')
