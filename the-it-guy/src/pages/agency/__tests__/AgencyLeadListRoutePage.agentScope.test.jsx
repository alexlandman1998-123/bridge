// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import AgencyLeadListRoutePage from '../AgencyLeadListRoutePage'
const mocks = vi.hoisted(() => ({ list: vi.fn(), metrics: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), audit: vi.fn(), directory: vi.fn(), preload: vi.fn() }))
const org = '00000000-0000-4000-8000-000000000010'
const actorId = '00000000-0000-4000-8000-000000000011'
const agent = { userId: '00000000-0000-4000-8000-000000000012', organisationUserId: '00000000-0000-4000-8000-000000000013', organisationId: org, name: 'Kevin Croft', email: 'agent@example.test' }
const workspace = { role: 'agent', profile: { id: actorId, fullName: 'Manager', email: 'manager@example.test' }, currentWorkspace: { organisationId: org }, currentMembership: { organisationId: org, role: 'principal' } }
vi.mock('../../../context/WorkspaceContextBase', () => ({ useWorkspace: () => workspace }))
vi.mock('../agencyLeadListReadRepository', () => ({ listAgencyLeadListRecords: mocks.list, listAgencyLeadLandingMetrics: mocks.metrics, invalidateAgencyLeadListCache: vi.fn(), preloadAgencyLeadCoreRecord: mocks.preload }))
vi.mock('../../../lib/settingsApi', () => ({ listOrganisationUsersForWorkspace: mocks.directory }))
vi.mock('../../../lib/agencyCrmRepository', () => ({ createAgencyCrmLeadRecord: mocks.create, updateAgencyCrmLeadRecord: mocks.update, deleteAgencyCrmLeadRecord: mocks.remove, createAgencyCrmLeadActivity: mocks.audit }))
vi.mock('../../../services/privateListingService', () => ({ getOrganisationPrivateListings: vi.fn(async () => []) }))
vi.mock('../../../routes/leadsRouteLoader', () => ({ preloadAgencyLeadWorkspaceRoute: vi.fn() }))
vi.mock('../../../services/observability/sellerLeadsPerformanceBaseline', () => ({ createSellerLeadsPerformanceBaseline: () => ({ recordCheckpoint: vi.fn() }) }))
const buyer = { leadId: 'buyer-1', organisationId: org, contactId: 'contact-1', leadCategory: 'buyer', assignedUserId: agent.userId, assignedAgentEmail: agent.email, leadSource: 'Property24', propertyInterest: 'Montana home', stage: 'New Lead', createdAt: '2026-10-08T10:00:00Z' }
const seller = { ...buyer, leadId: 'seller-1', contactId: 'contact-2', leadCategory: 'seller', leadSource: 'Website', sellerPropertyAddress: 'Rose Acres', stage: 'Contacted' }
const archived = { ...buyer, leadId: 'archived-1', contactId: 'contact-3', stage: 'Archived', status: 'Archived' }
const other = { ...buyer, leadId: 'other-1', contactId: 'other-contact', assignedUserId: actorId, assignedAgentEmail: 'other@example.test' }
const contacts = [['contact-1', 'Jane', 'Buyer'], ['contact-2', 'Sam', 'Seller'], ['contact-3', 'Alex', 'Past'], ['other-contact', 'Other', 'Agent Lead']].map(([contactId, firstName, lastName]) => ({ contactId, firstName, lastName, phone: '0721234567' }))
let leads
beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mocks.preload.mockResolvedValue(null)
  leads = [buyer, seller, archived, other]
  mocks.list.mockImplementation(async () => ({ leads, contacts, totalCount: 3 }))
  mocks.metrics.mockImplementation(async () => ({ leads }))
  mocks.audit.mockResolvedValue({})
  mocks.update.mockResolvedValue({})
  mocks.remove.mockResolvedValue({})
  mocks.directory.mockResolvedValue([])
  mocks.create.mockImplementation(async (_, payload) => ({ leadId: 'created-1', contactId: 'new-contact', organisationId: org, assignedUserId: payload.assignedUserId, assignedAgentId: payload.assignedAgent.id, assignedAgentEmail: payload.assignedAgent.email, leadCategory: payload.leadCategory, leadSource: payload.leadSource, stage: 'New Lead', createdAt: new Date().toISOString() }))
})
afterEach(cleanup)
function show(selected = agent) {
  return render(<MemoryRouter><Routes><Route path="/" element={<AgencyLeadListRoutePage scopedAgent={selected} />} /><Route path="/pipeline/leads/:id" element={<p>Full lead workspace</p>} /></Routes></MemoryRouter>)
}
it('uses the normal table, categories and filters with a locked agent scope', async () => {
  show()
  await screen.findAllByText('Jane Buyer')
  expect(screen.getByTestId('agency-lead-list-page')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Filters' }).getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
  expect(screen.queryByText('Other Agent Lead')).toBeNull()
  expect(screen.queryByText('All Agents')).toBeNull()
  expect(mocks.list).toHaveBeenCalledWith(org, expect.objectContaining({ scopedAgent: agent, pageSize: 25 }))
  expect(mocks.metrics).toHaveBeenCalledWith(org, expect.objectContaining({ scopedAgent: agent }))
  expect(mocks.directory).not.toHaveBeenCalled()
  fireEvent.change(screen.getByPlaceholderText('Search leads, addresses or names...'), { target: { value: 'not here' } })
  await screen.findAllByText('No leads match these filters')
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
  await screen.findAllByText('Jane Buyer')
  fireEvent.click(screen.getByRole('tab', { name: /Seller Leads/ }))
  await screen.findAllByText('Sam Seller')
  expect(screen.queryByText('Jane Buyer')).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: /Archived/ }))
  await screen.findAllByText('Alex Past')
  expect(screen.queryByRole('button', { name: 'Add Buyer Lead' })).toBeNull()
})
it('opens the full workspace and preloads the selected lead', async () => {
  show()
  await screen.findAllByText('Jane Buyer')
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  await screen.findByText('Full lead workspace')
  expect(mocks.preload).toHaveBeenCalledWith(org, 'buyer-1')
})
it('creates from Kanban for the selected agent while recording the real manager as actor', async () => {
  show()
  await screen.findAllByText('Jane Buyer')
  fireEvent.click(screen.getByRole('button', { name: 'Kanban' }))
  fireEvent.click(screen.getByRole('button', { name: 'Create Buyer Lead' }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).queryByText('Assigned agent')).toBeNull()
  for (const [label, value] of [['First name', 'New'], ['Last name', 'Buyer'], ['Mobile', '0721234567'], ['Email', 'new@example.test']]) fireEvent.change(within(dialog).getByLabelText(label), { target: { value } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create Lead' }))
  await waitFor(() => expect(mocks.create).toHaveBeenCalled())
  expect(mocks.create).toHaveBeenCalledWith(org, expect.objectContaining({ assignedUserId: agent.userId, assignedAgent: expect.objectContaining({ id: agent.userId, name: agent.name }), createdBy: actorId }), { actor: expect.objectContaining({ id: actorId }) })
})
it('archives and deletes through the existing confirmation dialogs', async () => {
  show()
  await screen.findAllByText('Jane Buyer')
  fireEvent.click(screen.getAllByRole('button', { name: 'More actions for Jane Buyer' })[0])
  fireEvent.click(screen.getAllByRole('menuitem', { name: 'Archive Lead' })[0])
  expect(mocks.update).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Archive lead' }))
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(org, 'buyer-1', { stage: 'Archived', status: 'Archived' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  fireEvent.click(screen.getAllByRole('button', { name: 'More actions for Jane Buyer' })[0])
  fireEvent.click(screen.getAllByRole('menuitem', { name: 'Delete Lead' })[0])
  expect(mocks.remove).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete lead' }))
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(org, 'buyer-1'))
})
it('rejects an agent from another organisation without reading or writing their leads', async () => {
  show({ ...agent, organisationId: '00000000-0000-4000-8000-000000000099' })
  await screen.findByText(/This agent is not in the current organisation/)
  expect(mocks.list).not.toHaveBeenCalled()
  expect(mocks.metrics).not.toHaveBeenCalled()
  expect(mocks.create).not.toHaveBeenCalled()
})
it('keeps the ordinary Leads screen available with its normal agent filter', async () => {
  show(null)
  await screen.findAllByText('Other Agent Lead')
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
  expect(screen.getByText('All Agents')).toBeTruthy()
  expect(mocks.list).toHaveBeenCalledWith(org, expect.objectContaining({ scopedAgent: null }))
})
it('keeps the scope when paging and refreshing the allocated leads', async () => {
  mocks.list.mockImplementation(async (_, options) => ({ leads: [{ ...buyer, leadId: `page-${options.page}`, name: `Page ${options.page + 1} buyer` }], contacts: [], totalCount: 26 }))
  show()
  await screen.findAllByText('Page 1 buyer')
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  await screen.findAllByText('Page 2 buyer')
  expect(mocks.list).toHaveBeenLastCalledWith(org, expect.objectContaining({ page: 1, scopedAgent: agent }))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(org, expect.objectContaining({ page: 1, forceRefresh: true, scopedAgent: agent })))
})
it('moves an allocated lead using the normal Kanban stage action', async () => {
  show()
  await screen.findAllByText('Jane Buyer')
  fireEvent.click(screen.getByRole('button', { name: 'Kanban' }))
  const column = screen.getByRole('heading', { name: 'Contacted' }).closest('section')
  fireEvent.drop(column, { dataTransfer: { getData: () => 'buyer-1' } })
  await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(org, 'buyer-1', { stage: 'Contacted', status: 'Contacted' }))
  expect(mocks.audit).toHaveBeenCalledWith(org, 'buyer-1', expect.objectContaining({ activityType: 'Stage Change', agent: expect.objectContaining({ id: actorId }) }), { actor: expect.objectContaining({ id: actorId }) })
})
