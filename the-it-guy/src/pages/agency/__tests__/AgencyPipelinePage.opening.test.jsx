// @vitest-environment jsdom
import { Profiler } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => {
  const org = '10000000-0000-4000-8000-000000000001'
  const user = '20000000-0000-4000-8000-000000000001'
  const profile = { id: user, fullName: 'Calendar Agent', email: 'calendar@example.test' }
  const workspace = { id: org, organisationId: org, name: 'Calendar Agency', type: 'agency' }
  const channel = { on: vi.fn(), subscribe: vi.fn() }
  channel.on.mockReturnValue(channel)
  channel.subscribe.mockReturnValue(channel)
  const query = { then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve), maybeSingle: async () => ({ data: null, error: null }) }
  for (const method of ['select', 'insert', 'eq', 'in', 'is', 'order', 'limit', 'gte', 'lt', 'range']) query[method] = () => query
  return {
    org, profile, workspace, channel,
    context: { role: 'agent', profile, currentWorkspace: workspace, currentMembership: { organisationId: org, role: 'owner' }, workspace },
    scoped: vi.fn(),
    singleListing: vi.fn(async id => ({ id, title: 'Linked property' })),
    users: vi.fn(async () => [{ id: user, userId: user, status: 'active', fullName: 'Calendar Agent' }]),
    tableReads: [],
    crm: vi.fn(async () => ({ leads: [], contacts: [], leadActivities: [], tasks: [] })),
    marketing: vi.fn(), timeRead: vi.fn(), timeChange: vi.fn(), createLead: vi.fn(), directory: vi.fn(async () => ({ clients: [] })),
    appointments: vi.fn(async () => []), listings: vi.fn(async () => []), inbound: vi.fn(async () => []),
    supabase: { from: table => {
      fixture.tableReads.push(table)
      const selected = { ...query }
      for (const method of ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'gte', 'lt', 'range']) selected[method] = () => selected
      selected.maybeSingle = async () => ({ data: table === 'leads' ? {
        lead_id: '30000000-0000-4000-8000-000000000001', organisation_id: org, contact_id: '40000000-0000-4000-8000-000000000001',
        lead_category: 'buyer', assigned_agent_id: user, listing_id: '50000000-0000-4000-8000-000000000001', stage: 'New', notes: '', created_at: '2026-11-09T08:00:00Z', updated_at: '2026-11-09T08:00:00Z'
      } : table === 'contacts' ? { contact_id: '40000000-0000-4000-8000-000000000001', organisation_id: org, first_name: 'Scoped', last_name: 'Buyer' } : null, error: null })
      return selected
    }, rpc: async () => ({ data: [], error: null }), channel: () => channel, removeChannel: async () => {}, auth: { getUser: async () => ({ data: { user: { id: user } }, error: null }) } },
  }
})
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => fixture.context }))
vi.mock('../../../core/clients/agentClientDirectory', () => ({ loadAgentClientDirectory: fixture.directory }))
vi.mock('../../../context/OrganisationContext', () => ({ useOrganisation: () => ({ branding: {}, organisation: fixture.workspace }) }))
vi.mock('../../../lib/supabaseClient', async (actual) => ({ ...await actual(), isSupabaseConfigured: true, supabase: fixture.supabase }))
vi.mock('../../../lib/agencyCrmRepository', async (actual) => { const module = await actual(); return { ...module, listAgencyCrmLeadContacts: fixture.crm, fetchAgencyCrmLeadWorkspace: (...args) => { fixture.scoped(...args); return module.fetchAgencyCrmLeadWorkspace(...args) }, createAgencyCrmLeadRecord: fixture.createLead } })
vi.mock('../../../lib/agencyPipelineService', async (actual) => ({ ...await actual(), listAppointmentsAsync: fixture.appointments }))
vi.mock('../../../services/workspaceCalendarService', () => ({ loadWorkspaceMarketingCalendar: fixture.marketing }))
vi.mock('../../../services/calendarTimeChangeService', () => ({ readCalendarTimeChange: fixture.timeRead, changeCalendarTime: fixture.timeChange }))
vi.mock('../../../services/privateListingService', async (actual) => ({ ...await actual(), getOrganisationPrivateListings: fixture.listings, getPrivateListing: fixture.singleListing }))
vi.mock('../../../services/leadEmailCaptureService', async (actual) => ({ ...await actual(), listInboundLeadEmails: fixture.inbound }))
vi.mock('../../../lib/settingsApi', async (actual) => ({
  ...await actual(),
  listOrganisationUsers: fixture.users,
  fetchOrganisationSettings: async () => ({ organisation: fixture.workspace, membershipRole: 'owner' }),
}))
vi.mock('../../../lib/canvassingRepository', async (actual) => ({ ...await actual(), listCanvassingWorkspace: async () => ({ prospects: [], activities: [] }) }))
import AgencyPipelinePage from '../AgencyPipelinePage'

