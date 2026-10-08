// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../../../lib/agencyPipelineService', () => ({ listAppointmentsAsync: vi.fn() }))
import { listAppointmentsAsync } from '../../../../lib/agencyPipelineService'
import AppointmentDashboardSection from '../AppointmentDashboardSection.jsx'

const booking = { appointmentId: 'master', assignedAgentId: 'agent', status: 'confirmed', dateTime: '2026-10-09T08:00:00Z', endDateTime: '2026-10-09T08:30:00Z', clientName: 'Verified client' }
const props = { organisationId: 'org', module: 'agent', userId: 'agent', variant: 'compact' }
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T06:00:00Z')) })
afterEach(() => { cleanup(); vi.useRealTimers() })

it('shows unknown counts and Retry after an initial failure, and shows empty only after a successful retry', async () => {
  listAppointmentsAsync.mockRejectedValueOnce(new Error('Network failed')).mockResolvedValueOnce([])
  render(<AppointmentDashboardSection {...props} />)
  await act(async () => {})
  expect(screen.getByRole('alert').textContent).toContain('Appointment counts are unavailable')
  expect(screen.queryByText('No upcoming appointments')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await act(async () => {})
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText('No upcoming appointments')).toBeTruthy()
})

it('keeps a last verified booking on failed refresh and removes it after a verified cancellation', async () => {
  listAppointmentsAsync.mockResolvedValueOnce([booking]).mockRejectedValueOnce(new Error('Disconnected')).mockResolvedValueOnce([{ ...booking, status: 'cancelled' }])
  render(<AppointmentDashboardSection {...props} />)
  await act(async () => {})
  expect(screen.getByText('Verified client')).toBeTruthy()
  act(() => window.dispatchEvent(new Event('itg:agency-crm-updated')))
  await act(async () => { await vi.advanceTimersByTimeAsync(100) })
  expect(screen.getByRole('alert').textContent).toContain('Showing the last verified schedule')
  expect(screen.getByText('Verified client')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await act(async () => {})
  expect(screen.queryByText('Verified client')).toBeNull()
  expect(screen.getByText('No upcoming appointments')).toBeTruthy()
})

it('updates a controlled snapshot without a second database read and opens the stable master ID', async () => {
  const open = vi.fn()
  const { rerender } = render(<AppointmentDashboardSection {...props} appointmentRows={[booking]} onManageAppointment={open} />)
  fireEvent.click(screen.getByRole('button', { name: 'Manage Appointments' }))
  expect(open.mock.calls[0][0].id).toBe('master')
  rerender(<AppointmentDashboardSection {...props} appointmentRows={[{ ...booking, clientName: 'Edited client' }]} onManageAppointment={open} />)
  expect(screen.getByText('Edited client')).toBeTruthy()
  expect(screen.queryByText('Verified client')).toBeNull()
  expect(listAppointmentsAsync).not.toHaveBeenCalled()
})

it('reclassifies controlled holds when time passes and keeps follow-up reachable', async () => {
  const open = vi.fn()
  const row = { ...booking, status: 'requested', holdExpiresAt: '2026-10-09T06:00:20Z', requestIssuedAt: '2026-10-09T06:00:00Z' }
  render(<AppointmentDashboardSection {...props} appointmentRows={[row]} onManageAppointment={open} />)
  expect(screen.getByText('Verified client')).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(30100) })
  expect(screen.getByText('No upcoming appointments')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Verified client/ }))
  expect(open.mock.calls[0][0].id).toBe('master')
  expect(open.mock.calls[0][0].statusLabel).toBe('Needs follow-up')
})

it('does not present supplied but unverified empty rows as zero appointments', () => {
  const reload = vi.fn()
  render(<AppointmentDashboardSection {...props} appointmentRows={[]} appointmentLoad={{ status: 'error', hasSnapshot: false, error: 'Permission denied', reload }} />)
  expect(screen.queryByText('No upcoming appointments')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(reload).toHaveBeenCalledOnce()
})
