import assert from 'node:assert/strict'
import {
  buildAttorneyInviteOutcome,
  summarizeAttorneyInviteDelivery,
} from '../attorneyInviteDelivery.js'

const sent = summarizeAttorneyInviteDelivery({
  notificationResults: [{ email: { sent: true, status: 'sent' } }],
  reminderResults: [{ id: 'reminder-1' }, { id: 'reminder-2' }],
})
assert.equal(sent.status, 'sent')
assert.equal(sent.sentCount, 1)
assert.equal(sent.calendarInviteDelivered, true)
assert.equal(sent.reminders.status, 'scheduled')
assert.equal(sent.reminders.scheduledCount, 2)
assert.equal(buildAttorneyInviteOutcome(sent).tone, 'success')

const failed = summarizeAttorneyInviteDelivery({
  notificationResults: [{ email: { sent: false, status: 'failed', reason: 'provider unavailable' } }],
  reminderError: new Error('reminder queue unavailable'),
})
assert.equal(failed.status, 'failed')
assert.equal(failed.retryable, true)
assert.deepEqual(failed.failureReasons, ['provider unavailable'])
assert.equal(failed.reminders.status, 'failed')
assert.match(buildAttorneyInviteOutcome(failed).message, /Appointment saved/)

const partial = summarizeAttorneyInviteDelivery({
  notificationResults: [
    { email: { sent: true, status: 'sent' } },
    { email: { sent: false, status: 'failed', reason: 'second recipient failed' } },
  ],
})
assert.equal(partial.status, 'partial')
assert.equal(partial.sentCount, 1)
assert.equal(partial.failedCount, 1)

const skipped = summarizeAttorneyInviteDelivery({
  notificationResults: [{ email: { sent: false, status: 'skipped', reason: 'duplicate_notification' } }],
  calendarInviteRequested: false,
})
assert.equal(skipped.status, 'skipped')
assert.equal(skipped.calendarInviteDelivered, false)
assert.equal(buildAttorneyInviteOutcome(skipped).tone, 'error')

const caught = summarizeAttorneyInviteDelivery({ notificationError: new Error('notification service unavailable') })
assert.equal(caught.status, 'failed')
assert.equal(caught.failedCount, 1)
assert.deepEqual(caught.failureReasons, ['notification service unavailable'])

console.log('attorney invite delivery tests passed')
