// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  load: vi.fn(),
  workspace: {
    role: 'agent',
    workspace: { id: 'revo' },
    currentWorkspace: { id: 'revo', organisationId: 'revo', type: 'agency' },
    profile: { id: 'agent', email: 'agent@example.test' },
    activeMemberships: [],
  },
}))
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => api.workspace }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: null }))
vi.mock('../../lib/transactionsListApi', () => ({
  fetchTransactionsByParticipantSummary: api.load,
  fetchTransactionsListSummary: api.load,
  fetchUnitsDataSummary: api.load,
  fetchDevelopmentOptions: vi.fn().mockResolvedValue([]),
  enrichRowsWithBondIntakeContext: vi.fn(),
  deleteTransactionEverywhere: vi.fn(),
  invalidateTransactionsListCache: vi.fn(),
  prefetchUnitWorkspaceShell: vi.fn(),
  saveDeveloperTransactionWorkspace: vi.fn(),
}))
vi.mock('../../routes/transactionsRouteLoader', () => ({
  loadAgentTransactionsTableModule: () => Promise.resolve({
    default: ({ rows }) => <section aria-label="Transaction results">{rows.length} saved transactions</section>,
  }),
}))
import Units from '../Units'

let resolveRows
let rejectRows
beforeEach(() => {
  vi.clearAllMocks()
  const pending = new Promise((resolve, reject) => { resolveRows = resolve; rejectRows = reject })
  api.load.mockReturnValue(pending)
})
afterEach(cleanup)

function open() {
  render(<MemoryRouter initialEntries={['/transactions']}><Units /></MemoryRouter>)
}

it('keeps the Transactions heading and busy view visible until a cold data request completes', async () => {
  open()
  expect(screen.getByRole('heading', { name: 'Transactions' })).toBeTruthy()
  expect(screen.getByLabelText('Loading transactions').getAttribute('aria-busy')).toBe('true')
  expect(api.load).toHaveBeenCalled()
  await act(async () => resolveRows([{ transaction: { id: 'deal', stage: 'OTP Signed', is_active: true }, unit: { id: 'unit' }, buyer: {} }]))
  expect(await screen.findByLabelText('Transaction results')).toHaveProperty('textContent', '1 saved transactions')
  expect(screen.queryByLabelText('Loading transactions')).toBeNull()
})

it('finishes loading an empty workspace instead of leaving the loading view stuck', async () => {
  open()
  await act(async () => resolveRows([]))
  expect(await screen.findByLabelText('Transaction results')).toHaveProperty('textContent', '0 saved transactions')
  expect(screen.queryByLabelText('Loading transactions')).toBeNull()
})

it('replaces the cold loading view with the actual error if the request fails', async () => {
  open()
  await act(async () => rejectRows(new Error('Transactions could not be retrieved')))
  expect(await screen.findByText('Transactions could not be retrieved')).toBeTruthy()
  expect(screen.queryByLabelText('Loading transactions')).toBeNull()
  expect(screen.queryByLabelText('Transaction results')).toBeNull()
})
