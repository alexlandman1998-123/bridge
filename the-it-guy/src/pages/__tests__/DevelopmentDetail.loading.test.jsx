// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ core: vi.fn(), summary: vi.fn(), section: vi.fn(), save: vi.fn(), users: vi.fn(), settings: vi.fn(), partners: vi.fn(), leads: vi.fn() }))
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({ role: 'developer', profile: { id: 'user' }, currentWorkspace: { id: 'org' }, can: () => true }) }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: null }))
vi.mock('../../domains/developments/overviewReadApi.js', () => ({ fetchDevelopmentOverview: mocks.core, fetchDevelopmentOverviewPage: mocks.summary }))
vi.mock('../../domains/developments/detailSectionReadApi.js', async original => ({ ...await original(), fetchDevelopmentDetailSection: mocks.section }))
vi.mock('../../services/developmentManagementAccessService.js', () => ({ getDevelopmentManagementAccess: async () => true }))
vi.mock('../../domains/partners/readApi.js', () => ({ fetchDeveloperPartnersWorkspace: mocks.partners }))
vi.mock('../../lib/settingsApi', async original => ({ ...await original(), fetchOrganisationSettings: mocks.settings, listOrganisationUsers: mocks.users }))
vi.mock('../../services/developerLeadService', async original => ({ ...await original(), listDeveloperLeadIntake: mocks.leads }))
vi.mock('../../services/developmentBuyerLeadService.js', () => ({ enrichDevelopmentLeadBuyerContacts: async (_org, rows) => rows }))
vi.mock('../../components/developments/DevelopmentChannelStatistics.jsx', () => ({ default: () => <div>Channel statistics</div> }))
vi.mock('../../lib/developmentDetailApi', async original => ({ ...await original(), saveDevelopmentDetails: mocks.save }))
import DevelopmentDetail from '../DevelopmentDetail.jsx'

const coreData = { development: { id: 'dev', name: 'Test Development', organisation_id: 'org' }, profile: {}, settings: {}, rows: [], transactionRows: [], stats: {}, listings: [], attorneyConfig: {}, bondConfig: {} }
const openPage = (path = '/developments/dev') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/developments/:developmentId" element={<DevelopmentDetail />} /></Routes></MemoryRouter>)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.core.mockResolvedValue(coreData)
  mocks.save.mockResolvedValue({})
  mocks.users.mockResolvedValue([])
  mocks.settings.mockResolvedValue({})
  mocks.partners.mockResolvedValue({ relationships: [], defaults: [] })
  mocks.leads.mockResolvedValue([])
})
afterEach(cleanup)

