// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ branch: vi.fn(), settings: vi.fn(), from: vi.fn(), covers: vi.fn() }))
vi.mock('../../../services/privateListingService', async original => ({ ...(await original()), getPrivateListingCoverImageUrls: api.covers,
  getListingCardImageSource: src => ({ src, fallbackSrc: src?.includes('thumbnail') ? 'https://photos.test/original.jpg' : '' }) }))
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
function show(tab = 'staff') { return render(<MemoryRouter initialEntries={[`/agency/branches/branch-one/${tab}`]}><Routes><Route path="/agency/branches/:branchId/:tab" element={<AgencyBranchWorkspacePage />} /><Route path="*" element={<Location />} /></Routes></MemoryRouter>) }
function metric(card, label) { return card.getByText(label).parentElement.textContent }
beforeEach(() => {
  api.covers.mockResolvedValue({})
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
it('counts email-assigned owner deals and excludes pending onboarding and synthetic stock', async () => {
  const branch = fixture()
  branch.transactions = [
    ...['otp-one', 'otp-two'].map(id => ({ id, assigned_branch_id: branch.id, assigned_agent_email: 'OWNER@EXAMPLE.TEST', current_main_stage: 'OTP', stage: 'OTP Signed', lifecycle_state: 'active' })),
    { id: 'pending', assigned_branch_id: branch.id, assigned_user_id: 'owner-user', current_main_stage: 'AVAIL', stage: 'Available', lifecycle_state: 'active' },
    { id: 'test', assigned_branch_id: branch.id, assigned_user_id: 'owner-user', current_main_stage: 'FIN', is_demo_data: true },
  ]
  branch.listings.push({ id: 'test-stock', branch_id: branch.id, assigned_agent_id: 'owner-user', listing_status: 'active', is_demo_data: true })
  api.branch.mockResolvedValue(branch)
  show()
  const owner = within((await screen.findByRole('heading', { name: 'Owner One' })).closest('button'))
  expect(metric(owner, 'Current listings')).toBe('Current listings2')
  expect(metric(owner, 'In progress')).toBe('In progress2')
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

it('loads saved cover photos for visible branch listings instead of relying on absent image columns', async () => {
  api.covers.mockImplementation(async (ids, { onCover }) => { onCover({ sale: 'https://photos.test/thumbnail.jpg' }); return { sale: 'https://photos.test/thumbnail.jpg' } })
  show('listings')
  expect((await screen.findByAltText('sale')).getAttribute('src')).toBe('https://photos.test/thumbnail.jpg')
  expect(api.covers).toHaveBeenCalledWith(['sale', 'rental', 'draft', 'sold'], expect.objectContaining({ thumbnail: true, onCover: expect.any(Function) }))
})
it('keeps active stock filters consistent and shows removed website adverts separately', async () => {
  const branch = fixture()
  branch.listings = [
    { id: 'internal-active', branch_id: branch.id, listing_status: 'active', websitePublication: { status: 'unpublished' } },
    { id: 'under-offer', branch_id: branch.id, listing_status: 'under_offer' },
    { id: 'legacy-active', branch_id: branch.id, listing_status: 'listing_active' },
    { id: 'withdrawn', branch_id: branch.id, listing_status: 'withdrawn' },
    { id: 'inactive', branch_id: branch.id, listing_status: 'inactive' },
  ]
  api.branch.mockResolvedValue(branch)
  show('listings')
  const card = (await screen.findByRole('heading', { name: 'internal-active' })).closest('article')
  expect(within(card).getByText('Listing: Active')).toBeTruthy()
  expect(within(card).getByText('Website: Removed')).toBeTruthy()
  const filter = screen.getByRole('combobox', { name: '' })
  fireEvent.change(filter, { target: { value: 'active' } })
  expect(screen.getByText(/Showing 3 of 5 listings/)).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'inactive' })).toBeNull()
  fireEvent.change(filter, { target: { value: 'withdrawn' } })
  expect(screen.getByRole('heading', { name: 'withdrawn' })).toBeTruthy()
  expect(screen.getByText(/Showing 1 of 5 listings/)).toBeTruthy()
})
it('uses the original when a thumbnail fails, and can renew a failed photo without opening the listing', async () => {
  api.covers.mockResolvedValueOnce({ sale: 'https://photos.test/thumbnail.jpg' }).mockResolvedValueOnce({ sale: 'https://photos.test/renewed.jpg' })
  show('listings')
  const image=await screen.findByAltText('sale')
  fireEvent.error(image)
  expect(image.getAttribute('src')).toBe('https://photos.test/original.jpg')
  fireEvent.error(image)
  fireEvent.click(await screen.findByRole('button',{name:'Retry photo'}))
  await waitFor(()=>expect(screen.getByAltText('sale').getAttribute('src')).toBe('https://photos.test/renewed.jpg'))
  expect(screen.queryByTestId('route')).toBeNull()
})
it('keeps listing cards usable after a cover lookup failure and retries the photo lookup', async () => {
  api.covers.mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({ sale: 'https://photos.test/recovered.jpg' })
  show('listings')
  expect((await screen.findByRole('alert')).textContent).toContain('Listing photos could not be loaded.')
  expect(screen.getByRole('heading',{name:'sale'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Retry photos'}))
  expect((await screen.findByAltText('sale')).getAttribute('src')).toBe('https://photos.test/recovered.jpg')
  expect(screen.queryByRole('alert')).toBeNull()
})
it('does not request listing photos on other branch tabs', async () => {
  show()
  await screen.findByRole('heading',{name:'Owner One'})
  expect(api.covers).not.toHaveBeenCalled()
})
it('shows branch deals, separates pending totals and opens the selected transaction', async () => {
  const branch = fixture()
  branch.transactions = [
    ...['otp-one', 'otp-two'].map(id => ({ id, assigned_branch_id: branch.id, assigned_agent_email: 'owner@example.test', current_main_stage: 'OTP', stage: 'OTP Signed', lifecycle_state: 'active', property_address_line_1: id })),
    ...['pending-one', 'pending-two'].map(id => ({ id, assigned_branch_id: branch.id, current_main_stage: 'AVAIL', stage: 'Available', lifecycle_state: 'active', property_address_line_1: id })),
    { id: 'synthetic', is_demo_data: true, current_main_stage: 'FIN', property_address_line_1: 'synthetic' },
  ]
  api.branch.mockResolvedValue(branch)
  show('transactions')
  await screen.findByText(/2 active deals · 2 awaiting onboarding or review/)
  expect(screen.queryByText('No transactions yet')).toBeNull()
  expect(screen.queryByText('synthetic')).toBeNull()
  expect(screen.getByText('pending-one')).toBeTruthy()
  fireEvent.click(screen.getByText('otp-one'))
  expect(screen.getByTestId('route').textContent).toBe('/transactions/otp-one')
})
it('does not present a failed branch transaction read as an empty workspace', async () => {
  api.branch.mockResolvedValue({ ...fixture(), transactions: [], dataAvailability: { transactions: false } })
  show('transactions')
  expect((await screen.findByRole('alert')).textContent).toContain('Branch transactions could not be loaded')
  expect(screen.queryByText('No transactions yet')).toBeNull()
})
it('discards an old cover response after leaving the tab and requesting fresh photos', async () => {
  let finishOld
  api.covers.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    .mockResolvedValueOnce({ sale: 'https://photos.test/fresh.jpg' })
  show('listings')
  await waitFor(() => expect(api.covers).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('tab', { name: 'Staff' }))
  await screen.findByRole('heading', { name: 'Owner One' })
  fireEvent.click(screen.getByRole('tab', { name: 'Listings' }))
  expect((await screen.findByAltText('sale')).getAttribute('src')).toBe('https://photos.test/fresh.jpg')
  await act(async () => { finishOld({ sale: 'https://photos.test/stale.jpg' }) })
  expect(screen.getByAltText('sale').getAttribute('src')).toBe('https://photos.test/fresh.jpg')
})
