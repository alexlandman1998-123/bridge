// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileDeveloperLeadsPage from '../MobileDeveloperLeadsPage.jsx'

const mocks = vi.hoisted(() => ({ workspace: null, organisation: null, read: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => mocks.organisation }))
vi.mock('../../../services/developerLeadService.js', () => ({ listDeveloperLeadIntake: mocks.read }))
vi.mock('../../../services/mobileProductivityService.js', () => ({ getOfflineDrafts: () => [] }))
vi.mock('../../../components/mobile-shell/MobileCreateSheet.jsx', () => ({ default: () => null, MobileDraftCard: () => null }))
const lead = { developerLeadId: 'lead-one', developerOrgId: 'org-one', leadOwner: 'developer', buyerFullName: 'Saved Buyer', buyerEmail: 'buyer@example.test', leadStatus: 'new', unitTypeInterest: 'Oak Court' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.workspace = { role: 'developer', currentWorkspace: { id: 'org-one' } }
  mocks.organisation = { organisation: { id: 'org-one' }, loading: false }
  mocks.read.mockResolvedValue([lead])
})
afterEach(cleanup)
function setup(id = 'lead-one') {
  return render(<MemoryRouter initialEntries={[`/mobile/developer/leads/${id}`]}><Routes><Route path="/mobile/developer/leads/:leadId?" element={<MobileDeveloperLeadsPage />} /></Routes></MemoryRouter>)
}

it('opens a saved lead directly and returns to the list without repeating its workspace read', async () => {
  setup()
  await act(async () => {})
  expect(mocks.read).toHaveBeenCalledWith({ developerOrgId: 'org-one' })
  expect(screen.getByRole('heading', { name: 'Saved Buyer' })).toBeTruthy()
  fireEvent.click(screen.getByRole('link', { name: 'All leads' }))
  expect(screen.getByRole('heading', { name: 'Leads' })).toBeTruthy()
  expect(mocks.read).toHaveBeenCalledTimes(1)
})

it('shows an unavailable lead as not found rather than substituting another lead', async () => {
  setup('not-in-workspace')
  await act(async () => {})
  expect(screen.getByRole('heading', { name: 'Lead not found.' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Saved Buyer' })).toBeNull()
})
