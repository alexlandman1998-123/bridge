// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), imported: vi.fn() }))
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ role: 'developer', currentWorkspace: { id: 'org' }, can: () => true }) }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true }))
vi.mock('../../domains/developments/portfolioReadApi.js', () => ({ fetchDevelopmentsData: mocks.read }))
vi.mock('../../components/AddDevelopmentModal', async () => {
  mocks.imported()
  const { useState } = await import('react')
  return { default: function Creation({ open, onClose, onCreated }) {
    const [draft, setDraft] = useState('')
    return open ? <section aria-label="Creation workflow"><input aria-label="Development name" value={draft} onChange={event => setDraft(event.target.value)} /><button onClick={onClose}>Close creation</button><button onClick={onCreated}>Save development</button></section> : null
  } }
})
import Developments from '../Developments.jsx'

afterEach(cleanup)

it('reads the portfolio without importing creation, then opens, preserves and saves the requested workflow', async () => {
  mocks.read.mockResolvedValue({ rows: [], developments: [], metrics: { totalDevelopments: 0, totalUnits: 0, unitsInTransfer: 0, unitsRegistered: 0 } })
  render(<MemoryRouter><Developments /></MemoryRouter>)
  await waitFor(() => expect(mocks.read).toHaveBeenCalledWith({ organisationId: 'org' }))
  const create = await screen.findAllByRole('button', { name: 'Add Development' })
  expect(mocks.imported).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('Creation workflow')).toBeNull()
  fireEvent.click(create[0])
  fireEvent.change(await screen.findByLabelText('Development name'), { target: { value: 'New development draft' } })
  expect(mocks.imported).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Close creation' }))
  expect(screen.queryByLabelText('Creation workflow')).toBeNull()
  fireEvent.click(screen.getAllByRole('button', { name: 'Add Development' })[0])
  expect((await screen.findByLabelText('Development name')).value).toBe('New development draft')
  mocks.read.mockClear()
  fireEvent.click(screen.getByRole('button', { name: 'Save development' }))
  await waitFor(() => expect(mocks.read).toHaveBeenCalled())
  expect(mocks.imported).toHaveBeenCalledTimes(1)
})
