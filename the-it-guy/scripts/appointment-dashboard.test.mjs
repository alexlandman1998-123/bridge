import assert from 'node:assert/strict'
import {
  formatAppointmentType,
  getAppointmentDashboardData,
  getAppointmentStatusPresentation,
} from '../src/services/appointmentDashboardService.js'

const now = new Date('2026-06-12T10:00:00Z')

const appointments = [
  {
    appointmentId: 'apt-1',
    appointmentType: 'seller_consultation',
    status: 'confirmed',
    dateTime: '2026-06-12T14:00:00Z',
    assignedAgentId: 'agent-1',
    assignedAgentName: 'Alex Agent',
    locationType: 'physical_address',
    location: '23 Main Road, Bedfordview',
    participants: [{ name: 'Alex Manvandieland', participantRole: 'Seller' }],
  },
  {
    appointmentId: 'apt-2',
    appointmentType: 'viewing',
    status: 'requested',
    dateTime: '2026-06-13T10:00:00Z',
    assignedAgentId: 'agent-1',
    assignedAgentName: 'Alex Agent',
    participants: [{ name: 'Sarah Johnson', participantRole: 'Buyer' }],
  },
  {
    appointmentId: 'apt-3',
    appointmentType: 'other',
    customTypeLabel: '',
    status: 'alternative_requested',
    dateTime: '2026-06-14T10:00:00Z',
    assignedAgentId: 'agent-1',
    assignedAgentName: 'Alex Agent',
    participants: [{ name: 'Michael Brown', participantRole: 'Client' }],
  },
  {
    appointmentId: 'apt-4',
    appointmentType: 'finance_consultation',
    status: 'confirmed',
    dateTime: '2026-06-12T08:30:00Z',
    assignedAgentId: 'agent-1',
    assignedAgentName: 'Alex Agent',
    participants: [{ name: 'Emma Williams', participantRole: 'Buyer' }],
  },
]

assert.equal(formatAppointmentType('other'), 'General Appointment')
assert.equal(formatAppointmentType('finance_consultation', { module: 'bond' }), 'Finance Consultation')
assert.equal(getAppointmentStatusPresentation('alternative_requested').label, 'Reschedule Requested')

{
  const data = await getAppointmentDashboardData({
    module: 'agent',
    appointments,
    userId: 'agent-1',
    now,
    includeAll: false,
  })

  assert.equal(data.counts.pendingConfirmation, 1)
  assert.equal(data.counts.upcoming, 3)
  assert.equal(data.counts.needsReschedule, 1)
  assert.equal(data.calendarStrip.appointmentsToday, 2)
  assert.equal(data.nextAppointment.id, 'apt-4')
  assert.equal(data.nextAppointment.isOverdue, true)
  assert.equal(data.nextAppointment.typeLabel, 'Finance Consultation')
  assert.equal(data.groups.find((group) => group.label === 'Today').appointments.length, 2)
  assert.equal(data.groups.find((group) => group.label === 'Tomorrow').appointments.length, 1)
}

{
  const data = await getAppointmentDashboardData({
    module: 'bond',
    appointments,
    now,
  })

  assert.equal(data.appointments.length, 1)
  assert.equal(data.appointments[0].typeLabel, 'Finance Consultation')
}

{
  const data = await getAppointmentDashboardData({
    module: 'lead',
    appointments: [
      { ...appointments[0], leadId: 'lead-1' },
      { ...appointments[1], leadId: 'lead-2' },
    ],
    leadId: 'lead-1',
    now,
  })

  assert.equal(data.appointments.length, 1)
  assert.equal(data.appointments[0].clientName, 'Alex Manvandieland')
}

// A lead/listing booking must remain visible when the agent created it or is
// attending it, even when another agent owns the appointment.
const sharedBookings = [
  { ...appointments[0], appointmentId: 'participant-booking', assignedAgentId: 'other-agent', leadId: 'lead-1', listingId: 'listing-1', participants: [{ userId: 'agent-1', participantRole: 'agent' }] },
  { ...appointments[0], appointmentId: 'creator-booking', assignedAgentId: 'other-agent', createdBy: 'agent-1', participants: [] },
  { ...appointments[0], appointmentId: 'email-booking', assignedAgentId: 'other-agent', participants: [{ email: 'AGENT@EXAMPLE.COM', participantRole: 'agent' }] },
  { ...appointments[0], appointmentId: 'unrelated-booking', assignedAgentId: 'other-agent', participants: [] },
]
const agentBookings = await getAppointmentDashboardData({ module: 'agent', appointments: sharedBookings, userId: 'agent-1', userEmail: 'agent@example.com', now })
assert.deepEqual(agentBookings.appointments.map((row) => row.id), ['participant-booking', 'creator-booking', 'email-booking'])
for (const scope of [{ module: 'lead', leadId: 'lead-1' }, { module: 'default', listingId: 'listing-1' }]) {
  const scoped = await getAppointmentDashboardData({ ...scope, appointments: sharedBookings, now })
  assert.deepEqual(scoped.appointments.map((row) => row.id), ['participant-booking'])
}
const splitDateBookings = await getAppointmentDashboardData({
  appointments: [
    { appointmentId: 'later', status: 'confirmed', date: '2026-06-13', startTime: '10:00' },
    { appointmentId: 'today', status: 'confirmed', appointment_date: '2026-06-12', start_time: '14:00' },
  ], now,
})
assert.equal(splitDateBookings.counts.upcoming, 2)
assert.equal(splitDateBookings.calendarStrip.appointmentsToday, 1)
assert.equal(splitDateBookings.nextAppointment.id, 'today')
assert.equal(splitDateBookings.nextAppointment.dateTime, '2026-06-12T12:00:00.000Z')
assert.equal(splitDateBookings.groups.find((group) => group.label === 'Today').appointments.length, 1)
assert.equal(splitDateBookings.groups.find((group) => group.label === 'Tomorrow').appointments.length, 1)
console.log('appointment dashboard tests passed')
