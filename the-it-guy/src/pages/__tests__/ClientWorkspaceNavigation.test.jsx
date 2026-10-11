// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Clients from '../Clients'
import ClientProfile from '../ClientProfile'
import { loadAgentClientDirectory, loadAgentClientProfile } from '../../core/clients/agentClientDirectory'
import { getClientMarketingWorkspace, saveClientMarketingTags } from '../../services/emailCampaignService'
const context = vi.hoisted(() => ({ profile: { id: 'agent' }, role: 'agent', workspace: { id: 'agency', organisationId: 'agency' }, currentMembership: { organisationId: 'agency' } }))
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => context }))
vi.mock('../../context/OrganisationContext', () => ({ useOrganisation: () => ({ organisation: { id: 'agency' } }) }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: null }))
vi.mock('../../core/clients/agentClientDirectory', async original => ({ ...await original(), loadAgentClientDirectory: vi.fn(), loadAgentClientProfile: vi.fn() }))
vi.mock('../../services/observability/agentRoutePerformanceBaseline', () => ({ createAgentRoutePerformanceBaseline: () => ({ recordCheckpoint: vi.fn() }) }))
vi.mock('../../services/emailCampaignService', () => ({ getClientMarketingWorkspace: vi.fn(), getClientAudienceMemberships: vi.fn().mockResolvedValue([]), saveClientMarketingTags: vi.fn(), saveEmailAudience: vi.fn() }))
vi.mock('../../components/clients/ClientAudiences', () => ({ default: () => <p>Client audiences</p> }))
vi.mock('../../components/clients/ClientActivityPanel', () => ({ default: ({ client }) => <section aria-label="Client activity">Activity for {client.identityId}</section> }))
vi.mock('../../components/clients/ClientAttributionPanel', () => ({ default: ({ client }) => <section aria-label="Client sources">Sources for {client.identityId}</section> }))
vi.mock('../../components/clients/ClientCampaignPanel', () => ({ default: ({ client }) => <section aria-label="Client campaigns">Campaigns for {client.identityId}</section> }))
const identityId = '00000000-0000-4000-8000-000000000001'
const client = { id: `client:${identityId}`, identityId, organisationId: 'agency', identityVersion: 1, name: 'Taylor Smith', email: 'taylor@example.test', emails: ['taylor@example.test'], phone: '0821234567', phones: ['0821234567'], typeKeys: ['buyer'], statusKeys: ['active'], typeLabel: 'Buyer', roleLabel: 'Buyer', status: 'active', statusLabel: 'Active', totalTransactions: 0, activeTransactions: 0, completedTransactions: 0, transactions: [], sources: [], sourceLabels: ['Website'], linkedRecords: [], linkedLeadIds: [], linkedTransactionIds: [], searchText: 'Taylor Smith taylor@example.test', canManageIdentity: false }
const path = `/clients/${encodeURIComponent(client.id)}`
function Location() { const location = useLocation(); const navigate = useNavigate(); return <><output aria-label="Current route">{location.pathname}{location.search}</output><button onClick={() => navigate('/clients/client%3Aother')}>Switch client fixture</button></> }
const mount = (url='/clients?view=buyer', state) => render(<MemoryRouter initialEntries={[state ? { pathname: url, state } : url]}><Routes><Route path="/clients" element={<Clients />} /><Route path="/clients/:clientId" element={<ClientProfile />} /></Routes><Location /></MemoryRouter>)
beforeEach(() => {
  localStorage.clear()
  context.profile = { id: 'agent' }
  context.workspace = { id: 'agency', organisationId: 'agency' }
  loadAgentClientDirectory.mockResolvedValue({ clients: [client], filters: { sources: [], assignedAgents: [] } })
  loadAgentClientProfile.mockResolvedValue(undefined)
  getClientMarketingWorkspace.mockResolvedValue({ marketingContact: { id: 'contact', tags: ['launch'] } })
  saveClientMarketingTags.mockImplementation(async ({ tags }) => ({ id: 'contact', tags }))
})
afterEach(() => { cleanup(); vi.clearAllMocks() })
test('client card opens the full workspace, exposes its tabs, and returns to the filtered directory', async () => {
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Open client workspace for Taylor Smith' }))
  await screen.findByRole('heading', { name: 'Taylor Smith', level: 1 })
  expect(screen.getByLabelText('Current route').textContent).toBe(path)
  expect(screen.queryByRole('dialog')).toBeNull()
  for (const tab of ['Overview', 'Transactions', 'Activity', 'Sources', 'Campaigns']) expect(screen.getByRole('tab', { name: tab })).toBeTruthy()
  for (const [tab, region] of [['Activity','Client activity'],['Sources','Client sources'],['Campaigns','Client campaigns']]) {
    fireEvent.click(screen.getByRole('tab', { name: tab }))
    expect(screen.getByRole('region', { name: region }).textContent).toContain(identityId)
  }
  fireEvent.click(screen.getByRole('button', { name: 'Back to Clients' }))
  await screen.findByRole('button', { name: 'Open client workspace for Taylor Smith' })
  expect(screen.getByLabelText('Current route').textContent).toBe('/clients?view=buyer')
})
test('list rows open the client workspace through keyboard activation', async () => {
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'List', exact: true }))
  const row = await screen.findByRole('button', { name: 'Open client workspace for Taylor Smith' })
  expect(row.tagName).toBe('TR')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Taylor' } })
  fireEvent.keyDown(row, { key: 'Enter' })
  await screen.findByRole('heading', { name: 'Taylor Smith', level: 1 })
  expect(screen.getByLabelText('Current route').textContent).toBe(path)
  fireEvent.click(screen.getByRole('button', { name: 'Back to Clients' }))
  const restoredRow = await screen.findByRole('button', { name: 'Open client workspace for Taylor Smith' })
  expect(restoredRow.tagName).toBe('TR')
  expect(screen.getByRole('searchbox').value).toBe('Taylor')
})
test('a direct workspace link keeps tag editing available and preserves email/agency scope', async () => {
  mount(path)
  await screen.findByText('launch')
  expect(screen.queryByText('Client Workspace')).toBeNull()
  expect(screen.queryByText('TS', { exact: true })).toBeNull()
  expect(getClientMarketingWorkspace).toHaveBeenCalledWith({ organisationId: 'agency', email: client.email })
  fireEvent.change(screen.getByLabelText('Add a client tag'), { target: { value: 'Show-Day' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add tag' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save tags' }))
  await screen.findByText('Client tags saved.')
  expect(saveClientMarketingTags).toHaveBeenCalledWith({ organisationId: 'agency', client: expect.objectContaining({ identityId }), tags: ['launch','show-day'] })
})
test('untrusted return paths cannot navigate outside Clients, and inaccessible clients do not open another profile', async () => {
  loadAgentClientProfile.mockResolvedValueOnce(null)
  mount(path, { clientsReturnTo: '//example.test' })
  await screen.findByText('Client not found')
  expect(screen.queryByRole('heading', { name: 'Taylor Smith' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Back to Clients' }))
  expect(screen.getByLabelText('Current route').textContent).toBe('/clients')
})
test('late profile requests from the previous client cannot replace the new workspace', async () => {
  let resolveOld
  loadAgentClientProfile.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValueOnce(null)
  mount(path)
  fireEvent.click(screen.getByRole('button', { name: 'Switch client fixture' }))
  await screen.findByText('Client not found')
  resolveOld({ client, transactions: [] })
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Taylor Smith' })).toBeNull())
})
test('keyboard actions inside a client card do not activate the enclosing workspace link', async () => {
  mount()
  const card = await screen.findByRole('button', { name: 'Open client workspace for Taylor Smith' })
  const menu = within(card).getByRole('button', { name: /actions/i })
  fireEvent.keyDown(menu, { key: 'Enter' })
  fireEvent.click(menu)
  expect(screen.getByLabelText('Current route').textContent).toBe('/clients?view=buyer')
  fireEvent.click(screen.getByRole('button', { name: 'Open workspace', exact: true }))
  await screen.findByRole('heading', { name: 'Taylor Smith', level: 1 })
})

test('the client list is usable while recent activity is still loading', async () => {
  let finishActivity
  const activityPromise = new Promise((resolve) => { finishActivity = resolve })
  loadAgentClientDirectory.mockResolvedValueOnce({ clients: [client], activityPromise, filters: { sources: [], assignedAgents: [] } })
  mount()
  await screen.findByRole('button', { name: 'Open client workspace for Taylor Smith' })
  expect(document.querySelector('[data-performance-core-ready]').getAttribute('data-performance-core-ready')).toBe('true')
  expect(loadAgentClientDirectory).toHaveBeenCalledWith(expect.objectContaining({ deferActivity: true }))
  await act(async () => { finishActivity({ clients: [client], activityWarning: 'Recent activity unavailable' }) })
  await screen.findByText('Recent activity unavailable')
})

test('new context objects with the same identity do not reload the directory', async () => {
  const tree = () => <MemoryRouter><Clients /></MemoryRouter>
  const view = render(tree())
  await screen.findByRole('button', { name: 'Open client workspace for Taylor Smith' })
  context.profile = { ...context.profile }
  context.workspace = { ...context.workspace }
  view.rerender(tree())
  await waitFor(() => expect(loadAgentClientDirectory).toHaveBeenCalledTimes(1))
})

test('a late directory response cannot replace clients from a new workspace', async () => {
  let finishOld
  loadAgentClientDirectory.mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve }))
  const tree = () => <MemoryRouter><Clients /></MemoryRouter>
  const view = render(tree())
  await waitFor(() => expect(loadAgentClientDirectory).toHaveBeenCalledTimes(1))
  context.workspace = { id: 'new-agency' }
  view.rerender(tree())
  await screen.findByRole('button', { name: 'Open client workspace for Taylor Smith' })
  await act(async () => { finishOld({ clients: [{ ...client, name: 'Old workspace client' }], filters: { sources: [], assignedAgents: [] } }) })
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Open client workspace for Old workspace client' })).toBeNull())
  expect(screen.getByRole('button', { name: 'Open client workspace for Taylor Smith' })).toBeTruthy()
})

test('late activity enrichment cannot replace clients from a new workspace', async () => {
  let finishOldActivity
  const activityPromise = new Promise((resolve) => { finishOldActivity = resolve })
  loadAgentClientDirectory.mockResolvedValueOnce({ clients: [client], activityPromise, filters: { sources: [], assignedAgents: [] } })
  const tree = () => <MemoryRouter><Clients /></MemoryRouter>
  const view = render(tree())
  await screen.findByRole('button', { name: 'Open client workspace for Taylor Smith' })
  context.workspace = { id: 'new-agency' }
  view.rerender(tree())
  await waitFor(() => expect(loadAgentClientDirectory).toHaveBeenCalledTimes(2))
  await act(async () => { finishOldActivity({ clients: [{ ...client, name: 'Old activity client' }], activityWarning: 'Old warning' }) })
  await waitFor(() => expect(screen.queryByText('Old warning')).toBeNull())
  expect(screen.queryByRole('button', { name: 'Open client workspace for Old activity client' })).toBeNull()
})
