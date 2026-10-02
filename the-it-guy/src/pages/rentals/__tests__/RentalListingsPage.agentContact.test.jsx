// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RentalListingsPage from '../RentalListingsPage'
const mocks = vi.hoisted(() => ({ listings: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => ({}) }))
vi.mock('../../../services/rentals/rentalWorkspaceScope', () => ({ resolveRentalWorkspaceScope: () => ({ organisationId: 'org-1', assignedAgentId: 'agent-1' }), buildRentalListingQueryOptions: () => ({}) }))
vi.mock('../../../services/rentals/rentalListingDraftService', () => ({ listRentalListingsForAgent: mocks.listings }))
vi.mock('../../../components/listings/FinalListingModuleOverview', () => ({ default: () => null }))
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
