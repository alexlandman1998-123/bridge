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
  expect(screen.getByRole('link', { name: 'Edit listing: Property 7' }).getAttribute('href')).toBe('/mobile/listings/7/edit')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: /Drafts/ }))
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Continue draft: Property draft' }).getAttribute('href')).toBe('/mobile/listings/draft/edit')
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
