// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RentalListingDetailPage from '../RentalListingDetailPage'
import { buildRentalListingOverview } from '../../../services/rentals/rentalListingOverviewModel'

const mocks = vi.hoisted(() => ({ publication: [], refreshPublication: vi.fn(), retryPublication: vi.fn(), settle: vi.fn(), publishP24: vi.fn(), publishPP: vi.fn(), load: vi.fn(), overview: vi.fn(), expiry: vi.fn(), gallery: vi.fn(), createLead: vi.fn(), withdrawP24: vi.fn(), withdrawPP: vi.fn(), previewP24: vi.fn(), previewPP: vi.fn(), channels: vi.fn(async () => ({ activity: [], errors: {} })), status: vi.fn(), reconcile: vi.fn(), statusUpdate: vi.fn(), scope: { organisationId: 'org-1', assignedAgentId: 'agent-1', scopeLevel: 'assigned' }, workspace: {} }))
vi.mock('../../../services/listings/listingOverviewPerformanceService', () => ({ getListingOverviewAnalytics: vi.fn(async ({ days }) => ({ windowDays: days, period: { startDate: '2026-09-14', endDate: '2026-10-13', completedDaysOnly: true } })) }))
vi.mock('../../../services/listings/listingInitialPublicationService', () => ({ INITIAL_LISTING_PUBLICATION_EVENT: 'itg:initial-listing-publication', readInitialListingChannelResults: () => mocks.publication, watchInitialListingPublication: () => () => {}, refreshListingPublicationResults: mocks.refreshPublication, retryFailedListingChannels: mocks.retryPublication, requireSettledListingPublication: mocks.settle }))
vi.mock('../../../services/rentals/rentalLeadService', () => ({ createRentalLead: mocks.createLead }))
vi.mock('../../../components/listings/WebsiteListingPublicationPanel', () => ({ default: () => null }))
vi.mock('../../../components/listings/KingdomWebsitePublicationChannel', () => ({ default: () => null }))
vi.mock('../../../services/rentals/rentalListingChannelService', () => ({ loadRentalListingChannels: mocks.channels, recordRentalPublicationEvent: vi.fn(async () => ({ id: 'event' })), runRentalPublicationAction: vi.fn(({ perform }) => perform()), getRentalPortalStatus: mocks.status, reconcileRentalPortalPublication:mocks.reconcile, updateRentalPortalStatus: mocks.statusUpdate }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../services/rentals/rentalWorkspaceScope', async (original) => ({ ...await original(), resolveRentalWorkspaceScope: () => mocks.scope }))
vi.mock('../../../services/rentals/rentalListingOverviewService', () => ({ loadRentalListingOverview: mocks.overview }))
vi.mock('../../../services/rentals/rentalListingDraftService', () => ({ getRentalListingForAgent: mocks.load, updateRentalListingDraft: vi.fn(), updateRentalProperty24Expiry:mocks.expiry, updateRentalListingGallery: mocks.gallery, previewPrivatePropertyRentalListing: mocks.previewPP, publishPrivatePropertyRentalListing: mocks.publishPP, expirePrivatePropertyRentalListing: mocks.withdrawPP, previewRentalProperty24Listing: mocks.previewP24, publishRentalProperty24Listing: mocks.publishP24, withdrawRentalProperty24Listing: mocks.withdrawP24 }))
beforeEach(() => { vi.resetAllMocks(); mocks.publication = []; mocks.refreshPublication.mockResolvedValue([]); mocks.settle.mockResolvedValue([]); mocks.channels.mockResolvedValue({ activity: [], errors: {} }); mocks.scope = { organisationId: 'org-1', assignedAgentId: 'agent-1', scopeLevel: 'assigned' }; mocks.workspace = {} })
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks() })

it('opens the saved rental document matrix from the listing Documents route', async () => {
  const listing = { id: 'listing-1', listingType: 'rental', title: 'Document rental', organisationId: 'org-1' }
  mocks.load.mockResolvedValue(listing)
  mocks.overview.mockResolvedValue(buildRentalListingOverview({ listing, documentMatrix: {
    issues: [], tenants: [], landlords: [{ id: 'owner', title: 'Landlord Example', rows: [{ id: 'disclosure', title: 'Document rental: Signed disclosure', state: 'missing', mode: 'preview', source: 'This property', documents: [] }] }],
  } }))
  render(<MemoryRouter initialEntries={['/agent/rentals/listings/listing-1/documents']}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /></Routes></MemoryRouter>)
  expect(await screen.findByText('Document rental: Signed disclosure')).toBeTruthy()
  expect(screen.getByText('Landlord Example')).toBeTruthy()
  expect(screen.getByRole('tab', { name: 'Documents' }).getAttribute('aria-selected')).toBe('true')
})

