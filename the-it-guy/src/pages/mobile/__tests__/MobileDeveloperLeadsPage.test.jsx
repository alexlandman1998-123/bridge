// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileDeveloperLeadsPage from '../MobileDeveloperLeadsPage.jsx'

const mocks = vi.hoisted(() => ({ workspace: null, organisation: null, read: vi.fn(), journey: vi.fn(), update: vi.fn(), handover: vi.fn(), convert: vi.fn(), developments: vi.fn(), units: vi.fn(), clipboard: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => mocks.organisation }))
vi.mock('../../../services/developerLeadService.js', () => ({ listDeveloperLeadIntake: mocks.read, updateDeveloperLeadWorkspaceSetup: mocks.update, requestAgencyLeadHandover: mocks.handover }))
vi.mock('../../../services/developerLeadConversionService.js', () => ({ convertDeveloperLeadToTransactionAndSendOnboarding: mocks.convert }))
vi.mock('../../../lib/api.js', () => ({ fetchDevelopmentOptions: mocks.developments, fetchUnitsForTransactionSetup: mocks.units }))
vi.mock('../../../services/journeyStageOverrideService.js', () => ({ fetchJourneyStageOverrides: mocks.journey }))
vi.mock('../../../services/mobileProductivityService.js', () => ({ getOfflineDrafts: () => [] }))
vi.mock('../../../components/mobile-shell/MobileCreateSheet.jsx', () => ({ default: () => null, MobileDraftCard: () => null }))
const lead = { developerLeadId: 'lead-one', developerOrgId: 'org-one', leadOwner: 'developer', buyerFullName: 'Saved Buyer', buyerEmail: 'buyer@example.test', leadStatus: 'new', unitTypeInterest: 'Oak Court' }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.workspace = { role: 'developer', currentWorkspace: { id: 'org-one' } }
  mocks.organisation = { organisation: { id: 'org-one' }, loading: false }
  mocks.read.mockResolvedValue([lead])
  mocks.journey.mockResolvedValue([])
  mocks.developments.mockResolvedValue([{ id: 'dev-one', name: 'Oak Court' }])
  mocks.units.mockResolvedValue([{ id: 'unit-one', unit_number: '101' }])
  mocks.update.mockResolvedValue({})
  mocks.handover.mockResolvedValue({})
  mocks.clipboard.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.clipboard } })
})

it('saves a status once, then refreshes the lead and journey from saved data', async () => {
  mocks.read.mockResolvedValueOnce([lead]).mockResolvedValueOnce([{ ...lead, leadStatus: 'contacted' }])
  setup()
  await act(async () => {})
  const button = screen.getByRole('button', { name: 'Mark Contacted' })
  await act(async () => { fireEvent.click(button); fireEvent.click(button) })
  expect(mocks.update).toHaveBeenCalledTimes(1)
  expect(mocks.update).toHaveBeenCalledWith({ developerOrgId: 'org-one', developerLeadId: 'lead-one', leadStatus: 'contacted', previousLeadStatus: 'new', activityNote: 'Buyer has been contacted.' })
  expect(screen.getByRole('button', { name: 'Mark Qualified' })).toBeTruthy()
  expect(screen.getByText('Lead status updated.')).toBeTruthy()
  expect(mocks.journey).toHaveBeenCalledTimes(2)
})

it('retains the saved stage when an action fails and allows a retry', async () => {
  mocks.update.mockRejectedValueOnce(new Error('Unable to save'))
  setup()
  await act(async () => {})
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mark Contacted' })))
  expect(screen.getByRole('alert').textContent).toBe('Unable to save')
  expect(screen.getByRole('button', { name: 'Mark Contacted' }).disabled).toBe(false)
  expect(mocks.read).toHaveBeenCalledTimes(1)
})

