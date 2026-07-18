export const ATTORNEY_INVITE_DELIVERY_STATUSES = Object.freeze({
  sent: 'sent',
  partial: 'partial',
  failed: 'failed',
  skipped: 'skipped',
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function unique(values = []) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))]
}

export function summarizeAttorneyInviteDelivery({
  notificationResults = [],
  notificationError = null,
  reminderResults = [],
  reminderError = null,
  calendarInviteRequested = true,
} = {}) {
  const rows = Array.isArray(notificationResults) ? notificationResults : []
  const sentRows = rows.filter((row) => row?.email?.sent === true || row?.email?.status === 'sent')
  const failedRows = rows.filter((row) => row?.error || row?.email?.status === 'failed')
  const skippedRows = rows.filter((row) => row?.email?.status === 'skipped')
  const failureReasons = unique([
    notificationError?.message || notificationError,
    ...failedRows.map((row) => row?.error || row?.email?.reason),
  ])

  let status = ATTORNEY_INVITE_DELIVERY_STATUSES.skipped
  if (sentRows.length && failedRows.length) {
    status = ATTORNEY_INVITE_DELIVERY_STATUSES.partial
  } else if (sentRows.length) {
    status = ATTORNEY_INVITE_DELIVERY_STATUSES.sent
  } else if (failedRows.length || notificationError) {
    status = ATTORNEY_INVITE_DELIVERY_STATUSES.failed
  }

  const scheduledReminderCount = Array.isArray(reminderResults) ? reminderResults.length : 0

  return {
    status,
    sentCount: sentRows.length,
    failedCount: failedRows.length + (notificationError && !failedRows.length ? 1 : 0),
    skippedCount: skippedRows.length,
    failureReasons,
    retryable: status === ATTORNEY_INVITE_DELIVERY_STATUSES.failed || status === ATTORNEY_INVITE_DELIVERY_STATUSES.partial,
    calendarInviteRequested: calendarInviteRequested !== false,
    calendarInviteDelivered: calendarInviteRequested !== false && sentRows.length > 0,
    reminders: {
      status: reminderError ? 'failed' : scheduledReminderCount ? 'scheduled' : 'skipped',
      scheduledCount: scheduledReminderCount,
      error: normalizeText(reminderError?.message || reminderError),
    },
  }
}

export function buildAttorneyInviteOutcome(delivery = {}) {
  const status = normalizeText(delivery?.status)
  if (status === ATTORNEY_INVITE_DELIVERY_STATUSES.sent) {
    return { tone: 'success', message: 'Attorney invite created and email sent with a calendar attachment.' }
  }
  if (status === ATTORNEY_INVITE_DELIVERY_STATUSES.partial) {
    return { tone: 'error', message: 'Appointment saved, but one or more invite deliveries failed. Use Resend from the appointment.' }
  }
  if (status === ATTORNEY_INVITE_DELIVERY_STATUSES.failed) {
    return { tone: 'error', message: 'Appointment saved, but the invite email could not be delivered. Use Resend from the appointment.' }
  }
  return { tone: 'error', message: 'Appointment saved, but no invite email was sent. Use Resend from the appointment.' }
}
