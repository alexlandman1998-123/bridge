// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ core: vi.fn(), summary: vi.fn(), section: vi.fn(), save: vi.fn(), createEvent: vi.fn(), users: vi.fn(), settings: vi.fn(), partners: vi.fn(), leads: vi.fn() }))
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
vi.mock('../../lib/developmentDetailApi', async original => ({ ...await original(), saveDevelopmentDetails: mocks.save, createDevelopmentMarketingEvent: mocks.createEvent }))
vi.mock('../../components/developments/DevelopmentWebsiteAnalytics.jsx', () => ({ default: () => <div>Website analytics</div> }))
vi.mock('../../components/developments/DevelopmentMarketingCampaigns.jsx', () => ({ default: ({ initialEventId }) => <div role="region" aria-label="Development campaign preparation">{initialEventId}</div> }))
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
  await waitFor(() => expect(mocks.section).toHaveBeenCalledWith('dev', 'channelStatistics'))
  expect(mocks.section.mock.calls.every(([, section]) => section === 'channelStatistics')).toBe(true)
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
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('dev', expect.objectContaining({ name: 'Unsaved development name' }), { reportReceipt: true }))
  await waitFor(() => expect(screen.getByDisplayValue('Unsaved development name').disabled).toBe(true))
  expect(mocks.section.mock.calls.every(([, section]) => ['channelStatistics', 'inventory', 'catalogue', 'documents'].includes(section))).toBe(true)
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

it('shows whole-development counts and standalone channel statistics without loading the full inventory', async () => {
  mocks.core.mockResolvedValue({ ...coreData, stats: { totalUnits: 5000 },
    development: { ...coreData.development, total_units_expected: 5000 },
    rows: Array.from({ length: 25 }, (_, i) => ({ unit: { id: `unit-${i}`, unit_number: String(i), status: 'Available' } })),
    overviewSummary: { totalUnits: 5000, available: 1000, inProgress: 3000, registered: 1000,
      stageCounts: { AVAIL: 1000, DEP: 1000, OTP: 1000, XFER: 1000, REG: 1000 }, onboardingAttentionCount: 400 },
    overviewAttentionRows: [], overviewRecentRows: [] })
  mocks.section.mockResolvedValue({ channelStatisticsListings: [], channelStatisticsWebsitePublished: false })
  openPage()
  await screen.findByText(/All 5[\s,]000 units are configured/)
  expect(screen.getByText(/3[\s,]000 units are in active transactions/)).toBeTruthy()
  await screen.findByText('Channel statistics')
  expect(screen.getByRole('heading', { name: 'Listing channel statistics' }).closest('details')).toBeNull()
  expect(mocks.section.mock.calls.map(([, section]) => section)).toEqual(['channelStatistics'])
  expect(mocks.users).not.toHaveBeenCalled()
  expect(mocks.settings).not.toHaveBeenCalled()
  expect(mocks.partners).not.toHaveBeenCalled()
  expect(mocks.leads).not.toHaveBeenCalled()
})