it('locks further actions if the save succeeds but refreshing the saved lead fails', async () => {
  mocks.read.mockResolvedValueOnce([lead]).mockRejectedValueOnce(new Error('Read unavailable'))
  setup()
  await act(async () => {})
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mark Contacted' })))
  expect(screen.getByRole('alert').textContent).toContain('The change was saved')
  expect(screen.getByRole('button', { name: 'Mark Contacted' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Copy Buyer Onboarding Link' }).disabled).toBe(true)
})

it('loads the linked development in the organisation and saves a chosen unit through the desktop service', async () => {
  const viewing = { ...lead, primaryDevelopmentId: 'dev-one', leadStatus: 'viewing' }
  mocks.read.mockResolvedValueOnce([viewing]).mockResolvedValueOnce([{ ...viewing, preferredUnitId: 'unit-one' }])
  setup()
  await act(async () => {})
  expect(mocks.developments).toHaveBeenCalledWith({ organisationId: 'org-one' })
  expect(within(screen.getByRole('region', { name: 'Lead profile' })).getByText('Oak Court')).toBeTruthy()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Select Preferred Unit' })))
  expect(mocks.units).toHaveBeenCalledWith('dev-one')
  fireEvent.change(screen.getByRole('combobox', { name: 'Preferred unit' }), { target: { value: 'unit-one' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save Unit' })))
  expect(mocks.update).toHaveBeenCalledWith({ developerOrgId: 'org-one', developerLeadId: 'lead-one', preferredUnitId: 'unit-one' })
  expect(screen.getByRole('button', { name: 'Send Buyer Onboarding' })).toBeTruthy()
  expect(screen.queryByRole('form', { name: 'Select preferred unit' })).toBeNull()
})

it('uses the desktop onboarding send operation and opens the resulting saved context', async () => {
  const ready = { ...lead, primaryDevelopmentId: 'dev-one', preferredUnitId: 'unit-one', leadStatus: 'qualified' }
  mocks.read.mockResolvedValueOnce([ready]).mockResolvedValueOnce([{ ...ready, leadStatus: 'onboarding_sent', convertedTransactionId: 'tx-one' }])
  mocks.convert.mockResolvedValue({ transactionId: 'tx-one', onboardingUrl: 'https://example.test/onboarding/one', onboardingEmail: { sent: true } })
  setup()
  await act(async () => {})
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send Buyer Onboarding' })))
  expect(mocks.convert).toHaveBeenCalledWith(expect.objectContaining({ developerOrgId: 'org-one', lead: expect.objectContaining({ developerLeadId: 'lead-one' }), sendBuyerOnboarding: true }))
  expect(screen.getByText('Buyer onboarding email sent.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Open Onboarding Context' }).getAttribute('href')).toBe('/mobile/transaction/tx-one')
})

it('copies an onboarding link without requesting email delivery', async () => {
  mocks.convert.mockResolvedValue({ onboardingUrl: 'https://example.test/onboarding/one' })
  setup()
  await act(async () => {})
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy Buyer Onboarding Link' })))
  expect(mocks.convert).toHaveBeenCalledWith(expect.objectContaining({ sendBuyerOnboarding: false, manualBuyerOnboardingDelivery: true }))
  expect(mocks.clipboard).toHaveBeenCalledWith('https://example.test/onboarding/one')
  expect(screen.getByText('Buyer onboarding link copied.')).toBeTruthy()
})

it('requests agency handover without exposing contact details or onboarding actions', async () => {
  const protectedLead = { ...lead, leadOwner: 'agency', sourceAgencyOrgId: 'agency-two', visibilityState: 'limited' }
  mocks.read.mockResolvedValueOnce([protectedLead]).mockResolvedValueOnce([{ ...protectedLead, visibilityState: 'consent_pending' }])
  setup()
  await act(async () => {})
  expect(screen.queryByRole('heading', { name: 'Saved Buyer' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Copy Buyer Onboarding Link' })).toBeNull()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Request Handover' })))
  expect(mocks.handover).toHaveBeenCalledWith({ developerOrgId: 'org-one', developerLeadId: 'lead-one' })
  expect(screen.getByRole('button', { name: 'Handover Requested' }).disabled).toBe(true)
  expect(mocks.convert).not.toHaveBeenCalled()
})

it('keeps a completed action in its original organisation when the workspace changes mid-save', async () => {
  let finishSave
  mocks.update.mockImplementation(() => new Promise((resolve) => { finishSave = resolve }))
  const otherLead = { ...lead, developerOrgId: 'org-two', buyerFullName: 'Other Buyer' }
  mocks.read.mockImplementation(({ developerOrgId }) => Promise.resolve([developerOrgId === 'org-one' ? lead : otherLead]))
  const view = setup()
  await act(async () => {})
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Mark Contacted' })))
  mocks.workspace = { role: 'developer', currentWorkspace: { id: 'org-two' } }
  mocks.organisation = { organisation: { id: 'org-two' }, loading: false }
  await act(async () => view.rerender(<MemoryRouter initialEntries={['/mobile/developer/leads/lead-one']}><Routes><Route path="/mobile/developer/leads/:leadId?" element={<MobileDeveloperLeadsPage />} /></Routes></MemoryRouter>))
  expect(screen.getByRole('heading', { name: 'Other Buyer' })).toBeTruthy()
  await act(async () => finishSave({}))
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ developerOrgId: 'org-one' }))
  expect(screen.getByRole('heading', { name: 'Other Buyer' })).toBeTruthy()
  expect(screen.queryByText('Lead status updated.')).toBeNull()
})
afterEach(cleanup)
function setup(id = 'lead-one') {
  return render(<MemoryRouter initialEntries={[`/mobile/developer/leads/${id}`]}><Routes><Route path="/mobile/developer/leads/:leadId?" element={<MobileDeveloperLeadsPage />} /></Routes></MemoryRouter>)
}

it('opens a saved lead directly and returns to the list without repeating its workspace read', async () => {
  setup()
  await act(async () => {})
  expect(mocks.read).toHaveBeenCalledWith({ developerOrgId: 'org-one' })
  expect(mocks.journey).toHaveBeenCalledWith({ organisationId: 'org-one', entityType: 'developer_lead', entityId: 'lead-one' })
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
  expect(mocks.journey).not.toHaveBeenCalled()
})

it('uses organisation branding for the lead profile and can retry only the failed journey read', async () => {
  mocks.organisation.organisationSettings = { primaryColour: '#ffdd00' }
  mocks.journey.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce([])
  setup()
  await act(async () => {})
  expect(screen.getByRole('region', { name: 'Lead profile' }).parentElement.style.getPropertyValue('--mobile-home-card-primary')).toBe('#ffdd00')
  expect(screen.getByRole('region', { name: 'Lead profile' }).parentElement.style.getPropertyValue('--mobile-home-card-ink')).toBe('#000000')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry journey' })))
  expect(screen.getByRole('list', { name: 'Buyer journey stages' })).toBeTruthy()
  expect(mocks.read).toHaveBeenCalledTimes(1)
  expect(mocks.journey).toHaveBeenCalledTimes(2)
})
