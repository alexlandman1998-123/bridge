import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { buildIcsAttachment } from '../../supabase/functions/send-email/handlers/appointment.ts'

function decodeAttachment(attachment) {
  return Buffer.from(attachment.content, 'base64').toString('utf8')
}

function payload(overrides = {}) {
  return {
    type: 'appointment_confirmation_required',
    to: 'client@example.com',
    appointmentId: '11111111-1111-4111-8111-111111111111',
    appointmentType: 'Attorney consultation',
    appointmentTitle: 'Signing, documents; review',
    appointmentDate: '2026-07-20',
    appointmentTime: '10:00',
    appointmentEndTime: '11:00',
    location: '1 Legal Lane, Cape Town',
    timezone: 'Africa/Johannesburg',
    status: 'Pending Confirmation',
    recipientName: 'Test Client',
    organizerName: 'Test Attorney',
    organizerEmail: 'attorney@example.com',
    notes: 'Bring ID; proof of address\nOriginal documents',
    actionLink: 'https://app.arch9.co.za/appointment-rsvp/test',
    attachCalendarInvite: true,
    ...overrides,
  }
}

describe('appointment calendar attachment', () => {
  it('emits stable Johannesburg-to-UTC event data and organizer fields', () => {
    const attachment = buildIcsAttachment(payload())
    const content = decodeAttachment(attachment)

    expect(attachment.filename).toBe('arch9-appointment-11111111-1111-4111-8111-111111111111.ics')
    expect(attachment.content_type).toContain('method=REQUEST')
    expect(content).toContain('METHOD:REQUEST')
    expect(content).toContain('UID:bridge-11111111-1111-4111-8111-111111111111@bridge.app')
    expect(content).toContain('DTSTART:20260720T080000Z')
    expect(content).toContain('DTEND:20260720T090000Z')
    expect(content).toContain('X-WR-TIMEZONE:Africa/Johannesburg')
    expect(content).toContain('STATUS:TENTATIVE')
    expect(content).toContain('ORGANIZER;CN=Test Attorney:MAILTO:attorney@example.com')
    expect(content).toContain('ATTENDEE;CN=Test Client;ROLE=REQ-PARTICIPANT;RSVP=TRUE:MAILTO:client@example.com')
  })

  it('escapes calendar text and preserves the RSVP link', () => {
    const content = decodeAttachment(buildIcsAttachment(payload()))

    expect(content).toContain('SUMMARY:Signing\\, documents\\; review')
    expect(content).toContain('LOCATION:1 Legal Lane\\, Cape Town')
    expect(content).toContain('DESCRIPTION:Bring ID\\; proof of address\\nOriginal documents\\n\\nAppointment link: https://app.arch9.co.za/appointment-rsvp/test')
    expect(content).toContain('URL:https://app.arch9.co.za/appointment-rsvp/test')
    expect(content.split('\r\n')).toContain('END:VCALENDAR')
  })

  it('emits cancellation semantics and supports disabling attachments', () => {
    const cancelled = buildIcsAttachment(payload({ type: 'appointment_cancelled', status: 'Cancelled' }))
    const content = decodeAttachment(cancelled)

    expect(cancelled.content_type).toContain('method=CANCEL')
    expect(content).toContain('METHOD:CANCEL')
    expect(content).toContain('STATUS:CANCELLED')
    expect(buildIcsAttachment(payload({ attachCalendarInvite: false }))).toBeNull()
  })

  it('falls back to a 45-minute duration when end time is invalid', () => {
    const content = decodeAttachment(buildIcsAttachment(payload({ appointmentEndTime: '09:00' })))
    expect(content).toContain('DTSTART:20260720T080000Z')
    expect(content).toContain('DTEND:20260720T084500Z')
  })
})