beforeEach(() => { fixture.marketing.mockReset().mockResolvedValue({ items: [], warnings: [] }); fixture.directory.mockResolvedValue({ clients: [] }); fixture.timeRead.mockImplementation(async appointmentId => ({verified:true,appointmentId,revision:1,supported:true,canManage:true,canRequest:true,selfParticipantId:'agent',active:null,history:[],events:[]})); fixture.timeChange.mockReset(); fixture.crm.mockResolvedValue({ leads: [], contacts: [], leadActivities: [], tasks: [] }); fixture.appointments.mockResolvedValue([]) })
afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})


function Workspace() {
  const navigate = useNavigate()
  return <><button onClick={() => navigate('?tab=activity')}>Open activity tab</button><AgencyPipelinePage initialViewMode="leads" /></>
}
it('opens and refreshes only the current lead, then loads history on its tab', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-09T08:00:00Z'))
  fixture.tableReads = []
  let renderCount = 0
  render(<Profiler id="lead-opening" onRender={() => { if (++renderCount > 100) throw new Error('Lead opening entered a render loop') }}><MemoryRouter initialEntries={['/pipeline/leads/30000000-0000-4000-8000-000000000001']}><Routes><Route path="/pipeline/leads/:leadId" element={<Workspace />} /></Routes></MemoryRouter></Profiler>)
  await waitFor(() => expect(fixture.scoped).toHaveBeenCalled(), { timeout: 4000 })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1500)) })
  expect(fixture.scoped).toHaveBeenCalledWith(fixture.org, '30000000-0000-4000-8000-000000000001', { includeRelatedRecords: true, relatedLimit: 3 })
  expect(fixture.crm).not.toHaveBeenCalled()
  expect(fixture.listings).not.toHaveBeenCalled()
  expect(fixture.inbound).not.toHaveBeenCalled()
  expect(fixture.appointments).not.toHaveBeenCalled()
  expect(fixture.users).not.toHaveBeenCalled()
  expect(fixture.singleListing).not.toHaveBeenCalled()
  const before = fixture.scoped.mock.calls.length
  act(() => window.dispatchEvent(new Event('itg:quick-create-updated')))
  await waitFor(() => expect(fixture.scoped.mock.calls.length).toBeGreaterThan(before))
  expect(fixture.scoped.mock.calls.length).toBeGreaterThan(before)
  expect(fixture.crm).not.toHaveBeenCalled()
  console.info('Lead opening auxiliary tables:', [...new Set(fixture.tableReads)])
  fireEvent.click(screen.getByRole('button', { name: 'Open activity tab' }))
  await waitFor(() => expect(fixture.scoped).toHaveBeenLastCalledWith(fixture.org, '30000000-0000-4000-8000-000000000001', { includeRelatedRecords: true, relatedLimit: null }))
  expect(fixture.scoped).toHaveBeenLastCalledWith(fixture.org, '30000000-0000-4000-8000-000000000001', { includeRelatedRecords: true, relatedLimit: null })
  expect(fixture.crm).not.toHaveBeenCalled()
}, 30000)
