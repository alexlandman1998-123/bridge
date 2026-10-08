// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  getBranchDashboardData: vi.fn(),
  listJoiningRecruitmentLeads: vi.fn(),
  fetchOrganisationSettings: vi.fn(),
  from: vi.fn(),
  createWorkspaceUserInvite: vi.fn(),
  resendWorkspaceUserInvite: vi.fn(),
  writeText: vi.fn(),
}))

vi.mock('../../../services/branchDashboardDataService', () => ({ getBranchDashboardData: api.getBranchDashboardData }))
vi.mock('../../../lib/supabaseClient', async (original) => ({
  ...(await original()),
  isSupabaseConfigured: true,
  supabase: { from: api.from },
}))
vi.mock('../../../lib/settingsApi', async (original) => ({
  ...(await original()),
  fetchOrganisationSettings: api.fetchOrganisationSettings,
  listOrganisationCommissionStructures: vi.fn(async () => []),
  listOrganisationPreferredPartners: vi.fn(async () => []),
}))
vi.mock('../../../services/workspaceUserInviteService', () => ({
  createWorkspaceUserInvite: api.createWorkspaceUserInvite,
  resendWorkspaceUserInvite: api.resendWorkspaceUserInvite,
}))

vi.mock('../../../services/recruitmentService', () => ({listJoiningRecruitmentLeads:api.listJoiningRecruitmentLeads}))

import AgencyBranchWorkspacePage from '../AgencyBranchWorkspacePage'

const invite = {
  id: 'invite-test', token: 'test-access-token', status: 'pending', invite_type: 'branch_invite',
  target_workspace_id: 'agency-test', target_branch_id: 'branch-test', target_workspace_role: 'agent',
  email: 'agent@example.test', phone: '0710000000',
  created_at: '2026-10-08T10:00:00Z', expires_at: '2099-10-22T10:00:00Z',
  metadata: { first_name: 'Test', last_name: 'Agent', commission_structure_name: 'Standard split' },
}
const branch = {
  id: 'branch-test', organisationId: 'agency-test', name: 'Head Office',
  members: [], transactions: [], listings: [], leads: [],
}

function renderBranch() {
  return render(<MemoryRouter initialEntries={['/agency/branches/branch-test/staff']}>
    <Routes><Route path="/agency/branches/:branchId/:tab" element={<AgencyBranchWorkspacePage />} /></Routes>
  </MemoryRouter>)
}

async function openInvite() {
  renderBranch()
  fireEvent.click(await screen.findByText('Test Agent'))
  return within(screen.getByRole('dialog', { name: 'Agent Invite' }))
}

beforeEach(() => {
  api.getBranchDashboardData.mockResolvedValue(branch)
  api.fetchOrganisationSettings.mockResolvedValue({organisation:{id:'agency-test',name:'Test Agency'},membershipRole:'principal'})
  api.listJoiningRecruitmentLeads.mockResolvedValue([])
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), order: vi.fn() }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.order.mockResolvedValue({ data: [invite], error: null })
  api.from.mockReturnValue(query)
  api.resendWorkspaceUserInvite.mockResolvedValue({})
  api.writeText.mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: api.writeText } })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

it('keeps the loaded invitation link, dates and commission when opened from branch staff', async () => {
  const dialog = await openInvite()
  const link = dialog.getByText(/\/invite\/test-access-token/).textContent
  expect(dialog.getByText('Standard split')).toBeTruthy()
  expect(dialog.getByText('Created')).toBeTruthy()
  expect(dialog.getByText(new Date(invite.created_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }))).toBeTruthy()
  expect(dialog.getByText(new Date(invite.expires_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }))).toBeTruthy()
  fireEvent.click(dialog.getByRole('button', { name: 'Copy Link' }))
  await dialog.findByRole('status')
  expect(api.writeText).toHaveBeenCalledWith(link)
  fireEvent.click(dialog.getByRole('button', { name: 'Resend Invite' }))
  await dialog.findByText('Invite resent to agent@example.test.')
  expect(api.resendWorkspaceUserInvite).toHaveBeenCalledWith(expect.objectContaining({
    id: invite.id, token: invite.token, phone: invite.phone,
    organisationName: 'Test Agency', raw: expect.objectContaining({
      invite_type: 'branch_invite', target_workspace_id: 'agency-test', target_branch_id: 'branch-test',
    }),
  }))
})

it('disables copying and resending when the loaded invitation actually has no token', async () => {
  api.from().order.mockResolvedValue({ data: [{ ...invite, token: null }], error: null })
  const dialog = await openInvite()
  expect(dialog.getByRole('button', { name: 'Copy Link' }).disabled).toBe(true)
  expect(dialog.getByRole('button', { name: 'Resend Email' }).disabled).toBe(true)
  expect(dialog.getByRole('button', { name: 'Resend Invite' }).disabled).toBe(true)
  expect(dialog.getByRole('alert').textContent).toMatch(/Reload the branch/)
  expect(api.resendWorkspaceUserInvite).not.toHaveBeenCalled()
})