function mediaListing() {
  return { id: 'listing-1', listingCategory: 'rental', title: 'Media rental', addressLine1: '12 Example Road', updatedAt: '2026-10-04T00:00:00Z', organisationId: 'org-1',
    sellerCanonicalFacts: { marketingMedia: { videoLink: 'https://video.test/watch', virtualTourLink: 'https://tour.test/view' } },
    listingMedia: [
      { id: 'photo-a', media_type: 'image', file_url: 'https://images.test/a.jpg', sort_order: 0, is_cover: true },
      { id: 'photo-b', media_type: 'image', file_url: 'https://images.test/b.jpg', sort_order: 1, is_cover: false },
      { id: 'video', media_type: 'video', file_url: 'https://video.test/watch' },
      { id: 'tour', media_type: 'virtual_tour', file_url: 'https://tour.test/view' },
    ] }
}

function renderMedia(listing, tab='marketing') {
  mocks.load.mockResolvedValue(listing)
  mocks.overview.mockResolvedValue(buildRentalListingOverview({ listing }))
  return render(<MemoryRouter initialEntries={[`/agent/rentals/listings/listing-1/${tab}`]}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /></Routes></MemoryRouter>)
}

async function openPortalRequirements(channel = 'Property24') {
  await screen.findByRole('heading', { name: 'Listing Channels' })
  fireEvent.click(screen.getAllByRole('button', { name: 'Manage listing', hidden: true })[channel === 'Property24' ? 0 : 1])
  const dialog = await screen.findByRole('dialog', { name: `Manage ${channel} listing` })
  return { dialog, portal: within(dialog).getByRole('region', { name: `${channel} requirements` }) }
}

it('keeps duplicate checklist and portal cards off the rental Marketing page', async () => {
  renderMedia(mediaListing())
  await screen.findByRole('heading', { name: 'Listing Channels' })
  expect(screen.queryByRole('heading', { name: 'Listing checklist' })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Property24 requirements' })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Private Property requirements' })).toBeNull()
})

it('shows persisted partial results and retries the saved rental without creating or resending every website', async () => {
  const listing = { ...mediaListing(), listingStatus: 'active', sellerCanonicalFacts: { distribution: { selectedChannels: ['property24', 'private_property'] } } }
  mocks.publication = [{ key: 'property24', label: 'Property24', status: 'submitted' }, { key: 'private_property', label: 'Private Property', status: 'needs_attention', retryable: true, message: 'Fix the description.' }]
  let finish
  mocks.retryPublication.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  renderMedia(listing)
  const summary = await screen.findByRole('region', { name: 'Saved listing and advertising' })
  expect(within(summary).getByText(/Check the public advert before treating it as live/)).toBeTruthy()
  fireEvent.click(within(summary).getByRole('button', { name: 'Retry failed channels' }))
  await waitFor(() => expect(mocks.retryPublication).toHaveBeenCalledWith(expect.objectContaining({ listingId: listing.id, listingStatus: 'active', channels: ['property24', 'private_property'] })))
  expect(within(summary).getByRole('button', { name: 'Retry failed channels' }).disabled).toBe(true)
  finish([{ key: 'private_property', status: 'publishing' }])
  await screen.findByText(/Retrying only the failed websites/)
  expect(mocks.publishP24).not.toHaveBeenCalled()
})
it('keeps a saved rental visible when status checking fails and offers no unknown-request retry', async () => {
  mocks.publication = [{ key: 'property24', label: 'Property24', status: 'uncertain' }]
  mocks.refreshPublication.mockRejectedValue(new Error('Offline'))
  renderMedia(mediaListing())
  const summary = await screen.findByRole('region', { name: 'Saved listing and advertising' })
  expect(within(summary).queryByRole('button', { name: 'Retry failed channels' })).toBeNull()
  fireEvent.click(within(summary).getByRole('button', { name: 'Check status' }))
  await screen.findByText(/Your rental is saved. Advertising status could not be checked/)
  expect(screen.getByRole('heading', { name: '12 Example Road' })).toBeTruthy()
})
it('opens the rental advertising controls through the Marketing tab without a saved summary on Overview', async () => {
  mocks.publication = [{ key: 'property24', label: 'Property24', status: 'submitted' }]
  renderMedia({ ...mediaListing(), listingStatus: 'active' }, 'overview')
  await screen.findByRole('heading', { name: '12 Example Road' })
  expect(screen.queryByRole('region', { name: 'Saved listing and advertising' })).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: 'Marketing' }))
  expect(await screen.findByRole('heading', { name: 'Listing Channels' })).toBeTruthy()
  expect(screen.getByRole('region', { name: 'Saved listing and advertising' })).toBeTruthy()
})
it('checks durable initial requests before an alternative portal publish control sends anything', async () => {
  mocks.previewP24.mockResolvedValue({ report: { preview: { canSubmit: true, dataBlockers: [], technicalBlockers: [] } } })
  mocks.settle.mockRejectedValue(new Error('Check status before sending again.'))
  renderMedia(mediaListing())
  const { portal: requirements, dialog } = await openPortalRequirements()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Check requirements' }))
  await waitFor(() => expect(within(requirements).getByRole('status').textContent).toBe('Ready to submit'))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Publish advert' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Publish listing' }))
  await within(dialog).findByText('Check status before sending again.')
  expect(mocks.settle).toHaveBeenCalledWith('listing-1', ['property24'])
  expect(mocks.publishP24).not.toHaveBeenCalled()
})

