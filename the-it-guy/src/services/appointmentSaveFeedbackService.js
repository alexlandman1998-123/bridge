function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeLower(value))
}

function uniqueValues(values = []) {
  return [...new Set(values.map((value) => normalizeLower(value)).filter(Boolean))]
}

function collectAppointmentEmailRows(result = {}) {
  const rows = []
  const notificationRows = Array.isArray(result?.notificationResults)
    ? result.notificationResults
    : Array.isArray(result?.inviteNotificationResults)
      ? result.inviteNotificationResults
      : []

  for (const row of notificationRows) {
    if (row?.email) rows.push(row.email)
  }
  if (result?.email) rows.push(result.email)
  if (result?.emailResult) rows.push(result.emailResult)
  if (result?.delivery?.email) rows.push(result.delivery.email)
  return rows
}

function resolveAppointmentRecipientEmails(result = {}, participants = [], fallbackEmail = '') {
  const notificationRows = Array.isArray(result?.notificationResults) ? result.notificationResults : []
  return uniqueValues([
    fallbackEmail,
    result?.recipientEmail,
    result?.delivery?.recipientEmail,
    ...notificationRows.map((row) => row?.participant?.email || row?.event?.recipient_email),
    ...(Array.isArray(participants) ? participants : []).map((participant) => participant?.email),
  ])
}

function resolveAppointmentEmailStatus({ result = {}, requestedInvite = true, hasRecipient = false } = {}) {
  const emailRows = collectAppointmentEmailRows(result)
  const hasDeliverySignal = emailRows.length > 0 || result?.notificationsQueued || result?.notificationError
  if (!requestedInvite && !hasDeliverySignal) return 'not sent'
  if (!hasRecipient) return 'failed'
  if (result?.notificationError) return 'failed'

  if (emailRows.some((row) => row?.sent === true || normalizeLower(row?.status) === 'sent')) return 'sent'
  if (emailRows.some((row) => normalizeLower(row?.reason) === 'duplicate_notification')) return 'sent'
  if (emailRows.some((row) => normalizeLower(row?.status) === 'failed')) return 'failed'
  if (emailRows.some((row) => normalizeLower(row?.status) === 'queued' || normalizeLower(row?.reason) === 'background_delivery')) return 'queued'
  if (result?.notificationsQueued) return 'queued'
  return 'failed'
}

function resolveAppointmentEmailFailureReasons(result = {}) {
  const rows = collectAppointmentEmailRows(result)
  return uniqueValues([
    result?.notificationError,
    result?.emailError,
    result?.delivery?.emailError,
    ...rows.map((row) => row?.reason || row?.error || row?.message),
  ]).filter((reason) => reason && reason !== 'duplicate_notification')
}

function shouldShowExternalCalendarNotSynced(result = {}, explicitStatus = '') {
  const status = normalizeLower(
    explicitStatus ||
      result?.externalCalendarStatus ||
      result?.external_calendar_status ||
      result?.calendar?.externalCalendarStatus,
  )
  return status === 'not_synced'
}

export function buildAppointmentSaveFeedback(result = {}, options = {}) {
  if (result.delivery?.verified === true && Array.isArray(result.delivery.jobs)) {
    const emailJobs = result.delivery.jobs.filter(job => job.channel === 'email' && !job.event_kind.startsWith('reminder:'))
    const counts = Object.fromEntries(['queued','processing','provider_accepted','delivered','failed','superseded'].map(status => [status, emailJobs.filter(job => job.status === status).length]))
    const labels = ['queued','processing','provider_accepted','delivered','failed','superseded'].filter(status => counts[status]).map(status => `${counts[status]} ${status.replaceAll('_',' ')}`)
    const invitations = result.listingViewingRoundNumber ? 'Viewing invitations are tracked in the viewing workflow.' : result.sendInviteEmails === false ? 'Invitations off.' : emailJobs.length ? `Email: ${labels.join(', ')}.` : 'No email jobs queued.'
    const reminders = result.delivery.jobs.filter(job => job.event_kind.startsWith('reminder:') && ['queued','processing'].includes(job.status))
    const parts = [options.includeAction !== false ? `${normalizeText(options.actionLabel) || 'Appointment saved'}.` : '', invitations,
      result.remindersEnabled === false ? 'Reminders off.' : `${reminders.length} reminder jobs scheduled.`,
      emailJobs.length && result.attachCalendarInvite !== false ? 'Calendar attachment prepared for email delivery.' : '',
      shouldShowExternalCalendarNotSynced(result, options.externalCalendarStatus) ? 'External calendar not synced.' : '']
    return parts.filter(Boolean).join(' ')
  }
  const participants = Array.isArray(options?.participants) ? options.participants : []
  const requestedInvite = options?.requestedInvite !== false
  const recipientEmails = resolveAppointmentRecipientEmails(result, participants, options?.recipientEmail)
  const recipientEmailLabel = recipientEmails.length ? recipientEmails.join(', ') : 'missing'
  const emailStatus = resolveAppointmentEmailStatus({
    result,
    requestedInvite,
    hasRecipient: recipientEmails.some(isValidEmail),
  })
  const failureReasons = resolveAppointmentEmailFailureReasons(result)
  const deliveryRequestedOrHappened = requestedInvite || ['queued', 'sent'].includes(emailStatus)
  const icsAttached = deliveryRequestedOrHappened &&
    options?.attachCalendarInvite !== false &&
    recipientEmails.some(isValidEmail) &&
    ['queued', 'sent'].includes(emailStatus)

  const parts = []
  if (options?.includeAction !== false) {
    parts.push(`${normalizeText(options?.actionLabel) || 'Appointment saved'}.`)
  }
  parts.push(`Email ${emailStatus}.`)
  if (emailStatus === 'failed' && failureReasons.length) {
    parts.push(`Reason: ${failureReasons.join(', ')}.`)
  }
  parts.push(`Recipient email: ${recipientEmailLabel}.`)
  parts.push(icsAttached ? 'ICS attached.' : 'ICS not attached.')
  if (shouldShowExternalCalendarNotSynced(result, options?.externalCalendarStatus)) {
    parts.push('External calendar not synced.')
  }
  return parts.join(' ')
}

export default buildAppointmentSaveFeedback