it('keeps the invitation available after a failed resend and allows retry without another create', async () => {
  api.resendWorkspaceUserInvite.mockRejectedValueOnce(new Error('Email sending failed. Please retry.'))
  const dialog = await openInvite()
  fireEvent.click(dialog.getByRole('button', { name: 'Resend Email' }))
  expect((await dialog.findByRole('alert')).textContent).toBe('Email sending failed. Please retry.')
  expect(dialog.queryByText('Invite resent to agent@example.test.')).toBeNull()
  expect(api.getBranchDashboardData).toHaveBeenCalledTimes(1)
  fireEvent.click(dialog.getByRole('button', { name: 'Resend Invite' }))
  await dialog.findByText('Invite resent to agent@example.test.')
  expect(api.resendWorkspaceUserInvite).toHaveBeenCalledTimes(2)
  expect(api.createWorkspaceUserInvite).not.toHaveBeenCalled()
  await waitFor(() => expect(api.getBranchDashboardData).toHaveBeenCalledTimes(2))
})

it('reports clipboard failure without claiming the link was copied', async () => {
  api.writeText.mockRejectedValue(new Error('Clipboard blocked'))
  const dialog = await openInvite()
  fireEvent.click(dialog.getByRole('button', { name: 'Copy Link' }))
  expect((await dialog.findByRole('alert')).textContent).toBe('Unable to copy the invite link from this browser.')
  expect(dialog.queryByText('Invite link copied.')).toBeNull()
})

it('keeps resend confirmation visible while the branch refreshes', async () => {
  const dialog = await openInvite()
  let finishRefresh
  api.getBranchDashboardData.mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve }))
  fireEvent.click(dialog.getByRole('button', { name: 'Resend Invite' }))
  await waitFor(() => expect(api.getBranchDashboardData).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('dialog', { name: 'Agent Invite' })).toBeTruthy()
  expect(screen.getByRole('status').textContent).toBe('Invite resent to agent@example.test.')
  finishRefresh(branch)
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Invite resent to agent@example.test.'))
})

it('disables both resend actions during delivery to prevent duplicate requests', async () => {
  let finishDelivery
  api.resendWorkspaceUserInvite.mockImplementationOnce(() => new Promise((resolve) => { finishDelivery = resolve }))
  const dialog = await openInvite()
  fireEvent.click(dialog.getByRole('button', { name: 'Resend Invite' }))
  expect(dialog.getAllByRole('button', { name: 'Resending...' }).every((button) => button.disabled)).toBe(true)
  expect(dialog.getByRole('button', { name: 'Copy Link' }).disabled).toBe(true)
  fireEvent.click(dialog.getAllByRole('button', { name: 'Resending...' })[0])
  expect(api.resendWorkspaceUserInvite).toHaveBeenCalledTimes(1)
  finishDelivery({})
  await dialog.findByText('Invite resent to agent@example.test.')
})

function RecruitmentDestination() { const location=useLocation(); return <output aria-label="Recruitment route">{JSON.stringify(location.state)}</output> }
it('starts the shared joining route from branch staff and keeps recruitment progress separate from invitation cards',async()=>{
  api.listJoiningRecruitmentLeads.mockResolvedValue([{id:'joining',name:'New Recruit',email:'new@example.test',status:'lead_received',joining_branch_id:'branch-test'}])
  render(<MemoryRouter initialEntries={['/agency/branches/branch-test/staff']}><Routes><Route path="/agency/branches/:branchId/:tab" element={<AgencyBranchWorkspacePage/>}/><Route path="/agency/recruitment/new" element={<RecruitmentDestination/>}/></Routes></MemoryRouter>)
  await screen.findByText('New Recruit')
  expect(api.listJoiningRecruitmentLeads).toHaveBeenCalledWith('agency-test','branch-test')
  expect(within(screen.getByRole('region',{name:'Joining'})).getByText('Invite to apply')).toBeTruthy()
  expect(screen.getByText('Test Agent')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Invite new agent'}))
  const context=JSON.parse(screen.getByLabelText('Recruitment route').textContent).recruitmentEntry
  expect(context).toEqual({entryPoint:'branch',organisationId:'agency-test',branchId:'branch-test',returnTo:'/agency/branches/branch-test/staff'})
  expect(api.createWorkspaceUserInvite).not.toHaveBeenCalled()
})
it('keeps branch-manager access invitations and exposes only bounded joining progress',async()=>{
  api.fetchOrganisationSettings.mockResolvedValue({organisation:{id:'agency-test',name:'Test Agency'},membershipRole:'branch_manager'})
  renderBranch()
  await screen.findByText('Test Agent')
  expect(screen.getByRole('button',{name:'Invite new agent'})).toBeTruthy()
  expect(screen.getByRole('region',{name:'Joining'})).toBeTruthy()
  await waitFor(()=>expect(api.listJoiningRecruitmentLeads).toHaveBeenCalledWith('agency-test','branch-test',{limitedBranch:true,commercialOnly:false}))
  expect(screen.getByRole('button',{name:'Existing staff access'})).toBeTruthy()
})