it('deletes the selected cover photo and displays the confirmed replacement cover and saved links', async () => {
  const listing = mediaListing()
  let finish
  mocks.gallery.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  renderMedia(listing)
  await screen.findByRole('heading', { name: 'Media' })
  expect(screen.getByRole('link', { name: 'Open video' }).getAttribute('href')).toBe('https://video.test/watch')
  expect(screen.getByRole('link', { name: 'Open virtual tour' }).getAttribute('href')).toBe('https://tour.test/view')
  fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }))
  await waitFor(() => expect(mocks.gallery).toHaveBeenCalledTimes(1))
  const form = mocks.gallery.mock.calls[0][1]
  expect(form.galleryImages.map(image => image.id)).toEqual(['photo-b'])
  expect(form.coverImageId).toBe('photo-b')
  expect(form.expectedUpdatedAt).toBe(listing.updatedAt)
  expect(screen.getByRole('button', { name: 'Remove photo 1' }).disabled).toBe(true)
  finish({ listing: { ...listing, listingMedia: listing.listingMedia.filter(row => row.id !== 'photo-a').map(row => ({...row,is_cover:row.id==='photo-b'})) } })
  await screen.findByText('Photo removed from the rental listing.')
  expect(screen.getAllByRole('button', { name: /^Remove photo/ })).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Remove photo 1' }).disabled).toBe(false)
  expect(screen.getByText('Video added')).toBeTruthy()
})

it.each([
  ['Move photo 2 earlier', ['photo-b','photo-a'], 'photo-a'],
  ['Set photo 2 as cover', ['photo-a','photo-b'], 'photo-b'],
])('saves the specific photo action: %s', async (label, order, cover) => {
  const listing = mediaListing()
  mocks.gallery.mockResolvedValue({ listing })
  renderMedia(listing)
  fireEvent.click(await screen.findByRole('button', { name: label }))
  await waitFor(() => expect(mocks.gallery).toHaveBeenCalledTimes(1))
  expect(mocks.gallery.mock.calls[0][1].galleryImages.map(image=>image.id)).toEqual(order)
  expect(mocks.gallery.mock.calls[0][1].coverImageId).toBe(cover)
})

it('keeps photos visible and reports a failed save, then allows retrying', async () => {
  const listing = mediaListing()
  mocks.gallery.mockRejectedValueOnce(new Error('This rental changed. Reload before saving.')).mockResolvedValueOnce({ listing })
  renderMedia(listing)
  fireEvent.click(await screen.findByRole('button', { name: 'Remove photo 2' }))
  await screen.findByRole('alert')
  expect(screen.getByRole('alert').textContent).toContain('Reload before saving')
  expect(screen.getAllByRole('button', { name: /^Remove photo/ })).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }))
  await waitFor(() => expect(mocks.gallery).toHaveBeenCalledTimes(2))
})

it('renders the seven-section rental workspace and keeps listing context on overview actions', async () => {
  const listing = { id: 'listing-1', listingType: 'rental', listingTitle: 'Demo Rental', assignedAgentId: 'agent-1', assignedAgentName: 'Demo Agent', assignedAgentEmail: 'agent@example.test', organisationId: 'org-1' }
  mocks.load.mockResolvedValue(listing)
  mocks.overview.mockResolvedValue(buildRentalListingOverview({ listing }))
  render(<MemoryRouter initialEntries={['/agent/rentals/listings/listing-1']}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /><Route path="/agent/rentals/pipeline/leads" element={<p>Tenant lead form route</p>} /></Routes></MemoryRouter>)
  await screen.findByText('Overview up to date')
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Overview', 'Leads', 'Landlord', 'Marketing', 'Documents', 'Commission', 'Activity'])
  const agent = screen.getByTestId('listing-agent-reassignment')
  expect(agent.closest('.rental-overview-column')).not.toBeNull()
  expect(within(agent).getByText('agent@example.test')).toBeTruthy()
  expect(mocks.overview).toHaveBeenCalledWith(listing, mocks.scope, expect.objectContaining({ assignedAgentId: 'agent-1', includeAllOrganisationLeads: false }))
  fireEvent.click(screen.getByRole('tab', { name: 'Leads' }))
  await screen.findByRole('heading', { name: 'Leads for this listing' })
  expect(screen.getByRole('tab', { name: 'Leads' }).getAttribute('aria-selected')).toBe('true')
  fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
  await screen.findByText('Overview up to date')
  fireEvent.click(screen.getByRole('button', { name: 'Add Tenant Lead' }))
  const dialog = await screen.findByRole('dialog', { name: 'Add Tenant Lead' })
  expect(screen.queryByText('Tenant lead form route')).toBeNull()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
})

