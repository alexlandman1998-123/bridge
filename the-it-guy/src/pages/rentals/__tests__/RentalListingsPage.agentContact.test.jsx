// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RentalListingsPage from '../RentalListingsPage'
const mocks = vi.hoisted(() => ({ listings: vi.fn(), workspace: {} }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../services/rentals/rentalWorkspaceScope', () => ({ resolveRentalWorkspaceScope: () => ({ organisationId: 'org-1', assignedAgentId: 'agent-1' }), buildRentalListingQueryOptions: () => ({}) }))
vi.mock('../../../services/rentals/rentalListingDraftService', () => ({ listRentalListingsForAgent: mocks.listings }))
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
