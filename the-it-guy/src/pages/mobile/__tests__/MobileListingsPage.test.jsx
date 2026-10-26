// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MobileListingsPage from '../MobileListingsPage.jsx'

const mocks = vi.hoisted(() => ({ workspace: null, organisation: null, read: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../context/OrganisationContext', () => ({ useOptionalOrganisation: () => mocks.organisation }))
vi.mock('../../../services/mobileListingsService.js', () => ({ getMobileListingsAsync: mocks.read }))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.workspace = { role: 'agent', profile: { id: 'me' } }
  mocks.organisation = { organisation: { id: 'org-one' }, loading: false }
  mocks.read.mockReturnValue(new Promise(() => {}))
})
afterEach(cleanup)
const page = () => <MemoryRouter><MobileListingsPage /></MemoryRouter>
const listing = (id, options = {}) => ({ id, title: `Property ${id}`, address: 'Sandton', group: 'active', statusLabel: 'Active', price: 2190000, ...options })

it('shows every saved active listing, searches beyond the home preview, and separates drafts', async () => {
  mocks.read.mockResolvedValue([...Array.from({ length: 7 }, (_, i) => listing(i + 1)), listing('draft', { group: 'drafts', statusLabel: 'Draft' })])
  render(page())
  await act(async () => {})
  expect(screen.getAllByRole('article')).toHaveLength(7)
  expect(screen.getByRole('link', { name: 'Create new listing' }).getAttribute('href')).toBe('/mobile/listings/new')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Property 7' } })
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Open listing: Property 7' }).getAttribute('href')).toBe('/mobile/listings/7?tab=overview')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'drafts' } })
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Open listing: Property draft' }).getAttribute('href')).toBe('/mobile/listings/draft?tab=overview')
})

it('shows developer unit numbers, recorded specifications and filters/sorts the saved inventory', async () => {
  mocks.workspace = { ...mocks.workspace, role: 'developer' }
  mocks.read.mockResolvedValue([listing('one', { title: 'Oak Court', unitNumber: '001', bedrooms: 2, bathrooms: 1.5, floorSize: 85, propertyType: 'Apartment', price: 1000000 }), listing('two', { propertyType: 'House', price: 3000000 })])
  render(page()); await act(async () => {})
  expect(screen.getByText('Unit 001')).toBeTruthy()
  expect(screen.getByText('85 m²')).toBeTruthy()
  expect(screen.getByText('1.5')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'price-high' } })
  expect(screen.getAllByRole('article')[0].textContent).toContain('Property two')
  fireEvent.change(screen.getByLabelText('Property type'), { target: { value: 'Apartment' } })
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByRole('heading', { name: 'Oak Court' })).toBeTruthy()
})

it('ignores late responses from a previous workspace and reports read failures truthfully', async () => {
  let finishOld
  mocks.read.mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve }))
  const { rerender } = render(page())
  mocks.workspace = { ...mocks.workspace, currentWorkspace: { id: 'org-two' } }
  mocks.organisation = { organisation: { id: 'org-two' }, loading: false }
  mocks.read.mockRejectedValueOnce(new Error('Listing access unavailable'))
  rerender(page()); await act(async () => { finishOld([listing('old')]) })
  expect(screen.queryByText('Property old')).toBeNull()
  expect(screen.getByText('Listing access unavailable')).toBeTruthy()
  expect(screen.queryByText('No active listings yet.')).toBeNull()
  mocks.read.mockResolvedValueOnce([])
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' })); await act(async () => {})
  expect(screen.getByText('No active listings yet.')).toBeTruthy()
})

it('replaces a failed photo with a truthful placeholder without an image retry loop', async () => {
  mocks.read.mockResolvedValue([listing('one', { coverUrl: 'https://example.test/broken.jpg' })])
  render(page()); await act(async () => {})
  fireEvent.error(screen.getByRole('img'))
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByText('No photo yet')).toBeTruthy()
})

it('separates Sales and Rentals and filters drafts inside either collection', async () => {
  mocks.read.mockResolvedValue([
    listing('sale'), listing('sale-draft', { group: 'drafts', statusLabel: 'Draft' }),
    listing('rental', { kind: 'rentals', price: 13500, rentalPriceFrequency: 'monthly' }),
    listing('rental-draft', { kind: 'rentals', group: 'drafts', statusLabel: 'Draft' }),
  ])
  render(page()); await act(async () => {})
  expect(screen.getByRole('button', { name: 'Sales' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByRole('heading', { name: 'Property sale' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Rentals' }))
  expect(screen.getByRole('heading', { name: 'Property rental' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Property sale' })).toBeNull()
  expect(screen.getByRole('article').textContent).toContain('/ month')
  expect(screen.getByRole('link', { name: 'Open listing: Property rental' }).getAttribute('href')).toBe('/mobile/rentals/listings/rental')
  expect(screen.getByRole('link', { name: 'Create new listing' }).getAttribute('href')).toBe('/agent/rentals/listings/new')
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'drafts' } })
  expect(screen.getByRole('link', { name: 'Open listing: Property rental-draft' }).getAttribute('href')).toBe('/mobile/rentals/listings/rental-draft')
  fireEvent.click(screen.getByRole('button', { name: 'Sales' }))
  expect(screen.getByRole('heading', { name: 'Property sale-draft' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'all' } })
  expect(screen.getAllByRole('article')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
  expect(screen.getByLabelText('Status').value).toBe('active')
  expect(screen.getAllByRole('article')).toHaveLength(1)
})
