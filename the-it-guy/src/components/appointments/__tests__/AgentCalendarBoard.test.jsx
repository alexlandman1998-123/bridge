// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import AgentCalendarBoard from '../AgentCalendarBoard'
import { buildCalendarDayEvents } from '../agentCalendarDisplay'

afterEach(cleanup)
const day = new Date('2026-10-18T22:00:00Z')
const days = [day, new Date('2026-10-19T22:00:00Z')]
const row = (id, start = '07:00', end = '08:00', changes = {}) => ({ appointmentId: id, title: `Viewing ${id}`, appointmentType: 'viewing', dateTime: `2026-10-19T${start}:00Z`, endDateTime: `2026-10-19T${end}:00Z`, timezone: 'Africa/Johannesburg', assignedAgentId: 'agent', status: 'confirmed', ...changes })
const props = changes => ({ appointments: [row('one')], days, cursorDate: day, view: 'week', onViewChange: vi.fn(), periodLabel: '19 – 25 October 2026', onShift: vi.fn(), onToday: vi.fn(), onSelectDate: vi.fn(), onCreate: vi.fn(), onOpen: vi.fn(), agents: [{ id: 'agent', name: 'Alex Agent' }], agentFilter: 'all', onAgentChange: vi.fn(), isPrincipal: true, historyView: 'work', onHistoryChange: vi.fn(), hasSnapshot: true, resolveListingLabel: () => '18 Willow Lane', resolveAgentName: () => 'Alex Agent', now: day, ...changes })

it('places SAST appointments by time, separates overlaps and opens the saved appointment', () => {
  const fixture = props({ appointments: [row('one'), row('two', '07:30', '09:00')] })
  render(<AgentCalendarBoard {...fixture} />)
  const first = screen.getByRole('button', { name: /Viewing one, 09:00 to 10:00/ })
  const second = screen.getByRole('button', { name: /Viewing two, 09:30 to 11:00/ })
  expect(first.style.top).toBe('56px')
  expect(first.style.width).toBe('calc(50% - 6px)')
  expect(second.style.left).toBe('calc(50% + 3px)')
  fireEvent.click(first)
  expect(fixture.onOpen).toHaveBeenCalledWith(fixture.appointments[0])
  fireEvent.click(screen.getByRole('button', { name: 'Add appointment on Monday, 19 Oct at 11:00' }))
  expect(fixture.onCreate).toHaveBeenCalledWith({ date: '2026-10-19', startTime: '11:00' })
})

it('filters locally, scopes the counts to the period, and can clear filters', () => {
  const fixture = props({ appointments: [row('confirmed'), row('pending', '09:00', '10:00', { status: 'requested' }), row('outside', '09:00', '10:00', { dateTime: '2026-11-01T09:00:00Z', endDateTime: '2026-11-01T10:00:00Z' })] })
  render(<AgentCalendarBoard {...fixture} />)
  expect(screen.getByText('2 appointments')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '1 pending' }))
  expect(screen.getByText('1 appointment')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Viewing confirmed,/ })).toBeNull()
  fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'Completed' } })
  expect(screen.getByText('No appointments match these filters')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(screen.getByText('2 appointments')).toBeTruthy()
})

it('preserves navigation, agent/history selection, and the day, month and agenda controls', () => {
  const fixture = props()
  render(<AgentCalendarBoard {...fixture} />)
  fireEvent.click(screen.getByRole('button', { name: 'Next period' }))
  expect(fixture.onShift).toHaveBeenCalledWith(1)
  fireEvent.change(screen.getByLabelText('Calendar view'), { target: { value: 'agenda' } })
  expect(fixture.onViewChange).toHaveBeenCalledWith('agenda')
  fireEvent.change(screen.getByLabelText('Calendar agent filter'), { target: { value: 'agent' } })
  expect(fixture.onAgentChange).toHaveBeenCalledWith('agent')
  fireEvent.change(screen.getByLabelText('Calendar records'), { target: { value: 'archived' } })
  expect(fixture.onHistoryChange).toHaveBeenCalledWith('archived')
  fireEvent.click(screen.getByRole('button', { name: 'View Monday, 19 October' }))
  expect(fixture.onSelectDate).toHaveBeenCalledWith(day)
})

it('shows all month appointments rather than silently hiding bookings after the fourth', () => {
  render(<AgentCalendarBoard {...props({ view: 'month', appointments: Array.from({ length: 6 }, (_, index) => row(String(index))) })} />)
  expect(screen.getAllByRole('button', { name: /09:00 Viewing/ })).toHaveLength(6)
})

it('shows an agenda with saved statuses and opens the existing booking workflow', () => {
  const fixture = props({ view: 'agenda' })
  render(<AgentCalendarBoard {...fixture} />)
  fireEvent.click(screen.getByRole('button', { name: /09:00.*10:00.*Viewing one.*Confirmed/ }))
  expect(fixture.onOpen).toHaveBeenCalledWith(fixture.appointments[0])
})

it('expands hours for early and late bookings and keeps all-day events out of timed lanes', () => {
  render(<AgentCalendarBoard {...props({ appointments: [row('early', '03:00', '04:00'), row('late', '18:00', '19:00'), row('all-day', '22:00', '22:00', { dateTime: '2026-10-18T22:00:00Z', endDateTime: '2026-10-19T22:00:00Z', allDay: true })] })} />)
  expect(screen.getByText('05:00')).toBeTruthy()
  expect(screen.getByRole('button', { name: /Viewing late, 20:00 to 21:00/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Viewing all-day' })).toBeTruthy()
})

it('splits overnight appointments at SAST midnight without double-counting the booking', () => {
  const appointment = row('overnight', '21:30', '23:00')
  const model = buildCalendarDayEvents([appointment], days)
  expect(model.get('2026-10-19')[0]).toMatchObject({ start: 1410, end: 1440 })
  expect(model.get('2026-10-20')[0]).toMatchObject({ start: 0, end: 60 })
  render(<AgentCalendarBoard {...props({ appointments: [appointment] })} />)
  expect(screen.getByText('1 appointment')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /Viewing overnight,/ })).toHaveLength(2)
})

it('does not display a failed or unverified read as zero verified appointments', () => {
  render(<AgentCalendarBoard {...props({ appointments: [], hasSnapshot: false })} />)
  expect(screen.getByText('Counts unavailable')).toBeTruthy()
  expect(screen.queryByText('No appointments in this period')).toBeNull()
})
