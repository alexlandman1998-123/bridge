// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AppointmentDetailCard from '../AppointmentDetailCard'

afterEach(cleanup)
const appointment = { status: 'confirmed', dateTime: '2026-10-20T07:30:00Z', endDateTime: '2026-10-20T08:30:00Z', timezone: 'Africa/Johannesburg', location: '7 Garden Court', participants: [] }
const props = changes => ({ appointment, agentName: 'Demo Agent', statusLabel: 'Confirmed', canEdit: true, onAddNote: vi.fn(), onAddAttendee: vi.fn(), ...changes })

it('shows SAST time and simple add links without empty input boxes', () => {
  const fixture = props()
  render(<AppointmentDetailCard {...fixture} />)
  expect(screen.getByText('09:30 – 10:30')).toBeTruthy()
  expect(screen.getByText('7 Garden Court')).toBeTruthy()
  expect(screen.queryByRole('textbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
  fireEvent.click(screen.getByRole('button', { name: 'Add attendee' }))
  expect(fixture.onAddNote).toHaveBeenCalledOnce()
  expect(fixture.onAddAttendee).toHaveBeenCalledOnce()
})
it('keeps saved notes and active guests, excluding revoked attendees and the agent', () => {
  render(<AppointmentDetailCard {...props({ appointment: { ...appointment, notes: 'Bring the property keys.', participants: [
    { name: 'Demo Agent', participantRole: 'Agent' }, { name: 'Demo Buyer', participantRole: 'Buyer' }, { name: 'Revoked Buyer', participantRole: 'Buyer', rsvpRevokedAt: '2026-10-19' },
  ] } })} />)
  expect(screen.getByText('Bring the property keys.')).toBeTruthy()
  expect(screen.getByText('Demo Buyer')).toBeTruthy()
  expect(screen.queryByText('Revoked Buyer')).toBeNull()
  expect(screen.getAllByText('Demo Agent')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull()
})
it('shows an all-day event and respects view-only access', () => {
  render(<AppointmentDetailCard {...props({ canEdit: false, appointment: { ...appointment, dateTime: '2026-10-23T22:00:00Z', endDateTime: '2026-10-24T22:00:00Z', allDay: true } })} />)
  expect(screen.getByText('All day')).toBeTruthy()
  expect(screen.getByText('Saturday, 24 October 2026')).toBeTruthy()
  expect(screen.queryByRole('button')).toBeNull()
})
it('shows the original reservation as confirmed while a replacement is awaiting approval',()=>{
 render(<AppointmentDetailCard {...props({appointment:{...appointment,status:'alternative_proposed',hasConfirmedReservation:true},statusLabel:'Alternative proposed'})} />)
 expect(screen.getByText('Confirmed')).toBeTruthy()
 expect(screen.queryByText('Alternative proposed')).toBeNull()
 expect(screen.getByText('09:30 – 10:30')).toBeTruthy()
})
