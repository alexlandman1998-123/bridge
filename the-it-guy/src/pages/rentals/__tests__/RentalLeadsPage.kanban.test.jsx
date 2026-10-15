// @vitest-environment jsdom
// Uses isolated data and mutation doubles; no remote writes.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import RentalLeadsPage from '../RentalLeadsPage.jsx'
import { getRentalLeadPipelineStages } from '../../../services/rentals/rentalLeadPipelineModel.js'

const mocks = vi.hoisted(() => ({ workspace: {}, scope: {}, list: vi.fn(), advance: vi.fn(), create: vi.fn(), outcome: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../services/rentals/rentalWorkspaceScope', () => ({ resolveRentalWorkspaceScope: () => mocks.scope, buildRentalListingQueryOptions: () => ({}) }))
vi.mock('../../../services/rentals/rentalLeadService', () => ({ listRentalLeads: mocks.list, createRentalLead: mocks.create, advanceRentalLead: mocks.advance }))
vi.mock('../../../services/rentals/rentalLeadOutcomeService', () => ({ recordRentalLeadOutcome: mocks.outcome }))
vi.mock('../../../services/rentals/rentalListingDraftService', () => ({ getRentalListingForAgent: vi.fn() }))

const lead = (id, role = 'tenant', stage = 'new', patch = {}) => ({
  id, name: `Diagnostic ${id}`, role, stage, stageLabel: stage, source: 'Manual', focus: `Area ${id}`,
  assignedAgentId: 'agent-a', assignedAgentName: 'Diagnostic Agent', outcome: { status: 'open' },
  createdAt: '2026-10-15T06:00:00Z', updatedAt: '2026-10-15T06:00:00Z', ...patch,
})
const boardCards = () => [...document.querySelectorAll('[data-rental-control="lead-kanban-card"]')]
function dragTo(card, stage) {
  const values = new Map()
  const dataTransfer = { setData: (key, value) => values.set(key, value), getData: key => values.get(key) || '' }
  fireEvent.dragStart(card, { dataTransfer })
  fireEvent.drop(screen.getByRole('region', { name: stage, exact: true }), { dataTransfer })
}
function Harness() {
  return <MemoryRouter initialEntries={['/agent/rentals/pipeline/leads']}><Routes>
    <Route path="/agent/rentals/pipeline/leads" element={<RentalLeadsPage />} />
    <Route path="/agent/rentals/pipeline/leads/:leadId" element={<div>Diagnostic lead workspace<Link to="/agent/rentals/pipeline/leads">Back to rental leads</Link></div>} />
    <Route path="/agent/rentals/pipeline/viewings" element={<p>Viewing scheduler</p>} />
    <Route path="/agent/rentals/pipeline/mandates" element={<p>Mandate workspace</p>} />
  </Routes></MemoryRouter>
}
async function openBoard(rows) {
  mocks.list.mockResolvedValue(rows)
  const rendered = render(<Harness />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Kanban', exact: true }))
  return rendered
}
beforeEach(() => {
  mocks.workspace = { profile: { id: 'agent-a' } }
  mocks.scope = { organisationId: 'org-a', assignedAgentId: 'agent-a', scopeLevel: 'organisation' }
  vi.resetAllMocks()
  window.sessionStorage.clear()
})
afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.restoreAllMocks() })

it('renders all eleven tenant stages and eight landlord stages with every normal card', async () => {
  const tenant = getRentalLeadPipelineStages('tenant').map((stage, i) => lead(`tenant-${i}`, 'tenant', stage))
  const landlord = getRentalLeadPipelineStages('landlord').map((stage, i) => lead(`landlord-${i}`, 'landlord', stage))
  await openBoard([...tenant, ...landlord])
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(11)
  expect(boardCards()).toHaveLength(11)
  fireEvent.click(screen.getByRole('button', { name: /Landlord Leads/ }))
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(8)
  expect(boardCards()).toHaveLength(8)
})

it('applies source, agent, stage and search filters in Kanban and Reset restores cards', async () => {
  await openBoard([lead('one'), lead('two', 'tenant', 'contacted', { source: 'Property24', assignedAgentId: '', assignedAgentName: '' })])
  fireEvent.change(screen.getByRole('combobox', { name: 'Source filter' }), { target: { value: 'Property24' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Agent filter' }), { target: { value: 'unassigned' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Stage filter' }), { target: { value: 'contacted' } })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search rental leads' }), { target: { value: 'two' } })
  expect(boardCards()).toHaveLength(1)
  expect(boardCards()[0].textContent).toContain('Diagnostic two')
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
  expect(boardCards()).toHaveLength(2)
})

it('opens the clicked Kanban lead workspace without updating its stage', async () => {
  await openBoard([lead('one')])
  fireEvent.click(boardCards()[0])
  expect(screen.getByText('Diagnostic lead workspace')).toBeTruthy()
  expect(mocks.advance).not.toHaveBeenCalled()
  expect(mocks.outcome).not.toHaveBeenCalled()
})

it('moves a dragged card through the guarded next-stage service and offers accessible actions', async () => {
  mocks.advance.mockResolvedValue(lead('one', 'tenant', 'contacted'))
  await openBoard([lead('one')])
  expect(boardCards()[0].draggable).toBe(true)
  expect(screen.getByRole('button', { name: 'Move to Contacted' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Actions for Diagnostic one' })).toBeTruthy()
  const values = new Map()
  const dataTransfer = { setData: (key, value) => values.set(key, value), getData: key => values.get(key) || '' }
  fireEvent.dragStart(boardCards()[0], { dataTransfer })
  fireEvent.drop(screen.getByRole('region', { name: 'Contacted', exact: true }), { dataTransfer })
  await waitFor(() => expect(mocks.advance).toHaveBeenCalledWith(expect.objectContaining({ id: 'one' }), expect.objectContaining({ toStage: 'contacted', organisationId: 'org-a', scope: expect.objectContaining({ scopeLevel: 'organisation' }) })))
  await waitFor(() => expect(screen.getByRole('region', { name: 'Contacted', exact: true }).textContent).toContain('Diagnostic one'))
  expect(screen.getByRole('region', { name: 'New', exact: true }).textContent).not.toContain('Diagnostic one')
})

it('keeps a lead requiring stage review visible on Kanban', async () => {
  await openBoard([lead('review', 'tenant', 'application_started', { stageLabel: 'Review needed', workflowIssue: 'Review the saved rental stage before advancing this journey.' })])
  expect(screen.getByRole('heading', { level: 1 }).parentElement.textContent).toContain('1')
  expect(boardCards(), 'Header counts one lead, but no column accepts its saved stage').toHaveLength(1)
})

it('preserves Kanban and the selected landlord tab after opening a lead and returning', async () => {
  await openBoard([lead('owner', 'landlord')])
  fireEvent.click(screen.getByRole('button', { name: /Landlord Leads/ }))
  fireEvent.click(boardCards()[0])
  fireEvent.click(screen.getByRole('link', { name: 'Back to rental leads' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' }).disabled).toBe(false))
  expect(screen.getByRole('button', { name: 'Kanban', exact: true }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Landlord Leads')
})

it('explains that the closed Kanban board has no records', async () => {
  await openBoard([])
  fireEvent.click(screen.getByRole('button', { name: /Closed Leads/ }))
  expect(screen.queryByText(/No closed leads yet/)).not.toBeNull()
})

it('prevents an old organisation response from replacing the current board', async () => {
  let finishOld
  mocks.list.mockImplementation((org) => org === 'org-a'
    ? new Promise((resolve) => { finishOld = resolve })
    : Promise.resolve([lead('current-org')]))
  const view = render(<Harness />)
  await waitFor(() => expect(mocks.list).toHaveBeenCalledWith('org-a', expect.anything()))
  mocks.workspace = { profile: { id: 'agent-a' }, changed: true }
  mocks.scope = { ...mocks.scope, organisationId: 'org-b' }
  view.rerender(<Harness />)
  await waitFor(() => expect(mocks.list).toHaveBeenCalledWith('org-b', expect.anything()))
  fireEvent.click(screen.getByRole('button', { name: 'Kanban', exact: true }))
  await waitFor(() => expect(boardCards()[0]?.textContent).toContain('Diagnostic current-org'))
  await act(async () => { finishOld([lead('previous-org')]) })
  expect(boardCards()[0]?.textContent).toContain('Diagnostic current-org')
  expect(screen.queryByText('Diagnostic previous-org')).toBeNull()
})

it('explicit loading errors remain visible and Refresh can recover', async () => {
  mocks.list.mockRejectedValueOnce(new Error('Diagnostic permission denied')).mockResolvedValue([lead('recovered')])
  render(<Harness />)
  await screen.findByText('Diagnostic permission denied')
  fireEvent.click(screen.getByRole('button', { name: 'Kanban', exact: true }))
  expect(screen.getByText('Diagnostic permission denied')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(boardCards()).toHaveLength(1))
  expect(screen.queryByText('Diagnostic permission denied')).toBeNull()
})

it('closed leads stay out of active boards and appear in Closed Leads', async () => {
  await openBoard([lead('open'), lead('lost', 'tenant', 'contacted', { outcome: { status: 'lost' } })])
  expect(boardCards()).toHaveLength(1)
  expect(boardCards()[0].textContent).toContain('Diagnostic open')
  fireEvent.click(screen.getByRole('button', { name: /Closed Leads/ }))
  expect(boardCards()).toHaveLength(1)
  expect(boardCards()[0].textContent).toContain('Diagnostic lost')
})

it('rejects skipped and backward stages without a service write', async () => {
  await openBoard([lead('one'), lead('two', 'tenant', 'contacted')])
  dragTo(boardCards()[0], 'Qualified')
  expect(screen.getByRole('alert').textContent).toContain('next stage only')
  dragTo(boardCards().find(card => card.textContent.includes('Diagnostic two')), 'New')
  expect(mocks.advance).not.toHaveBeenCalled()
})

it('uses the action button to advance, waits for confirmation, and blocks a duplicate action', async () => {
  let finish
  mocks.advance.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await openBoard([lead('one')])
  fireEvent.click(screen.getByRole('button', { name: 'Move to Contacted' }))
  expect(mocks.advance).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('region', { name: 'New', exact: true }).textContent).toContain('Diagnostic one')
  expect(screen.getByRole('button', { name: 'Move to Contacted' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Move to Contacted' }))
  expect(mocks.advance).toHaveBeenCalledTimes(1)
  await act(async () => finish(lead('one', 'tenant', 'contacted')))
  expect(screen.getByRole('region', { name: 'Contacted', exact: true }).textContent).toContain('Diagnostic one')
})

it('keeps a rejected milestone in its saved column and displays the real workflow blocker', async () => {
  mocks.advance.mockRejectedValue(new Error('Record an attended viewing in Viewings before advancing this lead.'))
  await openBoard([lead('one', 'tenant', 'viewing_scheduled')])
  fireEvent.click(screen.getByRole('button', { name: 'Move to Viewing completed' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toContain('Record an attended viewing')
  expect(screen.getByRole('region', { name: 'Viewing scheduled', exact: true }).textContent).toContain('Diagnostic one')
  expect(screen.getByRole('region', { name: 'Viewing completed', exact: true }).textContent).not.toContain('Diagnostic one')
})

it.each([
  ['tenant', 'qualified', 'Schedule viewing', 'Viewing scheduler'],
  ['landlord', 'mandate_pending', 'Record signed mandate', 'Mandate workspace'],
])('routes the %s record-backed action to its existing workspace', async (role, stage, action, destination) => {
  await openBoard([lead('one', role, stage)])
  if (role === 'landlord') fireEvent.click(screen.getByRole('button', { name: /Landlord Leads/ }))
  fireEvent.click(screen.getByRole('button', { name: action }))
  expect(screen.getByText(destination)).toBeTruthy()
  expect(mocks.advance).not.toHaveBeenCalled()
})

it('keeps review-needed cards visible, filterable and read-only until reviewed', async () => {
  await openBoard([lead('one'), lead('review', 'tenant', 'unknown', { stageLabel: 'Review needed', workflowIssue: 'Review saved journey' })])
  fireEvent.change(screen.getByRole('combobox', { name: 'Stage filter' }), { target: { value: 'review_needed' } })
  expect(boardCards()).toHaveLength(1)
  expect(boardCards()[0].draggable).toBe(false)
  expect(within(screen.getByRole('region', { name: 'Review needed' })).getByRole('button', { name: 'Review lead' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Move to Contacted' })).toBeNull()
  expect(mocks.advance).not.toHaveBeenCalled()
})

it('records a lost outcome through the existing menu on Kanban', async () => {
  mocks.outcome.mockResolvedValue({ outcome: { status: 'lost', reason: 'budget' } })
  await openBoard([lead('one')])
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Diagnostic one' }))
  fireEvent.click(screen.getByRole('button', { name: 'Mark as lost' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Lost reason' }), { target: { value: 'budget' } })
  fireEvent.click(screen.getByRole('button', { name: 'Mark as lost' }))
  await waitFor(() => expect(mocks.outcome).toHaveBeenCalledWith(expect.objectContaining({ id: 'one' }), { status: 'lost', reason: 'budget' }, expect.objectContaining({ organisationId: 'org-a' })))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(boardCards()).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: /Closed Leads/ }))
  expect(boardCards()).toHaveLength(1)
  expect(boardCards()[0].draggable).toBe(false)
  expect(screen.queryByRole('button', { name: 'Move to Contacted' })).toBeNull()
})

it('restores filters after opening a lead and explains filtered empty boards', async () => {
  await openBoard([lead('one', 'landlord', 'contacted', { source: 'Referral' })])
  fireEvent.click(screen.getByRole('button', { name: /Landlord Leads/ }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Source filter' }), { target: { value: 'Referral' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Stage filter' }), { target: { value: 'contacted' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Agent filter' }), { target: { value: 'mine' } })
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort leads' }), { target: { value: 'oldest' } })
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search rental leads' }), { target: { value: 'one' } })
  fireEvent.click(screen.getByRole('button', { name: 'Open lead Diagnostic one' }))
  fireEvent.click(screen.getByRole('link', { name: 'Back to rental leads' }))
  await waitFor(() => expect(boardCards()).toHaveLength(1))
  expect(screen.getByRole('combobox', { name: 'Source filter' }).value).toBe('Referral')
  expect(screen.getByRole('combobox', { name: 'Stage filter' }).value).toBe('contacted')
  expect(screen.getByRole('combobox', { name: 'Agent filter' }).value).toBe('mine')
  expect(screen.getByRole('combobox', { name: 'Sort leads' }).value).toBe('oldest')
  expect(screen.getByRole('searchbox', { name: 'Search rental leads' }).value).toBe('one')
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search rental leads' }), { target: { value: 'missing' } })
  expect(screen.getByText('No rental leads match your filters')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(boardCards()).toHaveLength(1)
})

it('does not use another workspace’s view preference or pending cards', async () => {
  let finishNew
  const view = await openBoard([lead('owner', 'landlord')])
  fireEvent.click(screen.getByRole('button', { name: /Landlord Leads/ }))
  mocks.list.mockImplementation(() => new Promise(resolve => { finishNew = resolve }))
  mocks.workspace = { profile: { id: 'agent-a' }, changed: true }
  mocks.scope = { ...mocks.scope, organisationId: 'org-b' }
  view.rerender(<Harness />)
  expect(screen.getByRole('button', { name: 'Table', exact: true }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tenant Leads')
  expect(screen.queryByText('Diagnostic owner')).toBeNull()
  await act(async () => finishNew([]))
})
