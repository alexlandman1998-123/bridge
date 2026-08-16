import assert from 'node:assert/strict'

import { buildAppointmentSaveFeedback } from '../src/services/appointmentSaveFeedbackService.js'

assert.equal(
  buildAppointmentSaveFeedback(
    {
      notificationsQueued: true,
      notificationResults: [{ email: { sent: false, status: 'queued', reason: 'background_delivery' } }],
      externalCalendarStatus: 'not_synced',
    },
    {
      requestedInvite: true,
      attachCalendarInvite: true,
      participants: [{ email: 'buyer@example.test' }],
    },
  ),
  'Appointment saved. Email queued. Recipient email: buyer@example.test. ICS attached. External calendar not synced.',
)

assert.equal(
  buildAppointmentSaveFeedback(
    {
      notificationResults: [{ participant: { email: 'seller@example.test' }, email: { sent: true, status: 'sent' } }],
      externalCalendarStatus: 'synced',
    },
    {
      actionLabel: 'Appointment updated',
      requestedInvite: true,
      attachCalendarInvite: true,
    },
  ),
  'Appointment updated. Email sent. Recipient email: seller@example.test. ICS attached.',
)

assert.equal(
  buildAppointmentSaveFeedback(
    {
      notificationError: 'send failed',
      notificationResults: [{ participant: { email: 'client@example.test' }, email: { sent: false, status: 'failed', reason: 'provider_error' } }],
      externalCalendarStatus: 'not_synced',
    },
    {
      requestedInvite: true,
      attachCalendarInvite: true,
    },
  ),
  'Appointment saved. Email failed. Reason: send failed, provider_error. Recipient email: client@example.test. ICS not attached. External calendar not synced.',
)

assert.equal(
  buildAppointmentSaveFeedback(
    {
      notificationResults: [{ participant: { email: 'client@example.test' }, email: { sent: false, status: 'queued', reason: 'outbox_retry_queued' } }],
      externalCalendarStatus: 'not_synced',
    },
    {
      requestedInvite: true,
      attachCalendarInvite: true,
    },
  ),
  'Appointment saved. Email queued. Recipient email: client@example.test. ICS attached. External calendar not synced.',
)

assert.equal(
  buildAppointmentSaveFeedback(
    { externalCalendarStatus: 'not_synced' },
    {
      requestedInvite: false,
      attachCalendarInvite: false,
      participants: [{ email: 'buyer@example.test' }],
    },
  ),
  'Appointment saved. Email not sent. Recipient email: buyer@example.test. ICS not attached. External calendar not synced.',
)

console.log('appointment save feedback tests passed')
