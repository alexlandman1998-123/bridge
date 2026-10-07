import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { buildAppointmentICSPayload, getAppointmentCalendarTitle, getGoogleCalendarLink, getOutlookCalendarLink } from '../src/services/appointmentCalendarInviteService'
import { buildIcsAttachment } from '../../supabase/functions/send-email/handlers/appointment.ts'

function decodeAttachment(attachment) {
  return Buffer.from(attachment.content, 'base64').toString('utf8').replace(/\r\n[ \t]/g,'')
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
    agentName: 'Test Attorney',
    agentRole: 'Property Consultant',
    organisationName: 'Kingstons Property',
    notes: 'Bring ID; proof of address\nOriginal documents',
    actionLink: 'https://app.arch9.co.za/appointment-rsvp/test',
    attachCalendarInvite: true,
    ...overrides,
  }
}

describe('appointment calendar attachment', () => {
  it('updates legacy calendar titles without duplicating the Arch9 prefix', () => {
    expect(getAppointmentCalendarTitle({ title: 'Bridge: Viewing' })).toBe('Arch9: Viewing')
    expect(getAppointmentCalendarTitle({ title: 'Arch9: Viewing' })).toBe('Arch9: Viewing')
    expect(getAppointmentCalendarTitle({ title: 'Viewing' })).toBe('Arch9: Viewing')
    const appointment = { title: 'Bridge: Viewing', appointment_id: 'stable', appointment_date: '2099-07-20', start_time: '10:00' }
    expect(new URL(getGoogleCalendarLink(appointment)).searchParams.get('text')).toBe('Arch9: Viewing')
    expect(new URL(getOutlookCalendarLink(appointment)).searchParams.get('subject')).toBe('Arch9: Viewing')
    expect(buildAppointmentICSPayload(appointment).uid).toBe('bridge-stable@bridge.app')
  })

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
    expect(content).toContain('DESCRIPTION:Host: Test Attorney\\, Property Consultant\\n\\nAgency: Kingstons Property')
  })

  it('escapes calendar text and preserves the RSVP link', () => {
    const content = decodeAttachment(buildIcsAttachment(payload()))

    expect(content).toContain('SUMMARY:Signing\\, documents\\; review')
    expect(content).toContain('LOCATION:1 Legal Lane\\, Cape Town')
    expect(content).toContain('DESCRIPTION:Host: Test Attorney\\, Property Consultant\\n\\nAgency: Kingstons Property\\n\\nBring ID\\; proof of address\\nOriginal documents\\n\\nAppointment link: https://app.arch9.co.za/appointment-rsvp/test\\n\\nLocation: 1 Legal Lane\\, Cape Town\\n\\nPlease reply to the email if you need to reschedule.')
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

it('keeps retry attachments stable, advances sequence and folds Unicode lines', () => {
  const input = payload({calendarSequence:3,calendarTimestamp:'2026-10-03T12:00:00Z',appointmentTitle:'é'.repeat(100)})
  const first=buildIcsAttachment(input), second=buildIcsAttachment(input)
  expect(first.content).toBe(second.content)
  const raw=Buffer.from(first.content,'base64').toString('utf8')
  expect(raw.split('\r\n').every(line=>Buffer.byteLength(line,'utf8')<=75)).toBe(true)
  expect(decodeAttachment(first)).toContain('SEQUENCE:3')
  expect(decodeAttachment(first)).toContain('DTSTAMP:20261003T120000Z')
  const cancelled=decodeAttachment(buildIcsAttachment({...input,type:'appointment_cancelled',calendarSequence:4}))
  expect(cancelled).toContain('SEQUENCE:4')
  expect(cancelled).toContain('METHOD:CANCEL')
  expect(cancelled).toContain('UID:bridge-11111111-1111-4111-8111-111111111111@bridge.app')
})

it('uses saved SAST civil times and revision in downloadable calendar links',()=>{
  const input={appointment_id:'stable',appointment_date:'2099-07-20',start_time:'10:00',end_time:'11:30',status:'Pending Confirmation',calendar_revision:2}
  const event=buildAppointmentICSPayload(input)
  expect(event.start.toISOString()).toBe('2099-07-20T08:00:00.000Z')
  expect(event.end.toISOString()).toBe('2099-07-20T09:30:00.000Z')
  expect(event).toMatchObject({sequence:2,status:'TENTATIVE',uid:'bridge-stable@bridge.app'})
  expect(new URL(getGoogleCalendarLink(input)).searchParams.get('dates')).toBe('20990720T100000/20990720T113000')
  expect(new URL(getOutlookCalendarLink(input)).searchParams.get('startdt')).toBe('2099-07-20T08:00:00.000Z')
})
