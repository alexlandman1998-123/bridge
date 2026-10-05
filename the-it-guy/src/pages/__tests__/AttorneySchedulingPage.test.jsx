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
afterEach(cleanup)
beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue(data)
  mocks.resources.mockReset().mockResolvedValue([])
  mocks.liveRefresh.mockReset()
})

describe('Attorney calendar background reconciliation', () => {
  it('shows the confirmed save immediately and retains calendar state when refresh fails', async () => {
    const refresh = deferred()
    mocks.load.mockResolvedValueOnce(data).mockReturnValueOnce(refresh.promise)
    render(<MemoryRouter><AttorneySchedulingPage /></MemoryRouter>)
    await screen.findByRole('button', { name: 'Week' })
    expect(mocks.resources).toHaveBeenCalledWith('agency-1', { includeInactive: false })
    expect(mocks.resources).toHaveBeenCalledWith('firm-org-1', { includeInactive: false })
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

  it('ignores an older refresh that resolves after a newer snapshot', async () => {
    const older = deferred()
    const newer = deferred()
    mocks.load.mockResolvedValueOnce(data).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    render(<MemoryRouter><AttorneySchedulingPage /></MemoryRouter>)
    await screen.findByRole('button', { name: 'Week' })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh fixture' }))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh fixture' }))
    await act(async () => { newer.resolve({ ...data, appointmentQueue: [{ id: 'saved-1', status: 'Confirmed', assignedAttorneyName: 'Attorney A' }] }) })
    await act(async () => { older.resolve(data) })
    expect(screen.getByText('saved-1:Confirmed:Attorney A')).toBeTruthy()
  })
})