it('saves a tenant in the property popup and updates the listing table without navigation', async () => {
  const listing = { id: 'listing-1', listingType: 'rental', listingTitle: 'Demo Rental', suburb: 'Woodstock', organisationId: 'org-1', assignedAgentId: 'agent-1' }
  mocks.load.mockResolvedValue(listing)
  mocks.overview.mockResolvedValue(buildRentalListingOverview({ listing }))
  mocks.createLead.mockResolvedValue({ id: 'lead-new', name: 'Amy Tenant', role: 'tenant', stage: 'new', stageLabel: 'New', source: 'Manual', phone: '0123456789', createdAt: new Date().toISOString(), relationships: { listingId: 'listing-1' } })
  render(<MemoryRouter initialEntries={['/agent/rentals/listings/listing-1/leads']}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /></Routes></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Leads for this listing' })
  fireEvent.click(screen.getByRole('button', { name: 'Add Tenant Lead' }))
  const dialog = await screen.findByRole('dialog', { name: 'Add Tenant Lead' })
  expect(within(dialog).getByLabelText('Desired area').value).toBe('Woodstock')
  expect(within(dialog).queryByRole('button', { name: 'Landlord Leads' })).toBeNull()
  fireEvent.change(within(dialog).getByLabelText('First name'), { target: { value: 'Amy' } })
  fireEvent.change(within(dialog).getByLabelText('Phone'), { target: { value: '0123456789' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add Tenant Lead' }))
  await waitFor(() => expect(mocks.createLead).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'listing-1', role: 'tenant', desiredArea: 'Woodstock' }), expect.objectContaining({ organisationId: 'org-1', assignedAgent: expect.objectContaining({ userId: 'agent-1' }) })))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(within(screen.getByRole('table')).getByText('Amy Tenant')).toBeTruthy()
  expect(screen.getByRole('tab', { name: 'Leads' }).getAttribute('aria-selected')).toBe('true')
})

it('keeps the tenant form and its values available when saving fails, then permits a retry', async () => {
  const listing = { id: 'listing-1', listingType: 'rental', listingTitle: 'Demo Rental', suburb: 'Woodstock', organisationId: 'org-1', assignedAgentId: 'agent-1' }
  mocks.load.mockResolvedValue(listing)
  mocks.overview.mockResolvedValue(buildRentalListingOverview({ listing }))
  mocks.createLead.mockRejectedValueOnce(new Error('Unable to save; please retry.')).mockResolvedValueOnce({ id: 'retry-lead', name: 'Amy', stage: 'new', stageLabel: 'New', source: 'Manual', createdAt: new Date().toISOString() })
  render(<MemoryRouter initialEntries={['/agent/rentals/listings/listing-1/leads']}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /></Routes></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Leads for this listing' })
  fireEvent.click(screen.getByRole('button', { name: 'Add Tenant Lead' }))
  const dialog = await screen.findByRole('dialog', { name: 'Add Tenant Lead' })
  fireEvent.change(within(dialog).getByLabelText('First name'), { target: { value: 'Amy' } })
  fireEvent.change(within(dialog).getByLabelText('Phone'), { target: { value: '0123456789' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add Tenant Lead' }))
  await within(dialog).findByText('Unable to save; please retry.')
  expect(within(dialog).getByLabelText('First name').value).toBe('Amy')
  expect(screen.getByRole('heading', { name: 'No leads yet' })).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add Tenant Lead' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(mocks.createLead).toHaveBeenCalledTimes(2)
  expect(within(screen.getByRole('table')).getByText('Amy')).toBeTruthy()
})

it('uses one clearly named requirements check for each rental portal', async () => {
  const listing = { id: 'listing-1', listingType: 'rental', listingTitle: 'Demo Rental', organisationId: 'org-1', assignedAgentId: 'agent-1' }
  mocks.load.mockResolvedValue(listing)
  mocks.overview.mockResolvedValue(buildRentalListingOverview({ listing }))
  render(<MemoryRouter initialEntries={['/agent/rentals/listings/listing-1/marketing']}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /></Routes></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Listing Channels' })
  expect(screen.getAllByText('Check listing requirements')).toHaveLength(2)
  expect(screen.queryByText('Check readiness')).toBeNull()
})

it('withdraws the selected rental portal, keeps the other channel and reloads saved status', async () => {
  const listing = { id: 'listing-1', listingType: 'rental', listingTitle: 'Demo Rental', organisationId: 'org-1', assignedAgentId: 'agent-1', property24Status: 'published', property24Reference: '1234', privatePropertyStatus: 'published', privatePropertyReference: 'R123' }
  mocks.load.mockResolvedValue(listing)
  mocks.overview.mockResolvedValue(buildRentalListingOverview({ listing }))
  mocks.withdrawP24.mockResolvedValue({})
  vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  render(<MemoryRouter initialEntries={['/agent/rentals/listings/listing-1/marketing']}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /></Routes></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Listing Channels' })
  const withdraw = screen.getAllByRole('button', { name: 'Withdraw listing', hidden: true })[0]
  await waitFor(() => expect(withdraw.disabled).toBe(false))
  fireEvent.click(withdraw)
  expect(mocks.withdrawP24).not.toHaveBeenCalled()
  fireEvent.click(withdraw)
  await waitFor(() => expect(mocks.withdrawP24).toHaveBeenCalledWith('listing-1'))
  await screen.findByText('Property24 accepted the withdrawal request. Refresh status to confirm removal.')
  expect(mocks.withdrawPP).not.toHaveBeenCalled()
  expect(mocks.load.mock.calls.length).toBeGreaterThan(1)
})
it('shows a failed Private Property withdrawal without reporting success or reloading', async () => {
  const listing = { id: 'listing-1', listingType: 'rental', listingTitle: 'Demo Rental', organisationId: 'org-1', assignedAgentId: 'agent-1', privatePropertyStatus: 'published', privatePropertyReference: 'R123' }
  mocks.load.mockResolvedValue(listing)
  mocks.overview.mockResolvedValue(buildRentalListingOverview({ listing }))
  mocks.withdrawPP.mockRejectedValue(new Error('Portal unavailable; please retry.'))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<MemoryRouter initialEntries={['/agent/rentals/listings/listing-1/marketing']}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /></Routes></MemoryRouter>)
  await screen.findByRole('heading', { name: 'Listing Channels' })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Withdraw listing', hidden: true }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw listing', hidden: true }))
  await screen.findByText('Portal unavailable; please retry.')
  expect(mocks.withdrawPP).toHaveBeenCalledWith('listing-1')
  expect(mocks.withdrawP24).not.toHaveBeenCalled()
  expect(mocks.load).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('Rental withdrawn from Private Property.')).toBeNull()
  expect(screen.queryByRole('region',{name:'Private Property requirements'})).toBeNull()
})












it('renders cached portal reference, status and publication history and sends a selected rental status', async () => {
  mocks.channels.mockResolvedValue({errors:{},property24:{lifecycle:{state:'active',listingNumber:'8765',isOnPortal:true,property24ListingUrl:'https://www.property24.com/to-rent/demo/8765'}},activity:[{id:'accepted-1',activity_type:'listing_channel_publication_accepted',created_at:'2026-10-04T10:00:00Z',metadata:{channel:'property24'}}]})
  mocks.statusUpdate.mockResolvedValue({status:'SUBMITTED'})
  vi.spyOn(window,'confirm').mockReturnValue(true)
  renderMedia(mediaListing())
  await screen.findByText('8765')
  expect(screen.getAllByRole('link',{name:'View listing'})[0].getAttribute('href')).toBe('https://www.property24.com/to-rent/demo/8765')
  expect(screen.getByText(/^Accepted ·/)).toBeTruthy()
  expect(mocks.status).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole('button',{name:'Manage listing',hidden:true})[0])
  const dialog=await screen.findByRole('dialog',{name:'Manage Property24 listing'})
  fireEvent.change(within(dialog).getByLabelText('Rental portal status'),{target:{value:'Rented'}})
  fireEvent.click(within(dialog).getByRole('button',{name:'Send status change'}))
  await waitFor(()=>expect(mocks.statusUpdate).toHaveBeenCalledWith('listing-1','property24','Rented'))
  await waitFor(() => expect(within(screen.getByRole('dialog',{name:'Manage Property24 listing'})).getAllByRole('status').some(status => status.textContent === 'The portal accepted the status request. Refresh status to confirm its public state.')).toBe(true))
  expect(mocks.channels.mock.calls.length).toBeGreaterThan(1)
})

it('shows refresh errors inside the open portal settings and lets the user retry', async () => {
  mocks.channels.mockResolvedValue({errors:{},property24:{lifecycle:{state:'active',listingNumber:'8765',isOnPortal:true}},activity:[]})
  mocks.status.mockRejectedValueOnce(new Error('Portal credentials unavailable')).mockResolvedValueOnce({lifecycle:{state:'active',listingNumber:'8765',isOnPortal:true}})
  renderMedia(mediaListing())
  await screen.findByText('8765')
  fireEvent.click(screen.getAllByRole('button',{name:'Manage listing',hidden:true})[0])
  let dialog=await screen.findByRole('dialog',{name:'Manage Property24 listing'})
  fireEvent.click(within(dialog).getByRole('button',{name:'Check latest status'}))
  await waitFor(()=>expect(within(dialog).getAllByRole('alert').some(alert => alert.textContent.includes('Portal credentials unavailable'))).toBe(true))
  expect(mocks.status).toHaveBeenCalledWith('listing-1','property24',{refresh:true})
  fireEvent.click(within(dialog).getByRole('button',{name:'Check latest status'}))
  await waitFor(()=>expect(mocks.status).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(within(screen.getByRole('dialog',{name:'Manage Property24 listing'})).getAllByRole('status').some(status => status.textContent === 'Property24 portal status refreshed.')).toBe(true))
})

it('shows all Private Property requirements rather than a generic blocked message', async () => {
  mocks.channels.mockResolvedValue({errors:{},activity:[]})
  mocks.previewPP.mockResolvedValue({ready:false,readiness:{ready:false,blockers:['missing_description','missing_private_property_agent_id'],preview:{dataBlockers:['missing_description']}}})
  renderMedia(mediaListing())
  const { portal, dialog } = await openPortalRequirements('Private Property')
  fireEvent.click(within(dialog).getByRole('button',{name:'Check requirements'}))
  await within(portal).findByText('Assigned agent needs a portal mapping')
  expect(within(portal).getByText('Complete the listing description')).toBeTruthy()
  expect(screen.getAllByRole('button',{name:'Publish',hidden:true}).every(button=>button.disabled)).toBe(true)
  expect(screen.queryByText(/Review \d+ remaining listing details/)).toBeNull()
})
it('shows Property24 failed photos and focuses the exact expiry field', async () => {
  mocks.channels.mockResolvedValue({errors:{},activity:[]})
  mocks.previewP24.mockResolvedValue({report:{preview:{canSubmit:false,dataBlockers:['missing_expiry_date'],imageByteLoad:{summary:{loaded:2,failed:1}}}}})
  renderMedia(mediaListing())
  const { portal, dialog } = await openPortalRequirements()
  fireEvent.click(within(dialog).getByRole('button',{name:'Check requirements'}))
  await within(portal).findByText('Property24 expiry date must be in the future')
  expect(within(portal).getByText('Photos prepared: 2. Photos that failed: 1.')).toBeTruthy()
  fireEvent.click(within(portal).getByRole('button',{name:'Go to expiry date'}))
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Property24 expiry date')))
})
it('ignores a late ready response after photos change and requires a fresh check', async () => {
  mocks.channels.mockResolvedValue({errors:{},activity:[]})
  let completeCheck
  mocks.previewPP.mockImplementationOnce(()=>new Promise(resolve=>{completeCheck=resolve}))
  const listing=mediaListing()
  mocks.gallery.mockResolvedValue({listing:{...listing,updatedAt:'2026-10-04T11:00:00Z',listingMedia:listing.listingMedia.filter(row=>row.id!=='photo-b')}})
  renderMedia(listing)
  const { dialog } = await openPortalRequirements('Private Property')
  fireEvent.click(within(dialog).getByRole('button',{name:'Check requirements'}))
  await waitFor(()=>expect(mocks.previewPP).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button',{name:'Remove photo 2'}))
  await screen.findByText('Photo removed from the rental listing.')
  await act(async()=>completeCheck({ready:true,readiness:{ready:true,blockers:[]}}))
  const portal=screen.getByRole('region',{name:'Private Property requirements'})
  expect(within(portal).getByRole('status').textContent).toBe('Not checked')
  expect(screen.getAllByRole('button',{name:'Publish',hidden:true}).every(button=>button.disabled)).toBe(true)
})
it('lets a failed check retry without carrying forward an old ready result', async () => {
  mocks.channels.mockResolvedValue({errors:{},activity:[]})
  mocks.previewP24.mockRejectedValueOnce(new Error('Readiness service unavailable')).mockResolvedValueOnce({report:{preview:{canSubmit:true,dataBlockers:[],technicalBlockers:[]}}})
  renderMedia(mediaListing())
  const { portal, dialog } = await openPortalRequirements()
  fireEvent.click(within(dialog).getByRole('button',{name:'Check requirements'}))
  await within(dialog).findByRole('alert')
  expect(within(portal).getByRole('status').textContent).toBe('Check failed')
  fireEvent.click(within(dialog).getByRole('button',{name:'Check requirements'}))
  await waitFor(()=>expect(within(portal).getByRole('status').textContent).toBe('Ready to submit'))
  expect(within(portal).queryByRole('alert')).toBeNull()
})
it('disables publishing immediately when a previously ready portal is rechecked', async () => {
  mocks.channels.mockResolvedValue({errors:{},activity:[]})
  let finish
  mocks.previewP24.mockResolvedValueOnce({report:{preview:{canSubmit:true,dataBlockers:[],technicalBlockers:[]}}}).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
  renderMedia(mediaListing())
  const { portal, dialog } = await openPortalRequirements()
  fireEvent.click(within(dialog).getByRole('button',{name:'Check requirements'}))
  await waitFor(()=>expect(within(portal).getByRole('status').textContent).toBe('Ready to submit'))
  expect(screen.getAllByRole('button',{name:'Publish',hidden:true})[0].disabled).toBe(false)
  fireEvent.click(within(dialog).getByRole('button',{name:'Check requirements'}))
  expect(screen.getAllByRole('button',{name:'Publish',hidden:true})[0].disabled).toBe(true)
  await act(async()=>finish({report:{preview:{canSubmit:false,dataBlockers:['missing_description']}}}))
  expect(within(portal).getByRole('status').textContent).toBe('Needs attention')
})
it('keeps an expiry-save error separate from portal checks and makes View channels read-only', async () => {
  mocks.channels.mockResolvedValue({errors:{},activity:[]})
  renderMedia(mediaListing())
  await screen.findByRole('heading',{name:'Listing Channels'})
  fireEvent.click(screen.getByRole('button',{name:'Save expiry'}))
  await screen.findByText('Choose a Property24 expiry date before saving.')
  expect(screen.queryByRole('region',{name:'Property24 requirements'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'View channels'}))
  expect(mocks.previewP24).not.toHaveBeenCalled();expect(mocks.previewPP).not.toHaveBeenCalled()
})

it('discards a previous organisation response after switching workspaces', async () => {
  mocks.overview.mockImplementation(async listing => buildRentalListingOverview({ listing }))
  let finishOld
  mocks.load.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
  const tree = <MemoryRouter initialEntries={['/agent/rentals/listings/listing-1/marketing']}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /></Routes></MemoryRouter>
  const view = render(tree)
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
  const next = { ...mediaListing(), organisationId: 'org-2', title: 'Current organisation rental', addressLine1: '14 Current Road' }
  mocks.load.mockResolvedValue(next)
  mocks.scope = { ...mocks.scope, organisationId: 'org-2' }
  mocks.workspace = { currentWorkspace: { id: 'org-2' } }
  view.rerender(<MemoryRouter initialEntries={['/agent/rentals/listings/listing-1/marketing']}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /></Routes></MemoryRouter>)
  await screen.findByRole('heading', { name: '14 Current Road', level: 1 })
  await act(async () => finishOld({ ...mediaListing(), title: 'Previous organisation rental', addressLine1: '16 Previous Road' }))
  expect(screen.queryByRole('heading', { name: '16 Previous Road', level: 1 })).toBeNull()
  expect(screen.getByRole('heading', { name: '14 Current Road', level: 1 })).toBeTruthy()
})

it('clears a loaded rental immediately when branch permissions change', async () => {
  const view = renderMedia(mediaListing())
  await screen.findByRole('heading', { name: 'Media' })
  mocks.load.mockResolvedValue(null)
  mocks.scope = { ...mocks.scope, branchId: 'branch-2', listingBranchId: 'branch-2', scopeLevel: 'branch', includeAllOrganisationListings: true }
  mocks.workspace = { currentMembership: { branchId: 'branch-2' } }
  view.rerender(<MemoryRouter initialEntries={['/agent/rentals/listings/listing-1/marketing']}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /></Routes></MemoryRouter>)
  expect(screen.queryByRole('button', { name: 'Remove photo 1' })).toBeNull()
  await screen.findByText('Rental listing not found.')
})

it('keeps the latest load when requests finish in reverse order in the same workspace', async () => {
  let finishOld
  mocks.overview.mockImplementation(async listing => buildRentalListingOverview({ listing }))
  mocks.load.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
  const tree = () => <MemoryRouter initialEntries={['/agent/rentals/listings/listing-1/marketing']}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /></Routes></MemoryRouter>
  const view = render(tree())
  await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1))
  mocks.load.mockResolvedValue({ ...mediaListing(), title: 'Latest response', addressLine1: '20 Latest Road' })
  mocks.scope = { ...mocks.scope }
  mocks.workspace = { refreshed: true }
  view.rerender(tree())
  await screen.findByRole('heading', { name: '20 Latest Road', level: 1 })
  await act(async () => finishOld({ ...mediaListing(), title: 'Stale response', addressLine1: '22 Stale Road' }))
  expect(screen.queryByRole('heading', { name: '22 Stale Road', level: 1 })).toBeNull()
  expect(screen.getByRole('heading', { name: '20 Latest Road', level: 1 })).toBeTruthy()
})

