// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ covers: vi.fn(), stats: vi.fn() }))
vi.mock('../../../services/privateListingService.js', () => ({
  getPrivateListingCoverImageUrls: mocks.covers,
  getListingCardImageSource: (url) => ({ src: url, fallbackSrc: '' }),
}))
vi.mock('../../../services/agentHomeListingService.js', () => ({
  loadAgentHomeListingStats: mocks.stats,
  getAgentHomeListingSellerName: (listing) => listing.seller?.name || 'Seller pending',
}))
import AgentHomeListings from '../AgentHomeListings.jsx'

const listing = { id: 'listing-1', organisationId: 'org-1', addressLine1: '24 Oak Avenue', suburb: 'Sandton', seller: { name: 'Jane Smith' } }
const props = { organisationId: 'org-1', listings: [listing], onViewAll: vi.fn(), onOpenListing: vi.fn() }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.covers.mockImplementation(async (_, { onCover }) => { onCover({ 'listing-1': '/property.jpg' }); return { 'listing-1': '/property.jpg' } })
  mocks.stats.mockResolvedValue({ 'listing-1': { views: 248, newLeads: 3, partialViews: true } })
})
afterEach(cleanup)

it('shows the photo, address, seller and two statistics, and opens the listing or full list', async () => {
  render(<AgentHomeListings {...props} />)
  const card = screen.getByRole('button', { name: 'Open listing: 24 Oak Avenue' })
  await waitFor(() => expect(within(card).getByText('248')).toBeTruthy())
  expect(within(card).getByRole('img').getAttribute('src')).toBe('/property.jpg')
  expect(within(card).getByText('Jane Smith')).toBeTruthy()
  expect(within(card).getByText('Sandton')).toBeTruthy()
  expect(within(card).getByText('3')).toBeTruthy()
  expect(within(card).getByText('Partial · 30 days')).toBeTruthy()
  fireEvent.click(card)
  expect(props.onOpenListing).toHaveBeenCalledWith(listing)
  fireEvent.click(screen.getByRole('button', { name: 'View all listings' }))
  expect(props.onViewAll).toHaveBeenCalledOnce()
})

it('shows unavailable counts as dashes while retaining a verified zero and refreshes on request', async () => {
  mocks.stats.mockResolvedValue({ 'listing-1': { views: null, newLeads: 0 } })
  render(<AgentHomeListings {...props} />)
  await waitFor(() => expect(screen.getByText('—')).toBeTruthy())
  expect(screen.getByText('0')).toBeTruthy()
  expect(screen.getByText('Unavailable')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh statistics' }))
  await waitFor(() => expect(mocks.stats).toHaveBeenCalledTimes(2))
})

it('keeps loading, empty and failed listing states distinct', () => {
  const retry = vi.fn()
  const { rerender } = render(<AgentHomeListings loading />)
  expect(screen.getByRole('status').textContent).toBe('Loading listings…')
  rerender(<AgentHomeListings error="Your listings could not be loaded." onRetry={retry} />)
  expect(screen.getByRole('alert').textContent).toContain('Your listings could not be loaded.')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(retry).toHaveBeenCalledOnce()
  rerender(<AgentHomeListings />)
  expect(screen.getByText('No active listings yet.')).toBeTruthy()
})

it('does not show stale statistics or photos after the organisation changes', async () => {
  let resolveOld
  mocks.stats.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
  const { rerender } = render(<AgentHomeListings {...props} />)
  const nextListing = { id: 'listing-2', organisationId: 'org-2', addressLine1: '8 New Road' }
  mocks.stats.mockResolvedValue({ 'listing-2': { views: 7, newLeads: 1 } })
  rerender(<AgentHomeListings {...props} organisationId="org-2" listings={[nextListing]} />)
  await waitFor(() => expect(screen.getByText('7')).toBeTruthy())
  resolveOld({ 'listing-1': { views: 999, newLeads: 999 } })
  await waitFor(() => expect(screen.queryByText('999')).toBeNull())
  expect(screen.queryByText('24 Oak Avenue')).toBeNull()
  expect(screen.queryByRole('img')).toBeNull()
})

it('limits the home preview to eight cards in the current organisation and handles a broken photo', async () => {
  const many = Array.from({ length: 10 }, (_, index) => ({ ...listing, id: `listing-${index}`, addressLine1: `${index} Oak Avenue` }))
  render(<AgentHomeListings {...props} listings={[...many, { ...listing, id: 'other-agent', organisationId: 'other' }]} />)
  expect(screen.getAllByRole('button', { name: /^Open listing:/ })).toHaveLength(8)
  const photo = await screen.findByRole('img')
  fireEvent.error(photo)
  expect(screen.getAllByText('Photo unavailable')).toHaveLength(8)
})