it('opens the overview, gates missing section data, and preserves configuration edits when a late catalogue read arrives', async () => {
  let finishCatalogue
  const catalogue = new Promise(resolve => { finishCatalogue = resolve })
  mocks.section.mockImplementation((_id, section) => section === 'catalogue' ? catalogue : Promise.resolve({ documents: [] }))
  openPage()
  await screen.findByRole('heading', { name: 'Test Development' })
  expect(mocks.core).toHaveBeenCalledWith('dev')
  expect(mocks.section).not.toHaveBeenCalled()
  expect(mocks.users).not.toHaveBeenCalled()
  expect(mocks.settings).not.toHaveBeenCalled()
  expect(mocks.partners).not.toHaveBeenCalled()
  expect(mocks.leads).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('tab', { name: 'Availability' }))
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Loading section data…')
  fireEvent.click(screen.getByRole('tab', { name: 'Configuration' }))
  await waitFor(() => expect(mocks.section).toHaveBeenCalledWith('dev', 'documents'))
  await screen.findByText('General Details')
  fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
  const name = screen.getByDisplayValue('Test Development')
  fireEvent.change(name, { target: { value: 'Unsaved development name' } })
  await act(async () => finishCatalogue({ productCatalogue: { unitTypes: [], floorplans: [], priceBooks: [], prices: [] }, structureNodes: [] }))
  expect(screen.getByDisplayValue('Unsaved development name').disabled).toBe(false)
  fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Configuration' }))
  expect(screen.getByDisplayValue('Unsaved development name').disabled).toBe(false)
  expect(mocks.section.mock.calls.filter(([, section]) => section === 'documents')).toHaveLength(1)
  mocks.core.mockResolvedValue({ ...coreData, development: { ...coreData.development, name: 'Unsaved development name' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('dev', expect.objectContaining({ name: 'Unsaved development name' })))
  await waitFor(() => expect(screen.getByDisplayValue('Unsaved development name').disabled).toBe(true))
  expect(mocks.section.mock.calls.every(([, section]) => ['inventory', 'catalogue', 'documents'].includes(section))).toBe(true)
})

it('keeps the overview accessible when a direct-linked section fails and lets the user retry', async () => {
  mocks.section.mockImplementationOnce(async (_id, section) => { if (section === 'documents') throw new Error('Document library offline'); return { inventoryLoaded: true } })
  mocks.section.mockRejectedValueOnce(new Error('Document library offline')).mockResolvedValue({ documents: [] })
  openPage('/developments/dev?tab=configuration')
  await screen.findByText('Document library offline')
  expect(screen.getByRole('heading', { name: 'Test Development' })).toBeTruthy()
  expect(screen.queryByText('General Details')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading this section' }))
  await screen.findByText('General Details')
  expect(mocks.section.mock.calls.filter(([, section]) => section === 'documents')).toHaveLength(2)
  expect(mocks.core).toHaveBeenCalledTimes(1)
})

it('shows whole-development counts from the summary while only 25 unit rows are present, and defers channel statistics', async () => {
  mocks.core.mockResolvedValue({ ...coreData, stats: { totalUnits: 5000 },
    development: { ...coreData.development, total_units_expected: 5000 },
    rows: Array.from({ length: 25 }, (_, i) => ({ unit: { id: `unit-${i}`, unit_number: String(i), status: 'Available' } })),
    overviewSummary: { totalUnits: 5000, available: 1000, inProgress: 3000, registered: 1000,
      stageCounts: { AVAIL: 1000, DEP: 1000, OTP: 1000, XFER: 1000, REG: 1000 }, onboardingAttentionCount: 400 },
    overviewAttentionRows: [], overviewRecentRows: [] })
  mocks.section.mockResolvedValue({ rows: [], inventoryLoaded: true })
  openPage()
  await screen.findByText(/All 5[\s,]000 units are configured/)
  expect(screen.getByText(/3[\s,]000 units are in active transactions/)).toBeTruthy()
  expect(screen.queryByText('Channel statistics')).toBeNull()
  expect(mocks.section).not.toHaveBeenCalled()
  expect(mocks.users).not.toHaveBeenCalled()
  expect(mocks.settings).not.toHaveBeenCalled()
  expect(mocks.partners).not.toHaveBeenCalled()
  expect(mocks.leads).not.toHaveBeenCalled()
  const details = screen.getByText('Listing channel statistics').parentElement
  // jsdom does not implement native details activation on a click.
  details.open = true
  fireEvent(details, new Event('toggle', { bubbles: true }))
  await screen.findByText('Channel statistics')
  expect(mocks.section).toHaveBeenCalledWith('dev', 'inventory')
})

it('does not carry an open stock workspace into another development overview', async () => {
  mocks.core.mockImplementation(async id => ({ ...coreData, development: { ...coreData.development, id, name: `Development ${id}` } }))
  mocks.section.mockResolvedValue({ inventoryLoaded: true, rows: [], documents: [], productCatalogue: {} })
  function SwitchDevelopment() {
    const navigate = useNavigate()
    return <button onClick={() => navigate('/developments/other')}>Open other development</button>
  }
  render(<MemoryRouter initialEntries={['/developments/dev?tab=availability']}>
    <SwitchDevelopment /><Routes><Route path="/developments/:developmentId" element={<DevelopmentDetail />} /></Routes>
  </MemoryRouter>)
  await screen.findByRole('heading', { name: 'Development dev' })
  await waitFor(() => expect(mocks.section).toHaveBeenCalledWith('dev', 'inventory'))
  fireEvent.click(screen.getByText('Open other development'))
  await screen.findByRole('heading', { name: 'Development other' })
  expect(screen.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')).toBe('true')
  expect(mocks.section.mock.calls.filter(([id]) => id === 'other')).toEqual([])
})
