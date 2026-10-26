// @vitest-environment jsdom
import React, { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ load: vi.fn(), resources: vi.fn(), liveRefresh: vi.fn() }))
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ role: 'attorney', profile: { id: 'user-1' }, workspace: { type: 'attorney_firm', id: 'firm-1' } }) }))
vi.mock('../../hooks/useAttorneyPermissions', () => ({ default: () => ({ loading: false }) }))
vi.mock('../../hooks/useAttorneyDashboardLiveRefresh', () => ({ default: mocks.liveRefresh }))
vi.mock('../../lib/agencyPipelineService', () => ({ listAppointmentResourcesAsync: mocks.resources }))
vi.mock('../../services/attorneyOperations', async importOriginal => ({ ...await importOriginal(), getAttorneyOperationalWorkspaceData: mocks.load }))
vi.mock('../../components/attorney/scheduling/AttorneySchedulingWorkspace', () => ({
  default: function TestWorkspace({ appointmentRows, onWorkspaceChanged }) {
    const [view, setView] = useState('Week')
    return <div>
      <button onClick={() => setView('Month')}>{view}</button>
      <button onClick={() => onWorkspaceChanged({ savedAppointment: {
        appointmentId: 'saved-1', transactionId: 'matter-1',
        appointment: { appointment_id: 'saved-1', transaction_id: 'matter-1', organisation_id: 'agency-1', appointment_type: 'transfer_signing', status: 'Pending Confirmation' },
        participants: [{ name: 'Buyer' }],
      } })}>Save fixture</button>
      <button onClick={() => onWorkspaceChanged()}>Refresh fixture</button>
      <p>{appointmentRows.map(row => `${row.id}:${row.status}:${row.assignedAttorneyName}`).join('|')}</p>
    </div>
  },
}))

import AttorneySchedulingPage from '../AttorneySchedulingPage'

const data = {
  firm: { id: 'firm-1', organisationId: 'firm-org-1' }, currentUser: { id: 'user-1' },
  permissions: { can_manage_signing_appointments: true }, appointmentQueue: [],
  matterQueue: [{ matterId: 'matter-1', organisationId: 'agency-1', assignedAttorneyName: 'Attorney A' }],
}
function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue(data)
  mocks.resources.mockReset().mockResolvedValue([])
  mocks.liveRefresh.mockReset()
})

describe('Attorney calendar background reconciliation', () => {
  it('keeps automatic refresh bursts behind outstanding boardroom reads', async () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    render(<MemoryRouter><AttorneySchedulingPage /></MemoryRouter>)
    await act(async () => {})
    const resources = deferred()
    mocks.resources.mockReturnValue(resources.promise)
    await act(async () => vi.advanceTimersByTimeAsync(5000))
    const refresh = () => mocks.liveRefresh.mock.calls.at(-1)[0].onRefresh()
    act(() => { void refresh() })
    await act(async () => {})
    expect(mocks.load).toHaveBeenCalledTimes(2)
    for (let n = 0; n < 20; n++) {
      act(() => { void refresh() })
      await act(async () => vi.advanceTimersByTimeAsync(150))
    }
    expect(mocks.load).toHaveBeenCalledTimes(2)
    await act(async () => resources.resolve([]))
    await act(async () => vi.advanceTimersByTimeAsync(5000))
    expect(mocks.load).toHaveBeenCalledTimes(3)
  })

  it('shows the confirmed save immediately and retains calendar state when refresh fails', async () => {
    const refresh = deferred()
    mocks.load.mockResolvedValueOnce(data).mockReturnValueOnce(refresh.promise)
    render(<MemoryRouter><AttorneySchedulingPage /></MemoryRouter>)
    await screen.findByRole('button', { name: 'Week' })
    expect(mocks.resources).toHaveBeenCalledWith('agency-1', expect.objectContaining({ includeInactive: false, signal: expect.any(AbortSignal) }))
    expect(mocks.resources).toHaveBeenCalledWith('firm-org-1', expect.objectContaining({ includeInactive: false, signal: expect.any(AbortSignal) }))
    expect(mocks.resources).not.toHaveBeenCalledWith('firm-1', expect.anything())
    expect(mocks.liveRefresh).toHaveBeenLastCalledWith(expect.objectContaining({ firmId: 'firm-1', enabled: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Week' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save fixture' }))
    expect(screen.getByText('saved-1:Pending Confirmation:Attorney A')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Month' })).toBeTruthy()
    expect(screen.queryByText('Loading attorney scheduling workspace…')).toBeNull()
    await act(async () => { refresh.reject(new Error('Network unavailable')) })
    expect(screen.getByText('Network unavailable')).toBeTruthy()
    expect(screen.getByText('saved-1:Pending Confirmation:Attorney A')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Month' })).toBeTruthy()
  })

  it('queues a second refresh behind the complete active workspace read', async () => {
    const older = deferred()
    const newer = deferred()
    mocks.load.mockResolvedValueOnce(data).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    render(<MemoryRouter><AttorneySchedulingPage /></MemoryRouter>)
    await screen.findByRole('button', { name: 'Week' })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh fixture' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Refresh fixture' }))
    await act(async () => {})
    expect(mocks.load).toHaveBeenCalledTimes(2)
    await act(async () => { older.resolve(data) })
    expect(mocks.load).toHaveBeenCalledTimes(3)
    await act(async () => { newer.resolve({ ...data, appointmentQueue: [{ id: 'saved-1', status: 'Confirmed', assignedAttorneyName: 'Attorney A' }] }) })
    expect(screen.getByText('saved-1:Confirmed:Attorney A')).toBeTruthy()
  })
})
