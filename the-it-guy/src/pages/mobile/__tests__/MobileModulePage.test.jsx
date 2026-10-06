// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileModulePage from '../MobileModulePage.jsx'

const mocks = vi.hoisted(() => ({
  workspace: { role: 'agent', profile: { id: 'agent-one' }, currentWorkspace: { id: 'org-one' } },
  organisation: { organisation: { id: 'org-one' } },
  dashboard: vi.fn(),
  fallback: vi.fn(),
  cached: vi.fn(),
  leads: vi.fn(),
}))

vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => mocks.organisation }))
vi.mock('../../../services/mobileDashboardService', () => ({
  getCachedMobileDashboardSnapshot: mocks.cached,
  getMobileDashboardSnapshotAsync: mocks.dashboard,
  getMobileDashboardSnapshot: mocks.fallback,
}))
vi.mock('../../../services/agentLeadWorkspaceService', () => ({ listAgentLeadWorkspaceRows: mocks.leads }))
vi.mock('../../../services/mobileProductivityService', () => ({ getOfflineDrafts: () => [] }))
vi.mock('../../../components/mobile-shell/MobileCreateSheet', () => ({ default: () => null, MobileDraftCard: () => null }))

const snapshot = { transactions: [{ id: 'tx-one', title: '18 Oak Avenue', to: '/mobile/transaction/tx-one' }] }
const lead = { id: 'lead-one', name: 'Sarah Williams', enquiredPropertyAddress: '18 Oak Avenue', source: 'Property24' }

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function LeadDetail() {
  const location = useLocation()
  return <h1>Buyer journey: {location.state?.mobileWorkspaceItem?.name}</h1>
}

function renderModules() {
  return render(
    <MemoryRouter initialEntries={['/mobile/transactions']}>
      <Link to="/mobile/transactions">Go to Transactions</Link>
      <Link to="/mobile/leads">Go to Leads</Link>
      <Routes>
        <Route path="/mobile/transactions" element={<MobileModulePage moduleKey="transactions" />} />
        <Route path="/mobile/leads" element={<MobileModulePage moduleKey="leads" />} />
        <Route path="/mobile/lead/:id" element={<LeadDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.workspace.role = 'agent'
  mocks.dashboard.mockResolvedValue(snapshot)
  mocks.fallback.mockReturnValue(snapshot)
  mocks.cached.mockReturnValue(null)
})
afterEach(cleanup)

it('loads saved leads after Transactions without crashing before the lead request starts, then opens the buyer journey', async () => {
  const request = deferred()
  mocks.leads.mockReturnValue(request.promise)
  renderModules()
  await screen.findByRole('heading', { name: 'Transactions' })
  fireEvent.click(screen.getByRole('link', { name: 'Go to Leads' }))
  expect(screen.getByLabelText('Loading Leads')).toBeTruthy()
  expect(mocks.leads).toHaveBeenCalledWith({ organisationId: 'org-one', actor: expect.objectContaining({ id: 'agent-one', role: 'agent' }) })
  await act(async () => request.resolve({ rows: [lead] }))
  fireEvent.click(screen.getByRole('button', { name: /Sarah Williams.*Open buyer journey/ }))
  expect(screen.getByRole('heading', { name: 'Buyer journey: Sarah Williams' })).toBeTruthy()
})

it('shows a valid empty state after a transaction fallback and repeated navigation', async () => {
  mocks.dashboard.mockRejectedValue(new Error('Transactions temporarily unavailable'))
  mocks.leads.mockResolvedValue({ rows: [] })
  renderModules()
  await screen.findByRole('heading', { name: 'Transactions' })
  fireEvent.click(screen.getByRole('link', { name: 'Go to Leads' }))
  expect(await screen.findByRole('heading', { name: 'No leads yet.' })).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'Go to Transactions' }))
  await screen.findByRole('heading', { name: 'Transactions' })
  fireEvent.click(screen.getByRole('link', { name: 'Go to Leads' }))
  expect(await screen.findByRole('heading', { name: 'No leads yet.' })).toBeTruthy()
})

it('shows the actual lead request error after leaving Transactions', async () => {
  const request = deferred()
  mocks.leads.mockReturnValue(request.promise)
  renderModules()
  await screen.findByRole('heading', { name: 'Transactions' })
  fireEvent.click(screen.getByRole('link', { name: 'Go to Leads' }))
  await act(async () => request.reject(new Error('Lead access could not be verified.')))
  expect(screen.getByText('Lead access could not be verified.')).toBeTruthy()
  expect(screen.queryByText('No leads yet.')).toBeNull()
})

it('can open Leads after a developer transaction error and handles an absent row payload', async () => {
  mocks.workspace.role = 'developer'
  mocks.dashboard.mockRejectedValue(new Error('Developer transactions unavailable'))
  mocks.leads.mockResolvedValue(undefined)
  renderModules()
  await screen.findByText('Developer transactions unavailable')
  fireEvent.click(screen.getByRole('link', { name: 'Go to Leads' }))
  expect(await screen.findByRole('heading', { name: 'No leads yet.' })).toBeTruthy()
  expect(screen.queryByText('Developer transactions unavailable')).toBeNull()
})

it('shows recently loaded transactions immediately while the asynchronous read is pending', () => {
  mocks.cached.mockReturnValue(snapshot)
  mocks.dashboard.mockReturnValue(new Promise(() => {}))
  renderModules()
  expect(screen.getByRole('heading', { name: 'Transactions' })).toBeTruthy()
  expect(screen.getByText('18 Oak Avenue')).toBeTruthy()
  expect(screen.queryByLabelText('Loading Transactions')).toBeNull()
})
