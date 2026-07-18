import assert from 'node:assert/strict'
import {
  ATTORNEY_INVITE_LOCATION_TYPES,
  ATTORNEY_INVITE_TIMEZONE,
  ATTORNEY_INVITE_TYPES,
  buildAttorneyInviteContract,
  requireValidAttorneyInvite,
} from '../attorneyInviteContract.js'
import { getAppointmentTypeTemplate } from '../../../services/appointmentTemplateService.js'

const NOW = new Date('2026-07-18T08:00:00.000Z')

function validInput(overrides = {}) {
  return {
    organisationId: '11111111-1111-4111-8111-111111111111',
    transactionId: '22222222-2222-4222-8222-222222222222',
    appointmentType: 'transfer_signing',
    recipientName: 'Test Client',
    recipientEmail: 'client@example.com',
    date: '2026-07-20',
    startTime: '10:00',
    locationMode: 'video_call',
    location: 'https://meet.example.com/attorney-invite',
    ...overrides,
  }
}

for (const type of ATTORNEY_INVITE_TYPES) {
  const result = buildAttorneyInviteContract(validInput({ appointmentType: type.value }), { now: NOW })
  const template = getAppointmentTypeTemplate(type.value)
  assert.equal(result.isValid, true, `${type.value} should be valid`)
  assert.equal(result.value.durationMinutes, type.durationMinutes)
  assert.equal(result.value.participantRole, type.participantRole)
  assert.equal(result.value.visibility, type.visibility)
  assert.equal(result.value.timezone, ATTORNEY_INVITE_TIMEZONE)
  assert.equal(type.durationMinutes, template.defaultDurationMinutes, `${type.value} duration must match its appointment template`)
  assert.equal(type.visibility, template.defaultVisibility, `${type.value} visibility must match its appointment template`)
}

const boardroom = requireValidAttorneyInvite(validInput({
  locationMode: 'boardroom',
  location: '',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceName: 'Boardroom A',
}), { now: NOW })
assert.equal(boardroom.locationType, ATTORNEY_INVITE_LOCATION_TYPES.physicalAddress)
assert.equal(boardroom.location, 'Boardroom A')
assert.equal(boardroom.resourceId, '33333333-3333-4333-8333-333333333333')
assert.equal(boardroom.meetingUrl, '')

const office = requireValidAttorneyInvite(validInput({
  locationMode: 'office',
  location: '1 Legal Lane, Cape Town',
}), { now: NOW })
assert.equal(office.locationMode, 'physical_address')
assert.equal(office.locationType, ATTORNEY_INVITE_LOCATION_TYPES.physicalAddress)

const phone = requireValidAttorneyInvite(validInput({
  locationMode: 'phone_call',
  location: '+27 21 555 0100',
}), { now: NOW })
assert.equal(phone.locationType, ATTORNEY_INVITE_LOCATION_TYPES.phoneCall)
assert.equal(phone.meetingUrl, '')

const time = requireValidAttorneyInvite(validInput({
  appointmentType: 'bond_signing',
  startTime: '14:30',
}), { now: NOW })
assert.equal(time.endTime, '15:30')
assert.equal(time.dateTime, '2026-07-20T14:30:00+02:00')

for (const [label, overrides, expectedCode] of [
  ['past invite', { date: '2026-07-18', startTime: '09:00' }, 'invite_in_past'],
  ['invalid email', { recipientEmail: 'not-an-email' }, 'invalid_recipient_email'],
  ['missing video URL', { location: '' }, 'missing_meeting_url'],
  ['invalid video URL', { location: 'javascript:alert(1)' }, 'invalid_meeting_url'],
  ['missing boardroom', { locationMode: 'boardroom', location: '' }, 'missing_boardroom'],
  ['missing address', { locationMode: 'physical_address', location: '' }, 'missing_physical_address'],
  ['missing phone details', { locationMode: 'phone_call', location: '' }, 'missing_phone_details'],
  ['crosses midnight', { startTime: '23:30' }, 'invite_crosses_midnight'],
  ['unsupported type', { appointmentType: 'court_hearing' }, 'unsupported_appointment_type'],
]) {
  const result = buildAttorneyInviteContract(validInput(overrides), { now: NOW })
  assert.equal(result.isValid, false, `${label} should fail`)
  assert.ok(result.errors.some((error) => error.code === expectedCode), `${label} should include ${expectedCode}`)
}

const internal = buildAttorneyInviteContract(validInput({
  appointmentType: 'internal_meeting',
  recipientEmail: '',
}), { now: NOW })
assert.equal(internal.isValid, false)
assert.ok(internal.errors.some((error) => error.code === 'missing_recipient_email'))

console.log('attorney invite contract tests passed')