it('does not apply a photo save completion to the next organisation', async () => {
  let finish
  const view = renderMedia(mediaListing())
  mocks.gallery.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  fireEvent.click(await screen.findByRole('button', { name: 'Remove photo 1' }))
  await waitFor(() => expect(mocks.gallery).toHaveBeenCalledTimes(1))
  mocks.scope = { ...mocks.scope, organisationId: 'org-2' }
  mocks.workspace = { currentWorkspace: { id: 'org-2' } }
  const next = { ...mediaListing(), organisationId: 'org-2', title: 'Next agency rental', addressLine1: '24 Next Road' }
  mocks.load.mockResolvedValue(next)
  view.rerender(<MemoryRouter initialEntries={['/agent/rentals/listings/listing-1/marketing']}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /></Routes></MemoryRouter>)
  await screen.findByRole('heading', { name: '24 Next Road', level: 1 })
  await act(async () => finish({ listing: { ...mediaListing(), title: 'Previous agency save', addressLine1: '26 Previous Saved Road' } }))
  expect(screen.queryByRole('heading', { name: '26 Previous Saved Road', level: 1 })).toBeNull()
  expect(screen.queryByText('Photo removed from the rental listing.')).toBeNull()
  expect(screen.getAllByRole('button', { name: /^Remove photo/ })).toHaveLength(2)
})

