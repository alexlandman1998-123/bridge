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
    appointment_scheduled: 'Appointment Requested',
    appointment_confirmed: 'Appointment Accepted',
    appointment_updated: 'Appointment Updated',
    appointment_cancelled: 'Appointment Cancelled',
    appointment_rescheduled: 'Appointment Rescheduled',
    appointment_confirmation_required: 'Appointment Requested',
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
  return `${title}: ${typeLabel}`
}

export function buildAppointmentEmailHtml({
  eventType,
  recipientName,
  appointmentType,
  appointmentTitle,
  appointmentDate,
  appointmentTime,
  relatedListing,
  location,
  status,
  notes,
  actionLink,
  acceptLink,
  declineLink,
  rescheduleLink,
  meetingUrl,
}: {
  eventType: string
  recipientName?: string
  appointmentType?: string
  appointmentTitle?: string
  appointmentDate?: string
  appointmentTime?: string
  relatedListing?: string
  location?: string
  status?: string
  notes?: string
  actionLink?: string
  acceptLink?: string
  declineLink?: string
  rescheduleLink?: string
  meetingUrl?: string
}) {
  const typeLabel = pickText(appointmentTitle, appointmentType || 'Appointment')

  const intro = {
    appointment_scheduled: [
      `A ${typeLabel.toLowerCase()} has been requested.`,
      'Please accept the proposed time, or request an alternative if it does not work for you.',
    ],
    appointment_confirmed: [
      `Your ${typeLabel.toLowerCase()} has been accepted and it's on.`,
    ],
    appointment_updated: [`Your ${typeLabel.toLowerCase()} details were updated.`],
    appointment_cancelled: [`Your ${typeLabel.toLowerCase()} has been cancelled.`],
    appointment_rescheduled: [`Your ${typeLabel.toLowerCase()} has been rescheduled.`],
    appointment_confirmation_required: [
      `A ${typeLabel.toLowerCase()} has been requested.`,
      'Please accept the proposed time, or request an alternative if it does not work for you. The appointment is only confirmed once the final time is approved.',
    ],
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
        ...(relatedListing ? [{ label: 'Listing / Property', value: relatedListing }] : []),
        { label: 'Location', value: pickText(meetingUrl || location, 'To be confirmed') },
        { label: 'Status', value: pickText(status, 'Pending') },
      ],
      'Appointment Details',
    ),
    notes
      ? `<p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #35506d;"><strong>Notes:</strong> ${notes}</p>`
      : '',
    acceptLink || declineLink || rescheduleLink
      ? `<div style="margin: 18px 0 16px;">
          <p style="margin: 0 0 10px; font-size: 13px; line-height: 1.5; color: #5d728a;">Please let us know whether the proposed appointment time works for you.</p>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${acceptLink ? `<a href="${acceptLink}" style="display: inline-block; border-radius: 999px; background: #214f75; color: #ffffff; font-size: 13px; font-weight: 700; text-decoration: none; padding: 10px 16px;">Accept</a>` : ''}
            ${declineLink ? `<a href="${declineLink}" style="display: inline-block; border-radius: 999px; background: #ffffff; border: 1px solid #dce6f1; color: #214f75; font-size: 13px; font-weight: 700; text-decoration: none; padding: 9px 15px;">Decline</a>` : ''}
            ${rescheduleLink ? `<a href="${rescheduleLink}" style="display: inline-block; border-radius: 999px; background: #f7fafc; border: 1px solid #dce6f1; color: #35506d; font-size: 13px; font-weight: 700; text-decoration: none; padding: 9px 15px;">Request Reschedule</a>` : ''}
          </div>
        </div>`
      : '',
    actionLink ? renderBridgeCta('View Appointment', actionLink) : '',
  ].join('')

  return renderBridgeEmailLayout({
    preheader: `${eventTitle(eventType)} for ${typeLabel}`,
    title: eventTitle(eventType),
    greeting: `Hi ${pickText(recipientName, 'there')},`,
    contentHtml,
    helpBody: 'Need help? Reply to this email and your Arch9 team will assist you.',
  })
}

export function buildAppointmentEmailText({
  eventType,
  recipientName,
  appointmentType,
  appointmentTitle,
  appointmentDate,
  appointmentTime,
  relatedListing,
  location,
  status,
  notes,
  actionLink,
  acceptLink,
  declineLink,
  rescheduleLink,
  meetingUrl,
}: {
  eventType: string
  recipientName?: string
  appointmentType?: string
  appointmentTitle?: string
  appointmentDate?: string
  appointmentTime?: string
  relatedListing?: string
  location?: string
  status?: string
  notes?: string
  actionLink?: string
  acceptLink?: string
  declineLink?: string
  rescheduleLink?: string
  meetingUrl?: string
}) {
  const typeLabel = pickText(appointmentTitle, appointmentType || 'Appointment')

  return [
    `Hi ${pickText(recipientName, 'there')},`,
    '',
    `${eventTitle(eventType)}: ${typeLabel}`,
    appointmentDate ? `Date: ${appointmentDate}` : null,
    appointmentTime ? `Time: ${appointmentTime}` : null,
    relatedListing ? `Listing / Property: ${relatedListing}` : null,
    meetingUrl || location ? `Location: ${meetingUrl || location}` : null,
    status ? `Status: ${status}` : null,
    notes ? `Notes: ${notes}` : null,
    acceptLink ? `Accept: ${acceptLink}` : null,
    declineLink ? `Decline: ${declineLink}` : null,
    rescheduleLink ? `Request reschedule: ${rescheduleLink}` : null,
    actionLink ? `View appointment: ${actionLink}` : null,
    '',
    'Need help? Reply to this email and your Arch9 team will assist you.',
    '',
    'Arch9',
  ]
    .filter(Boolean)
    .join('\n')
}
