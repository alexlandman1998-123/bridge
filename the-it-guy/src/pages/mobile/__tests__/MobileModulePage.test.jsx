// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MobileLeadCreateContext } from '../../../components/mobile-shell/mobileLeadCreateContext.js'
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
vi.mock('../../../components/mobile-shell/MobileLeadCreateFlow.jsx', () => ({ default: ({ initialType }) => <div data-testid="lead-create-form" data-lead-type={initialType}>Desktop lead capture</div> }))
vi.mock('../../../components/mobile-shell/MobileCreateSheet', () => ({ default: ({ open, copyOverrides, draftContext }) => open ? <div data-testid="lead-create-form" data-lead-type={draftContext?.leadType}>{copyOverrides?.title}</div> : null, MobileDraftCard: () => null }))

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

it('opens the new-leads view with only the agent’s assigned new leads and can return to all leads', async () => {
  mocks.leads.mockResolvedValue({ rows: [
    { ...lead, stage: 'New Lead', assignedAgentId: 'agent-one' },
    { id: 'other', name: 'Other agent buyer', stage: 'New Lead', assignedAgentId: 'agent-two' },
    { id: 'active', name: 'Contacted buyer', stage: 'Contacted', assignedAgentId: 'agent-one' },
  ] })
  render(<MemoryRouter initialEntries={['/mobile/leads?stage=new&scope=assigned']}><MobileModulePage moduleKey="leads" /></MemoryRouter>)
  await act(async () => {})
  expect(screen.getByRole('heading', { name: 'New leads', level: 1 })).toBeTruthy()
  expect(screen.getByText('Sarah Williams')).toBeTruthy()
  expect(screen.queryByText('Other agent buyer')).toBeNull()
  expect(screen.queryByText('Contacted buyer')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'View all leads' }))
  expect(screen.getByRole('heading', { name: 'Leads', level: 1 })).toBeTruthy()
  expect(screen.getByText('Contacted buyer')).toBeTruthy()
})

it('loads saved leads after Transactions without crashing before the lead request starts, then opens the buyer journey', async () => {
  const request = deferred()
  mocks.leads.mockReturnValue(request.promise)
  renderModules()
  await screen.findByRole('heading', { name: 'Transactions' })
  fireEvent.click(screen.getByRole('link', { name: 'Go to Leads' }))
  expect(screen.getByLabelText('Loading Leads')).toBeTruthy()
  expect(mocks.leads).toHaveBeenCalledWith({ organisationId: 'org-one', actor: expect.objectContaining({ id: 'agent-one', role: 'agent' }) })
  await act(async () => request.resolve({ rows: [lead] }))
  fireEvent.click(screen.getByRole('button', { name: /Sarah Williams.*Open journey/ }))
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

it.each(['buyer', 'seller', 'tenant', 'landlord'])('opens the shared capture flow for a direct %s creation link', async type => {
  mocks.leads.mockResolvedValue({ rows: [] })
  render(<MemoryRouter initialEntries={[`/mobile/leads?create=lead&leadType=${type}`]}><MobileModulePage moduleKey="leads" /></MemoryRouter>)
  expect((await screen.findByTestId('lead-create-form')).getAttribute('data-lead-type')).toBe(type)
})

it('opens the shared popup from the lead header plus without changing pages', async () => {
  mocks.leads.mockResolvedValue({ rows: [lead] })
  const openLeadCreate = vi.fn()
  render(<MemoryRouter initialEntries={['/mobile/leads']}><MobileLeadCreateContext.Provider value={{ openLeadCreate }}><MobileModulePage moduleKey="leads" /></MobileLeadCreateContext.Provider></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Leads', level: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Add lead' }))
  expect(openLeadCreate).toHaveBeenCalledOnce()
  expect(screen.getByText('Sarah Williams')).toBeTruthy()
})