it('keeps the overview usable if channel statistics fail and retries only their data', async () => {
  mocks.section.mockRejectedValueOnce(new Error('Statistics offline')).mockResolvedValue({ channelStatisticsListings: [] })
  openPage()
  await screen.findByText('Statistics offline')
  expect(screen.getByRole('heading', { name: 'Development Health' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading this section' }))
  await screen.findByText('Channel statistics')
  expect(mocks.section.mock.calls.map(([, section]) => section)).toEqual(['channelStatistics', 'channelStatistics'])
  expect(mocks.core).toHaveBeenCalledTimes(1)
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
  await waitFor(() => expect(mocks.section).toHaveBeenCalledWith('other', 'channelStatistics'))
  expect(mocks.section.mock.calls.filter(([id]) => id === 'other')).toEqual([['other', 'channelStatistics']])
})

it('keeps development edits available after a required save fails and only confirms a successful retry', async () => {
  mocks.section.mockResolvedValue({ documents: [], productCatalogue: {} })
  mocks.save.mockRejectedValueOnce(new Error('The development profile could not be saved.'))
  openPage('/developments/dev?tab=configuration')
  await screen.findByText('General Details')
  fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
  fireEvent.change(screen.getByDisplayValue('Test Development'), { target: { value: 'Retry this name' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  await screen.findByText('The development profile could not be saved.')
  expect(screen.queryByText('General details updated.')).toBeNull()
  expect(screen.getByDisplayValue('Retry this name').disabled).toBe(false)
  expect(mocks.core).toHaveBeenCalledTimes(1)
  mocks.core.mockResolvedValue({ ...coreData, development: { ...coreData.development, name: 'Retry this name' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  await screen.findByText('General details updated.')
  await waitFor(() => expect(screen.getByDisplayValue('Retry this name').disabled).toBe(true))
  expect(mocks.save).toHaveBeenCalledTimes(2)
})

it('preserves an unsaved draft and its original revisions when a newer development arrives', async () => {
  const original = { ...coreData, development: { ...coreData.development, revision: 0 }, profile: { revision: 0 } }
  mocks.core.mockResolvedValue(original)
  mocks.section.mockResolvedValue({ documents: [], productCatalogue: {} })
  openPage('/developments/dev?tab=configuration')
  await screen.findByText('General Details')
  fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }))
  fireEvent.change(screen.getByDisplayValue('Test Development'), { target: { value: 'Keep my draft' } })
  mocks.core.mockResolvedValue({ ...original, development: { ...original.development, name: 'Changed by another person', revision: 1 }, profile: { revision: 1 } })
  await act(async () => { window.dispatchEvent(new Event('itg:developments-changed')) })
  await waitFor(() => expect(mocks.core).toHaveBeenCalledTimes(2))
  expect(screen.getByDisplayValue('Keep my draft').disabled).toBe(false)
  mocks.save.mockRejectedValueOnce(Object.assign(new Error('This development changed after you opened it.'), { code: 'DEVELOPMENT_CONFLICT' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
  await screen.findByText('This development changed after you opened it.')
  expect(mocks.save).toHaveBeenLastCalledWith('dev', expect.objectContaining({ name: 'Keep my draft', expectedDevelopmentRevision: 0, expectedProfileRevision: 0 }), { reportReceipt: true })
  expect(screen.getByDisplayValue('Keep my draft').disabled).toBe(false)
  expect(screen.queryByText('General details updated.')).toBeNull()
})

it('keeps the confirmed live website status when unpublishing is rejected', async () => {
  const profile = { revision: 0, marketingContent: { listingConfiguration: { publicVisibility: true, marketingStatus: 'live' } } }
  mocks.core.mockResolvedValue({ ...coreData, profile })
  mocks.section.mockResolvedValue({ documents: [], profile })
  mocks.save.mockRejectedValueOnce(new Error('Unpublish denied'))
  openPage('/developments/dev?tab=marketing&marketingSection=website')
  await screen.findAllByText('Website: Live')
  fireEvent.click(screen.getByRole('button', { name: 'Unpublish website' }))
  await screen.findByText('Unpublish denied')
  expect(screen.getAllByText('Website: Live').length).toBeGreaterThan(0)
  expect(screen.queryByText('Website: Not published')).toBeNull()
  expect(screen.getByRole('button', { name: 'Unpublish website' }).disabled).toBe(false)
})
it('loads events on entry and retries a failed calendar without reloading the development', async () => {
  let offline = true
  mocks.section.mockImplementation(async (_id, section) => {
    if (section === 'marketingEvents') {
      if (offline) throw Error('Calendar access unavailable')
      return { marketingEvents: [{ id: 'event', title: 'Recovered show day', startsAt: '2030-11-20T10:00:00Z' }] }
    }
    return { documents: [] }
  })
  openPage('/developments/dev?tab=marketing&marketingSection=events')
  await screen.findByText(/Calendar access unavailable/)
  expect(screen.queryByText(/No upcoming events/)).toBeNull()
  expect(mocks.section).toHaveBeenCalledWith('dev', 'marketingEvents', { organisationId: 'org' })
  offline = false
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading events' }))
  await screen.findByRole('heading', { name: 'Recovered show day' })
  expect(mocks.core).toHaveBeenCalledTimes(1)
})
it('closes a successfully saved event even when its follow-up list refresh fails', async () => {
  let saved = false
  mocks.section.mockImplementation(async (_id, section) => {
    if (section === 'marketingEvents' && saved) throw Error('Calendar refresh offline')
    return { documents: [], marketingEvents: [] }
  })
  mocks.createEvent.mockImplementation(async value => {
    saved = true
    return { ...value, id: 'created-event' }
  })
  openPage('/developments/dev?tab=marketing&marketingSection=events')
  await screen.findByText(/No upcoming events/)
  fireEvent.click(screen.getByRole('button', { name: /Create show day/ }))
  fireEvent.change(screen.getByLabelText('Event title'), { target: { value: 'Saved event' } })
  fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2030-11-20T10:00' } })
  fireEvent.submit(screen.getByLabelText('Event title').closest('form'))
  await screen.findByText('Marketing event created.')
  await screen.findByText(/Calendar refresh offline/)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Saved event' })).toBeTruthy()
  expect(mocks.createEvent).toHaveBeenCalledTimes(1)
  expect(mocks.core).toHaveBeenCalledTimes(1)
})
it('connects the event invitation action to campaigns with the selected event identity',async()=>{
 mocks.section.mockResolvedValue({documents:[],marketingEvents:[{id:'launch-event',title:'Launch evening',status:'upcoming',startsAt:'2030-11-20T10:00:00Z'}]})
 openPage('/developments/dev?tab=marketing&marketingSection=events')
 fireEvent.click(await screen.findByRole('button',{name:'Prepare invitation'}))
 expect(await screen.findByRole('region',{name:'Development campaign preparation'})).toHaveProperty('textContent','launch-event')
})
