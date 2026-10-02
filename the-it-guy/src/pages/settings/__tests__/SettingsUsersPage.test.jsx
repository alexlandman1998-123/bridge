// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getOrganisationMemberJobTitleLabel } from '../../../lib/organisationJobTitles'
const api = vi.hoisted(() => ({ listOrganisationUsers: vi.fn(), updateOrganisationUserJobTitle: vi.fn(), updateOrganisationUserBusinessWorkspaces: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ can: () => true, role: 'agent', currentWorkspace: {id: 'agency', type: 'agency', settingsJson: { businessLines: ['sales', 'rentals', 'short_term_rentals'] }}, workspaceType: 'agency', isOrganisationOwner: true, organisationMembership: {status: 'active', role: 'owner'}, profile: {id: 'owner'}, organisationMembershipRole: 'owner' }) }))
vi.mock('../../../lib/settingsApi', async (original) => ({ ...(await original()), ...api,
  fetchOrganisationSettings: vi.fn(async () => ({membershipRole: 'owner', organisation: {id: 'agency', type: 'agency', settingsJson: { businessLines: ['sales', 'rentals', 'short_term_rentals'] }}})),
  listOrganisationCommissionStructures: vi.fn(async () => []), listOrganisationUserCommissionProfiles: vi.fn(async () => []), getOrganisationOwnershipHealthReport: vi.fn(async () => null),
}))
vi.mock('../../../services/workspaceUserInviteService', async (original) => ({ ...(await original()), listWorkspaceUserInvites: vi.fn(async () => []) }))
import SettingsUsersPage from '../SettingsUsersPage'
const member = {id:'member', userId:'agent', role:'agent', fullName:'Test Agent', email:'agent@example.test', status:'active', jobTitle:''}
beforeEach(() => { api.listOrganisationUsers.mockResolvedValue([member]); api.updateOrganisationUserJobTitle.mockResolvedValue({...member, jobTitle:'senior_agent'}) })
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('uses the role for missing job titles while preserving explicitly assigned titles', () => {
  expect(getOrganisationMemberJobTitleLabel(member)).toBe('Agent')
  expect(getOrganisationMemberJobTitleLabel({...member,jobTitle:'senior_agent'})).toBe('Senior Agent')
  expect(getOrganisationMemberJobTitleLabel({role:'owner'})).toBe('Organisation Owner')
})
it('shows the team first, provides a real roles guide and removes retired commercial controls', async () => {
  render(<MemoryRouter><SettingsUsersPage /></MemoryRouter>)
  await screen.findByRole('button',{name:/Test Agent/})
  expect(document.body.textContent).not.toMatch(/commercial|claim lifecycle/i)
  expect(screen.getByText(/Principal invitations/).closest('details').open).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'Roles & permissions'}))
  expect(screen.getByRole('heading',{name:'Agent'})).toBeTruthy()
  expect(screen.queryByPlaceholderText('Search team members')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Team members'}))
  fireEvent.change(screen.getByLabelText('Search team members'),{target:{value:'missing'}})
  expect(screen.getByText('No team members found')).toBeTruthy()
})
it('refreshes the open member drawer after a job title save', async () => {
  render(<MemoryRouter><SettingsUsersPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button',{name:/Test Agent/}))
  const drawer = within(screen.getByRole('dialog'))
  const titleSelect = drawer.getByRole('combobox',{name:/Job title/})
  expect(within(titleSelect).getByRole('option',{name:'Use role title (Agent)'})).toBeTruthy()
  api.listOrganisationUsers.mockResolvedValue([{...member,jobTitle:'senior_agent'}])
  fireEvent.change(titleSelect,{target:{value:'senior_agent'}})
  await waitFor(() => expect(drawer.getByRole('combobox',{name:/Job title/}).value).toBe('senior_agent'))
  expect(api.updateOrganisationUserJobTitle).toHaveBeenCalledWith('member','senior_agent')
})

it('offers all enabled combinations and reloads saved member access', async () => {
  const assigned = {...member, moduleMetadata: {businessWorkspaces: ['short_term_rentals']}}
  api.listOrganisationUsers.mockResolvedValue([assigned])
  api.updateOrganisationUserBusinessWorkspaces.mockImplementation(async (id, lines) => {
    api.listOrganisationUsers.mockResolvedValue([{...assigned, moduleMetadata: {businessWorkspaces: lines}}])
  })
  render(<MemoryRouter><SettingsUsersPage /></MemoryRouter>)
  const control = await screen.findByRole('combobox', {name: 'Business lines for Test Agent'})
  expect(control.value).toBe('short_term_rentals')
  expect(within(control).getAllByRole('option')).toHaveLength(7)
  fireEvent.change(control, {target: {value: 'rentals+short_term_rentals'}})
  await waitFor(() => expect(api.updateOrganisationUserBusinessWorkspaces).toHaveBeenCalledWith('member', ['rentals', 'short_term_rentals']))
  await waitFor(() => expect(screen.getByRole('combobox', {name: 'Business lines for Test Agent'}).value).toBe('rentals+short_term_rentals'))
})
