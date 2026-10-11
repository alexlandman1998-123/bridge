// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ detail: vi.fn(), list: vi.fn(), developments: vi.fn(), users: vi.fn(), units: vi.fn(), journey: vi.fn() }))
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ role: 'agent', currentWorkspace: { id: 'agency-org' } }) }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: null }))
vi.mock('../../services/developerLeadService', async importOriginal => ({ ...await importOriginal(), fetchDeveloperLeadIntake: mocks.detail, listDeveloperLeadIntake: mocks.list }))
vi.mock('../../lib/api', () => ({ fetchDevelopmentOptions: mocks.developments, fetchUnitsForTransactionSetup: mocks.units }))
vi.mock('../../lib/settingsApi', () => ({ listOrganisationUsers: mocks.users }))
vi.mock('../../services/journeyStageOverrideService.js', () => ({ fetchJourneyStageOverrides: mocks.journey }))
vi.mock('../../components/journey/JourneyStageOverrideActions', () => ({ default: () => null }))
vi.mock('../../components/documents/DeveloperLeadDocuments.jsx', () => ({ default: () => null }))
import DeveloperLeadsPage from '../DeveloperLeadsPage.jsx'

const lead = { developerLeadId: 'lead-one', developerOrgId: 'developer-org', leadOwner: 'developer', buyerFullName: 'Saved Buyer', buyerEmail: 'buyer@example.test', leadStatus: 'new', primaryDevelopmentId: 'dev-one', unitTypeInterest: 'Harbour Heights' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.detail.mockResolvedValue(lead)
  mocks.list.mockResolvedValue([])
  mocks.developments.mockResolvedValue([{ id: 'dev-one', name: 'Harbour Heights' }])
  mocks.users.mockResolvedValue([])
  mocks.units.mockResolvedValue([])
  mocks.journey.mockResolvedValue([])
})
afterEach(cleanup)

function setup(path = '/developer/leads/lead-one') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/developer/leads/:developerLeadId?" element={<DeveloperLeadsPage />} /><Route path="/developments/11111111-1111-4111-8111-111111111111" element={<p>Returned to development board</p>} /></Routes></MemoryRouter>)
}

it('opens a linked lead from an agency workspace using its owning developer context', async () => {
  setup()
  await screen.findByRole('heading', { name: 'Saved Buyer' })
  expect(mocks.detail).toHaveBeenCalledWith({ developerLeadId: 'lead-one' })
  expect(mocks.list).not.toHaveBeenCalled()
  expect(mocks.developments).toHaveBeenCalledWith({ organisationId: 'developer-org' })
  await waitFor(() => expect(mocks.journey).toHaveBeenCalledWith(expect.objectContaining({ organisationId: 'developer-org', entityId: 'lead-one' })))
})

it('does not show a workspace or load another organisation when the lead is inaccessible', async () => {
  mocks.detail.mockResolvedValue(null)
  const view = setup()
  await screen.findByText('This developer lead is unavailable or you do not have access to it.')
  expect(mocks.developments).not.toHaveBeenCalled()
  expect(view.container.querySelector('[data-developer-lead-workspace]')).toBeNull()
})

it('keeps the lead list scoped to the active workspace', async () => {
  setup('/developer/leads')
  await waitFor(() => expect(mocks.list).toHaveBeenCalledWith({ developerOrgId: 'agency-org', status: 'all', source: 'all' }))
  expect(mocks.detail).not.toHaveBeenCalled()
})

it('opens the workflow section requested by a board drop and returns to its development', async () => {
  setup({ pathname: '/developer/leads/lead-one', search: '?workspaceTab=development', state: { returnTo: '/developments/11111111-1111-4111-8111-111111111111?tab=leads&leadView=kanban' } })
  await screen.findByRole('heading', { name: 'Saved Buyer' })
  expect(screen.getByRole('tab', { name: 'Development' }).getAttribute('aria-selected')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Back to Leads' }))
  expect(await screen.findByText('Returned to development board')).toBeTruthy()
})

it('ignores unknown workflow tabs and external return destinations', async () => {
  setup({ pathname: '/developer/leads/lead-one', search: '?workspaceTab=unknown', state: { returnTo: 'https://example.test/' } })
  await screen.findByRole('heading', { name: 'Saved Buyer' })
  expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Back to Leads' }))
  await waitFor(() => expect(mocks.list).toHaveBeenCalled())
})

it('opens the onboarding and offer actions when their workflow is requested', async () => {
  setup('/developer/leads/lead-one?workspaceTab=onboarding_otp')
  await screen.findByRole('heading', { name: 'Saved Buyer' })
  expect(screen.getByRole('tab', { name: /Transaction Setup \/ Offer/ }).getAttribute('aria-selected')).toBe('true')
})
