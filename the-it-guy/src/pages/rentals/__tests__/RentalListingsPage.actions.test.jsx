// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import RentalListingsPage from '../RentalListingsPage'

const mocks = vi.hoisted(() => ({
  listings: vi.fn(), inspect: vi.fn(), delete: vi.fn(),
  workspace: {}, scope: { organisationId: 'org-1', assignedAgentId: 'agent-1' },
}))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../services/rentals/rentalWorkspaceScope', () => ({
  resolveRentalWorkspaceScope: () => mocks.scope,
  buildRentalListingQueryOptions: () => ({ organisationId: 'org-1' }),
}))
vi.mock('../../../services/rentals/rentalListingDraftService', () => ({ listRentalListingsForAgent: mocks.listings }))
vi.mock('../../../services/rentals/rentalListingDeletionService', () => ({ inspectRentalListingDeletion: mocks.inspect, deleteRentalListing: mocks.delete }))
vi.mock('../../../components/listings/FinalListingModuleOverview', () => ({ default: () => null }))
vi.mock('../RentalStockReviewPanel', () => ({ default: () => null }))

const rental = { id: 'rental-1', listingTitle: 'Rental home', listingStatus: 'withdrawn' }
const safe = { canDelete: true, liveChannels: [], unconfirmedChannels: [] }
function Location() { return <output data-testid="location">{useLocation().pathname}</output> }
async function openMenu() {
  render(<MemoryRouter initialEntries={['/agent/rentals/listings']}><RentalListingsPage /><Location /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: /^Previous/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Open actions for Rental home' }))
}
async function openDelete() {
  await openMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete listing' }))
  return screen.findByRole('dialog', { name: 'Delete rental listing?' })
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.listings.mockResolvedValue([rental])
  mocks.inspect.mockResolvedValue(safe)
  mocks.delete.mockResolvedValue({ deleted: true })
})
afterEach(cleanup)

it('opens the three-dot menu without opening the card and routes withdrawal to Marketing', async () => {
  await openMenu()
  expect(screen.getByTestId('location').textContent).toBe('/agent/rentals/listings')
  expect(mocks.listings).toHaveBeenCalledWith('agent-1', { organisationId: 'org-1', includeWithdrawnListings: true, includePreviousListings: true })
  fireEvent.click(screen.getByRole('menuitem', { name: 'Withdraw listing' }))
  expect(screen.getByTestId('location').textContent).toBe('/agent/rentals/listings/rental-1/marketing')
  expect(mocks.delete).not.toHaveBeenCalled()
})

it('keeps a withdrawn card until confirmed deletion succeeds', async () => {
  const dialog = await openDelete()
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Delete listing' }).disabled).toBe(false))
  expect(mocks.delete).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Open actions for Rental home' })).toBeTruthy()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete listing' }))
  await screen.findByText('“Rental home” was permanently deleted.')
  expect(mocks.delete).toHaveBeenCalledWith('rental-1', { organisationId: 'org-1' })
  expect(screen.queryByRole('button', { name: 'Open actions for Rental home' })).toBeNull()
})

it('blocks live listings and offers the existing withdrawal controls', async () => {
  mocks.inspect.mockResolvedValue({ ...safe, canDelete: false, liveChannels: ['Property24'] })
  const dialog = await openDelete()
  await within(dialog).findByText('Withdraw this listing from Property24 before deleting it.')
  expect(within(dialog).getByRole('button', { name: 'Delete listing' }).disabled).toBe(true)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Manage withdrawal' }))
  expect(screen.getByTestId('location').textContent).toBe('/agent/rentals/listings/rental-1/marketing')
  expect(mocks.delete).not.toHaveBeenCalled()
})

it('keeps deletion disabled when current status cannot be checked', async () => {
  mocks.inspect.mockRejectedValue(new Error('Status unavailable'))
  const dialog = await openDelete()
  await within(dialog).findByText('Status unavailable')
  expect(within(dialog).getByRole('button', { name: 'Delete listing' }).disabled).toBe(true)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.getByRole('button', { name: 'Open actions for Rental home' })).toBeTruthy()
  expect(mocks.delete).not.toHaveBeenCalled()
})

it('retains the card and updates the blocker if publication changes before confirmation', async () => {
  mocks.delete.mockRejectedValue(Object.assign(new Error('Withdraw first'), { deletionState: { ...safe, canDelete: false, liveChannels: ['Private Property'] } }))
  const dialog = await openDelete()
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Delete listing' }).disabled).toBe(false))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete listing' }))
  await within(dialog).findByText('Withdraw first')
  expect(within(dialog).getByRole('button', { name: 'Delete listing' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Open actions for Rental home' })).toBeTruthy()
  expect(screen.queryByText(/was permanently deleted/)).toBeNull()
})

it('dismisses the menu with Escape and an outside click', async () => {
  await openMenu()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Open actions for Rental home' }))
  fireEvent.click(document.body)
  expect(screen.queryByRole('menu')).toBeNull()
})
