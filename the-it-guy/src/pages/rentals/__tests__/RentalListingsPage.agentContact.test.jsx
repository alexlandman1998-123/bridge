// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RentalListingsPage from '../RentalListingsPage'
const mocks = vi.hoisted(() => ({ listings: vi.fn(), websiteStatus: vi.fn(), workspace: {} }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../services/rentals/rentalWorkspaceScope', () => ({ resolveRentalWorkspaceScope: () => ({ organisationId: 'org-1', assignedAgentId: 'agent-1' }), buildRentalListingQueryOptions: () => ({}) }))
vi.mock('../../../services/rentals/rentalListingDraftService', () => ({ listRentalListingsForAgent: mocks.listings }))
vi.mock('../../../services/websiteListingPublicationService', () => ({ getWebsiteListingPublicationStatus: mocks.websiteStatus }))
vi.mock('../../../components/listings/FinalListingModuleOverview', () => ({ default: () => null }))
vi.mock('../RentalStockReviewPanel', () => ({ default: () => null }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('shows the agent email under the agent name, without exposing the landlord contact there', async () => {
  mocks.listings.mockResolvedValue([{ id: 'listing-1', listingTitle: 'Rental home', assignedAgentName: 'Kevin Agent', assignedAgentEmail: 'agent@example.com', sellerName: 'Owner', sellerEmail: 'owner@example.com', sellerPhone: '0123456789' }])
  render(<MemoryRouter><RentalListingsPage /></MemoryRouter>)
  await screen.findByText('Kevin Agent')
  expect(screen.getByText('agent@example.com')).toBeTruthy()
  expect(screen.queryByText(/owner@example.com/)).toBeNull()
  expect(screen.queryByText(/0123456789/)).toBeNull()
})

it('shows missing agent contact explicitly rather than substituting the owner email', async () => {
  mocks.listings.mockResolvedValue([{ id: 'listing-1', assignedAgentName: 'Kevin Agent', sellerEmail: 'owner@example.com' }])
  render(<MemoryRouter><RentalListingsPage /></MemoryRouter>)
  expect(await screen.findByText('Agent contact not captured')).toBeTruthy()
  expect(screen.queryByText(/owner@example.com/)).toBeNull()
})

it('separates current rental stock from previous listings with collection counts', async () => {
  mocks.listings.mockResolvedValue([
    { id: 'draft', listingTitle: 'Draft rental', listingStatus: 'draft' },
    { id: 'live', listingTitle: 'Live rental', property24Status: 'published' },
    { id: 'past', listingTitle: 'Past rental', listingVisibility: 'archived' },
    { id: 'withdrawn', listingTitle: 'Withdrawn rental', listingStatus: 'withdrawn' },
  ])
  render(<MemoryRouter><RentalListingsPage /></MemoryRouter>)
  await screen.findByText('Draft rental')
  expect(screen.getByText('Live rental')).toBeTruthy()
  expect(screen.queryByText('Past rental')).toBeNull()
  expect(screen.queryByText('Withdrawn rental')).toBeNull()
  const current = screen.getByRole('button', { name: /Current/ })
  const previous = screen.getByRole('button', { name: /Previous Listings/ })
  expect(current.getAttribute('aria-pressed')).toBe('true')
  expect(current.textContent).toContain('2')
  expect(previous.textContent).toContain('2')
  expect(mocks.listings.mock.calls[0][1]).toMatchObject({ includePreviousListings: true })
  fireEvent.click(previous)
  expect(screen.getByText('Past rental')).toBeTruthy()
  expect(screen.getByText('Withdrawn rental')).toBeTruthy()
  expect(screen.queryByText('Draft rental')).toBeNull()
  expect(screen.queryByText('Live rental')).toBeNull()
  fireEvent.click(current)
  expect(screen.getByText('Draft rental')).toBeTruthy()
})

it('explains an empty previous collection', async () => {
  mocks.listings.mockResolvedValue([])
  render(<MemoryRouter><RentalListingsPage /></MemoryRouter>)
  await screen.findByText('No current rental listings')
  fireEvent.click(screen.getByRole('button', { name: /Previous Listings/ }))
  expect(screen.getByText('No previous rental listings')).toBeTruthy()
})

it('uses the sales live-channel row for rentals and keeps monthly rent and availability visible', async () => {
  const id = '00000000-0000-4000-8000-000000000001'
  mocks.listings.mockResolvedValue([{ id, listingTitle: 'Rental home', askingPrice: 29500, property24Status: 'on_portal', privatePropertyStatus: 'active', rentalInfo: { monthlyRent: 29500, availableFrom: '2026-11-01' } }])
  mocks.websiteStatus.mockResolvedValue({ status: 'published', websiteStatus: 'published', projectionStatus: 'Published', hostname: 'kingdomrealestate.co.za' })
  render(<MemoryRouter><RentalListingsPage /></MemoryRouter>)
  await screen.findByLabelText('Live on Property24, Private Property, Agency website')
  expect(screen.getByText('/ month')).toBeTruthy()
  const available = screen.getByText('Available from')
  expect(available.textContent).toMatch(/01 Nov 2026/)
  expect(available.querySelector('time').getAttribute('datetime')).toBe('2026-11-01')
  expect(screen.queryByText('P24')).toBeNull()
  expect(mocks.websiteStatus).toHaveBeenCalledWith(id)
})

it('retains draft publishing guidance and never labels a draft website as live', async () => {
  mocks.listings.mockResolvedValue([{ id: '00000000-0000-4000-8000-000000000002', listingTitle: 'Draft rental', property24Status: 'not_published' }])
  mocks.websiteStatus.mockResolvedValue({ status: 'published', websiteStatus: 'published', projectionStatus: 'Draft', hostname: 'kingdomrealestate.co.za' })
  render(<MemoryRouter><RentalListingsPage /></MemoryRouter>)
  await screen.findByText('Availability not set')
  expect(screen.getByText('Property24 · Not Published')).toBeTruthy()
  expect(screen.queryByLabelText(/Live on/)).toBeNull()
})
