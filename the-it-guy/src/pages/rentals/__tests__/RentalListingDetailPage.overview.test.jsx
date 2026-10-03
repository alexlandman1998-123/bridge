// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RentalListingDetailPage from '../RentalListingDetailPage'
import { buildRentalListingOverview } from '../../../services/rentals/rentalListingOverviewModel'

const mocks = vi.hoisted(() => ({ load: vi.fn(), overview: vi.fn(), createLead: vi.fn(), withdrawP24: vi.fn(), withdrawPP: vi.fn(), scope: { organisationId: 'org-1', assignedAgentId: 'agent-1', scopeLevel: 'assigned' }, workspace: {} }))
vi.mock('../../../services/rentals/rentalLeadService', () => ({ createRentalLead: mocks.createLead }))
vi.mock('../../../components/listings/WebsiteListingPublicationPanel', () => ({ default: () => null }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../services/rentals/rentalWorkspaceScope', () => ({ resolveRentalWorkspaceScope: () => mocks.scope, buildRentalListingQueryOptions: () => ({ organisationId: 'org-1', includeAllOrganisationListings: false }) }))
vi.mock('../../../services/rentals/rentalListingOverviewService', () => ({ loadRentalListingOverview: mocks.overview }))
vi.mock('../../../services/rentals/rentalListingDraftService', () => ({ getRentalListingForAgent: mocks.load, updateRentalListingDraft: vi.fn(), previewPrivatePropertyRentalListing: vi.fn(), publishPrivatePropertyRentalListing: vi.fn(), expirePrivatePropertyRentalListing: mocks.withdrawPP, previewRentalProperty24Listing: vi.fn(), publishRentalProperty24Listing: vi.fn(), withdrawRentalProperty24Listing: mocks.withdrawP24 }))
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks() })
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
  expect(within(screen.getByRole('table')).queryByText('Amy')).toBeNull()
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
  fireEvent.click(withdraw)
  expect(mocks.withdrawP24).not.toHaveBeenCalled()
  fireEvent.click(withdraw)
  await waitFor(() => expect(mocks.withdrawP24).toHaveBeenCalledWith('listing-1'))
  await screen.findByText('Rental withdrawn from Property24.')
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
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw listing', hidden: true }))
  await screen.findByText('Portal unavailable; please retry.')
  expect(mocks.withdrawPP).toHaveBeenCalledWith('listing-1')
  expect(mocks.withdrawP24).not.toHaveBeenCalled()
  expect(mocks.load).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('Rental withdrawn from Private Property.')).toBeNull()
})
