// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ branch: vi.fn(), settings: vi.fn(), from: vi.fn() }))
vi.mock('../../../services/branchDashboardDataService', () => ({ getBranchDashboardData: api.branch }))
vi.mock('../../../lib/supabaseClient', async (original) => ({ ...(await original()), isSupabaseConfigured: true, supabase: { from: api.from } }))
vi.mock('../../../lib/settingsApi', async (original) => ({ ...(await original()), fetchOrganisationSettings: api.settings, listOrganisationCommissionStructures: vi.fn(async () => []), listOrganisationPreferredPartners: vi.fn(async () => []) }))
vi.mock('../../../services/workspaceUserInviteService', () => ({ createWorkspaceUserInvite: vi.fn(), resendWorkspaceUserInvite: vi.fn() }))
vi.mock('../../../services/recruitmentService', () => ({ listJoiningRecruitmentLeads: vi.fn(async () => []) }))
import AgencyBranchWorkspacePage from '../AgencyBranchWorkspacePage'

const fixture = () => ({
  id: 'branch-one', organisationId: 'company-one', name: 'Head Office', leads: [],
  members: [{ id: 'owner-membership', user_id: 'owner-user', role: 'owner', status: 'active', first_name: 'Owner', last_name: 'One', email: 'owner@example.test' }, { id: 'principal-membership', user_id: 'principal-user', role: 'principal', status: 'active', first_name: 'Principal', last_name: 'Two' }],
  listings: [{ id: 'sale', branch_id: 'branch-one', listing_status: 'mandate_signed', assigned_agent_id: 'owner-user', created_at: '2026-01-01' }, { id: 'rental', branch_id: 'branch-one', listing_category: 'rental', listing_status: 'seller_lead', assigned_agent_id: 'owner-user', created_at: '2026-01-01' }, { id: 'draft', branch_id: 'branch-one', listing_status: 'seller_lead', assigned_agent_id: 'principal-user' }, { id: 'sold', branch_id: 'branch-one', listing_status: 'sold', assigned_agent_id: 'owner-user' }],
  transactions: [{ id: 'open', assigned_branch_id: 'branch-one', assigned_user_id: 'owner-user', lifecycle_state: 'active', created_at: '2026-01-01' }, { id: 'closed', assigned_branch_id: 'branch-one', assigned_user_id: 'owner-user', lifecycle_state: 'registered', registered_at: '2026-08-01' }],
})
function Location() { return <p data-testid="route">{useLocation().pathname}</p> }
function show() { return render(<MemoryRouter initialEntries={['/agency/branches/branch-one/staff']}><Routes><Route path="/agency/branches/:branchId/:tab" element={<AgencyBranchWorkspacePage />} /><Route path="*" element={<Location />} /></Routes></MemoryRouter>) }
function metric(card, label) { return card.getByText(label).parentElement.textContent }
beforeEach(() => {
  api.branch.mockResolvedValue(fixture())
  api.settings.mockResolvedValue({ organisation: { id: 'company-one' }, membershipRole: 'owner' })
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn() }
  for (const method of ['select', 'eq', 'in']) query[method].mockReturnValue(query)
  query.order.mockResolvedValue({ data: [], error: null })
  api.from.mockReturnValue(query)
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('shows owner and principal allocations, including rentals and old open deals', async () => {
  show()
  const owner = within((await screen.findByRole('heading', { name: 'Owner One' })).closest('button'))
  const principal = within(screen.getByRole('heading', { name: 'Principal Two' }).closest('button'))
  expect(metric(owner, 'Current listings')).toBe('Current listings2')
  expect(metric(owner, 'In progress')).toBe('In progress1')
  expect(metric(principal, 'Current listings')).toBe('Current listings1')
  expect(metric(principal, 'In progress')).toBe('In progress0')
  expect(owner.getByText(/Commission · Last 30 days/)).toBeTruthy()
  fireEvent.click(screen.getByRole('heading', { name: 'Owner One' }).closest('button'))
  expect(screen.getByTestId('route').textContent).toBe('/agency/agents/owner-user')
})
it('preserves unavailable figures and explains them instead of showing zero', async () => {
  api.branch.mockResolvedValue({ ...fixture(), dataAvailability: { listings: false, transactions: false } })
  show()
  const owner = within((await screen.findByRole('heading', { name: 'Owner One' })).closest('button'))
  expect(metric(owner, 'Current listings')).toBe('Current listings—')
  expect(metric(owner, 'In progress')).toBe('In progress—')
  expect(owner.getByText('Some figures could not be loaded.')).toBeTruthy()
  expect(owner.queryByText('R 0')).toBeNull()
})
it('retains staff financial restrictions for a branch manager', async () => {
  api.settings.mockResolvedValue({ organisation: { id: 'company-one' }, membershipRole: 'branch_manager' })
  show()
  const owner = within((await screen.findByRole('heading', { name: 'Owner One' })).closest('button'))
  expect(owner.queryByText(/Commission ·/)).toBeNull()
  expect(metric(owner, 'Current listings')).toBe('Current listings2')
})
it('keeps pending invitation cards separate from actual staff metrics', async () => {
  const query = api.from()
  query.order.mockResolvedValue({ data: [{ id: 'invite', invite_type: 'branch_invite', status: 'pending', token: 'fixture', email: 'pending@example.test', target_workspace_role: 'agent', metadata: { first_name: 'Pending', last_name: 'Agent' } }], error: null })
  show()
  const pending = within((await screen.findByRole('heading', { name: 'Pending Agent' })).closest('button'))
  expect(metric(pending, 'Current listings')).toBe('Current listings—')
  expect(metric(pending, 'In progress')).toBe('In progress—')
  expect(pending.getByText('Waiting for acceptance')).toBeTruthy()
  expect(pending.queryByText(/Commission/)).toBeNull()
})