it('offers reconciliation without a lost reference and keeps publish and status changes blocked',async()=>{
 mocks.channels.mockResolvedValue({errors:{},property24:{submissionAttempt:{requiresReconciliation:true,message:'Previous request unconfirmed'}},activity:[]})
 mocks.reconcile.mockResolvedValue({status:'UNCERTAIN',message:'No unique portal match yet'})
 renderMedia(mediaListing())
 await screen.findByText('Outcome unconfirmed')
 const publish=screen.getAllByRole('button',{name:'Publish',hidden:true})[0]
 expect(publish.disabled).toBe(true)
 fireEvent.click(screen.getAllByRole('button',{name:'Manage listing',hidden:true})[0])
 const dialog=await screen.findByRole('dialog',{name:'Manage Property24 listing'})
 expect(within(dialog).getByRole('button',{name:'Send status change'}).disabled).toBe(true)
 fireEvent.click(within(dialog).getByRole('button',{name:'Reconcile previous request'}))
 await waitFor(()=>expect(mocks.reconcile).toHaveBeenCalledWith('listing-1','property24'))
 await within(dialog).findByText('No unique portal match yet')
 expect(mocks.statusUpdate).not.toHaveBeenCalled()
})

 it('saves only the expiry and listing version on an incomplete rental', async () => {
 const listing=mediaListing();mocks.expiry.mockResolvedValue({listing})
 renderMedia(listing)
 fireEvent.change(await screen.findByLabelText('Property24 expiry date'),{target:{value:'2028-04-30'}})
 fireEvent.click(screen.getByRole('button',{name:'Save expiry'}))
 await screen.findByText('Property24 expiry date saved.')
 expect(mocks.expiry).toHaveBeenCalledWith(listing.id,{expiryDate:'2028-04-30',expectedUpdatedAt:listing.updatedAt},expect.objectContaining({organisationId:'org-1',assignedAgentId:'agent-1'}))
 })

 it('keeps a saved edit on the rental workspace without the redundant Listing saved card', async () => {
  const listing = mediaListing()
  mocks.load.mockResolvedValue(listing)
  mocks.overview.mockResolvedValue(buildRentalListingOverview({ listing }))
  render(<MemoryRouter initialEntries={[{ pathname: '/agent/rentals/listings/listing-1/marketing', state: { rentalListingChangesNotSent: true } }]}><Routes><Route path="/agent/rentals/listings/:listingId/:detailTab?" element={<RentalListingDetailPage />} /></Routes></MemoryRouter>)
  const heading = await screen.findByRole('heading', { name: '12 Example Road', level: 1 })
  expect(within(heading.closest('header')).queryByText('Media rental')).toBeNull()
  expect(within(heading.closest('header')).getAllByText('12 Example Road')).toHaveLength(1)
  expect(screen.queryByRole('region', { name: 'Saved listing and advertising' })).toBeNull()
  expect(screen.queryByText(/This save did not update your public adverts/)).toBeNull()
  expect(mocks.publishP24).not.toHaveBeenCalled()
  expect(screen.getByRole('tab', { name: 'Landlord' })).toBeTruthy()
  expect(screen.getByRole('tab', { name: 'Documents' })).toBeTruthy()
 })


