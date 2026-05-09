import {
  renderBridgeCta,
  renderBridgeEmailLayout,
  renderBridgeIntroParagraphs,
  renderBridgeSummaryCard,
} from './bridgeEmailLayout.ts'

function pickText(value: string | undefined, fallback: string) {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function eventTitle(eventType: string) {
  const mapping: Record<string, string> = {
    appointment_scheduled: 'Appointment Scheduled',
    appointment_updated: 'Appointment Updated',
    appointment_cancelled: 'Appointment Cancelled',
    appointment_rescheduled: 'Appointment Rescheduled',
    appointment_confirmation_required: 'Please Confirm Your Appointment',
    appointment_reminder: 'Appointment Reminder',
    appointment_documents_required: 'Documents Needed Before Your Appointment',
  }
  return mapping[eventType] || 'Appointment Update'
}

export function buildAppointmentSubject(eventType: string, appointmentType = 'Appointment') {
  const title = eventTitle(eventType)
  const typeLabel = pickText(appointmentType, 'Appointment')
  if (eventType === 'appointment_confirmation_required') {
    return `${title}: ${typeLabel}`
  }
  return `${typeLabel} - ${title}`
}

export function buildAppointmentEmailHtml({
  eventType,
  recipientName,
  appointmentType,
  appointmentTitle,
  appointmentDate,
  appointmentTime,
  location,
  status,
  notes,
  actionLink,
}: {
  eventType: string
  recipientName?: string
  appointmentType?: string
  appointmentTitle?: string
  appointmentDate?: string
  appointmentTime?: string
  location?: string
  status?: string
  notes?: string
  actionLink?: string
}) {
  const typeLabel = pickText(appointmentTitle, appointmentType || 'Appointment')

  const intro = {
    appointment_scheduled: [`Your ${typeLabel.toLowerCase()} has been scheduled.`],
    appointment_updated: [`Your ${typeLabel.toLowerCase()} details were updated.`],
    appointment_cancelled: [`Your ${typeLabel.toLowerCase()} has been cancelled.`],
    appointment_rescheduled: [`Your ${typeLabel.toLowerCase()} has been rescheduled.`],
    appointment_confirmation_required: [`Please confirm your ${typeLabel.toLowerCase()} details below.`],
    appointment_reminder: [`This is a reminder about your upcoming ${typeLabel.toLowerCase()}.`],
    appointment_documents_required: ['Please upload the required documents before your appointment.'],
  }[eventType] || ['Your appointment has an update.']

  const contentHtml = [
    renderBridgeIntroParagraphs(intro),
    renderBridgeSummaryCard(
      [
        { label: 'Appointment', value: typeLabel },
        { label: 'Date', value: pickText(appointmentDate, 'TBC') },
        { label: 'Time', value: pickText(appointmentTime, 'TBC') },
        { label: 'Location', value: pickText(location, 'To be confirmed') },
        { label: 'Status', value: pickText(status, 'Pending') },
      ],
      'Appointment Details',
    ),
    notes
      ? `<p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #35506d;"><strong>Notes:</strong> ${notes}</p>`
      : '',
    actionLink ? renderBridgeCta('View Appointment', actionLink) : '',
  ].join('')

  return renderBridgeEmailLayout({
    preheader: `${eventTitle(eventType)} for ${typeLabel}`,
    title: eventTitle(eventType),
    greeting: `Hi ${pickText(recipientName, 'there')},`,
    contentHtml,
    helpBody: 'Need help? Reply to this email and your Bridge team will assist you.',
  })
}

export function buildAppointmentEmailText({
  eventType,
  recipientName,
  appointmentType,
  appointmentTitle,
  appointmentDate,
  appointmentTime,
  location,
  status,
  notes,
  actionLink,
}: {
  eventType: string
  recipientName?: string
  appointmentType?: string
  appointmentTitle?: string
  appointmentDate?: string
  appointmentTime?: string
  location?: string
  status?: string
  notes?: string
  actionLink?: string
}) {
  const typeLabel = pickText(appointmentTitle, appointmentType || 'Appointment')

  return [
    `Hi ${pickText(recipientName, 'there')},`,
    '',
    `${eventTitle(eventType)}: ${typeLabel}`,
    appointmentDate ? `Date: ${appointmentDate}` : null,
    appointmentTime ? `Time: ${appointmentTime}` : null,
    location ? `Location: ${location}` : null,
    status ? `Status: ${status}` : null,
    notes ? `Notes: ${notes}` : null,
    actionLink ? `View appointment: ${actionLink}` : null,
    '',
    'Need help? Reply to this email and your Bridge team will assist you.',
    '',
    'Bridge',
  ]
    .filter(Boolean)
    .join('\n')
}
