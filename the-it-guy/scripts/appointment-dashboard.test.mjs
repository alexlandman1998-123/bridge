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

console.log('appointment dashboard tests passed')
