// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileCalendarPage from '../MobileCalendarPage.jsx'

const mocks = vi.hoisted(() => ({ workspace: null, organisation: null, read: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => mocks.organisation }))
vi.mock('../../../services/mobileDashboardService.js', () => ({ getMobileCalendarSnapshotAsync: mocks.read }))
const appointment = { id: 'viewing', dateTime: '2026-10-06T08:00:00Z', timeLabel: '10:00', statusLabel: 'Confirmed', statusTone: 'green', typeLabel: 'Viewing', clientName: 'Saved client', propertyAddress: '18 Oak Avenue' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
  mocks.workspace = { role: 'developer', profile: { id: 'me' } }
  mocks.organisation = { organisation: { id: 'org-one' }, loading: false }
  mocks.read.mockResolvedValue({ appointments: [appointment, { ...appointment, id: 'tomorrow', dateTime: '2026-10-07T22:30:00Z', clientName: 'Midnight SAST client' }] })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

it('requests the exact SAST week and groups appointments by SAST date without reloading for each day', async () => {
  render(<MobileCalendarPage />)
  await act(async () => {})
  expect(mocks.read).toHaveBeenCalledWith({ workspace: mocks.workspace, organisation: mocks.organisation.organisation, dateRange: { from: '2026-10-04T22:00:00.000Z', to: '2026-10-11T21:59:59.999Z' } })
  expect(screen.getByText('Saved client')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Thursday, 08 October' }))
  expect(screen.queryByText('Saved client')).toBeNull()
  expect(screen.getByText('Midnight SAST client')).toBeTruthy()
  expect(mocks.read).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
  await act(async () => {})
  expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ dateRange: { from: '2026-10-11T22:00:00.000Z', to: '2026-10-18T21:59:59.999Z' } }))
})

it('shows an unavailable read as an error and allows a fresh retry', async () => {
  mocks.read.mockRejectedValueOnce(new Error('Calendar access unavailable'))
  render(<MobileCalendarPage />)
  await act(async () => {})
  expect(screen.getByText('Calendar access unavailable')).toBeTruthy()
  expect(screen.queryByText('No appointments for this day.')).toBeNull()
  mocks.read.mockResolvedValueOnce({ appointments: [] })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await act(async () => {})
  expect(screen.getByText('No appointments for this day.')).toBeTruthy()
})

it('hides old appointments during a workspace switch and ignores a late response from the previous scope', async () => {
  let resolveOld
  mocks.read.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
  const { rerender } = render(<MobileCalendarPage />)
  mocks.workspace = { ...mocks.workspace, currentWorkspace: { id: 'org-two' } }
  mocks.organisation = { organisation: { id: 'org-two' }, loading: false }
  mocks.read.mockResolvedValueOnce({ appointments: [{ ...appointment, clientName: 'New workspace client' }] })
  rerender(<MobileCalendarPage />)
  expect(screen.queryByText('Saved client')).toBeNull()
  await act(async () => {})
  expect(screen.getByText('New workspace client')).toBeTruthy()
  await act(async () => resolveOld({ appointments: [appointment] }))
  expect(screen.queryByText('Saved client')).toBeNull()
  expect(screen.getByText('New workspace client')).toBeTruthy()
})

it('shows a chronological agenda with a truthful count and SAST times', async () => {
  mocks.read.mockResolvedValueOnce({ appointments: [
    { ...appointment, id: 'later', dateTime: '2026-10-06T13:00:00Z', clientName: 'Later client', assignedName: 'Alex' },
    appointment,
  ] })
  render(<MobileCalendarPage />)
  await act(async () => {})
  const entries = within(screen.getByRole('list', { name: 'Daily schedule' })).getAllByRole('listitem')
  expect(within(entries[0]).getByText('Saved client')).toBeTruthy()
  expect(within(entries[0]).getByText('10:00')).toBeTruthy()
  expect(within(entries[1]).getByText('Later client')).toBeTruthy()
  expect(within(entries[1]).getByText('15:00')).toBeTruthy()
  expect(within(entries[1]).getByText('Alex')).toBeTruthy()
  expect(screen.getByText('2 appointments')).toBeTruthy()
})

it('jumps across months and returns to today with the correct selected week', async () => {
  render(<MobileCalendarPage />)
  await act(async () => {})
  fireEvent.click(screen.getByLabelText('Choose another date'))
  fireEvent.change(screen.getByLabelText('Calendar date'), { target: { value: '2026-11-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Show date' }))
  await act(async () => {})
  expect(screen.getByRole('button', { name: 'Sunday, 01 November' }).getAttribute('aria-pressed')).toBe('true')
  expect(mocks.read).toHaveBeenLastCalledWith(expect.objectContaining({ dateRange: { from: '2026-10-25T22:00:00.000Z', to: '2026-11-01T21:59:59.999Z' } }))
  expect(screen.getByLabelText('Choose another date').closest('details').open).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Today' }))
  await act(async () => {})
  expect(screen.getByRole('button', { name: 'Tuesday, 06 October' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: 'Tuesday, 06 October' }).getAttribute('aria-current')).toBe('date')
})


it('retains the last verified week after a failed background refresh and retries independently', async () => {
  render(<MobileCalendarPage />)
  await act(async () => {})
  expect(screen.getByText('Saved client')).toBeTruthy()
  mocks.read.mockRejectedValueOnce(new Error('Disconnected'))
  fireEvent(window, new Event('itg:agency-crm-updated'))
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 120)) })
  expect(screen.getByText('Disconnected')).toBeTruthy()
  expect(screen.getByText('Saved client')).toBeTruthy()
  mocks.read.mockResolvedValueOnce({ appointments: [] })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await act(async () => {})
  expect(screen.queryByText('Saved client')).toBeNull()
  expect(screen.getByText('No appointments for this day.')).toBeTruthy()
})

it('clears a previous organisation snapshot when the workspace uses an organisation ID alias', async () => {
  mocks.organisation = { organisation: null, loading: false }
  mocks.workspace = { ...mocks.workspace, currentWorkspace: { organisationId: 'first-org' } }
  const { rerender } = render(<MobileCalendarPage />)
  await act(async () => {})
  expect(screen.getByText('Saved client')).toBeTruthy()
  mocks.workspace = { ...mocks.workspace, currentWorkspace: { organisationId: 'second-org' } }
  mocks.read.mockRejectedValueOnce(new Error('No access in new organisation'))
  rerender(<MobileCalendarPage />)
  expect(screen.queryByText('Saved client')).toBeNull()
  await act(async () => {})
  expect(screen.getByText('No access in new organisation')).toBeTruthy()
  expect(screen.queryByText('Saved client')).toBeNull()
})