it('updates an existing Private Property rental with a fresh automatic check and no extra confirmation', async () => {
  const listing = { ...mediaListing(), privatePropertyReference: 'R123', privatePropertyStatus: 'active' }
  mocks.previewPP.mockResolvedValue({ ready: true, readiness: { ready: true, blockers: [] } })
  mocks.publishPP.mockResolvedValue({ status: 'SUBMITTED', report: { privatePropertyReference: 'R123' } })
  mocks.status.mockResolvedValue({ monitor: { externalStatus: 'submitted', statusProbe: { privatePropertyRef: 'R123' } } })
  const confirm = vi.spyOn(window, 'confirm')
  renderMedia(listing)
  const { dialog } = await openPortalRequirements('Private Property')
  const update = within(dialog).getByRole('button', { name: 'Save and update Private Property' })
  expect(update.disabled).toBe(false)
  fireEvent.click(update)
  await within(dialog).findByText(/^Processing\. Private Property accepted the update/)
  expect(mocks.previewPP).toHaveBeenCalledOnce()
  expect(mocks.publishPP).toHaveBeenCalledExactlyOnceWith('listing-1')
  expect(mocks.previewPP.mock.invocationCallOrder[0]).toBeLessThan(mocks.publishPP.mock.invocationCallOrder[0])
  expect(mocks.status).toHaveBeenCalledWith('listing-1', 'private_property', { refresh: true })
  expect(mocks.publishP24).not.toHaveBeenCalled()
  expect(confirm).not.toHaveBeenCalled()
})
it('keeps a rental update unsent when its automatic check finds missing details', async () => {
  mocks.previewPP.mockResolvedValue({ ready: false, readiness: { ready: false, blockers: ['missing_description'] } })
  renderMedia({ ...mediaListing(), privatePropertyReference: 'R123', privatePropertyStatus: 'active' })
  const { dialog } = await openPortalRequirements('Private Property')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save and update Private Property' }))
  await within(dialog).findByText(/Private Property needs attention.*Complete the listing description/)
  expect(mocks.publishPP).not.toHaveBeenCalled()
  expect(mocks.status).not.toHaveBeenCalled()
})
