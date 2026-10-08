// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation } from 'react-router-dom'
import AgentWorkspaceListings from '../AgentWorkspaceListings.jsx'
import { buildAgentDevelopmentCards, splitAgentListings } from '../agentWorkspaceListingsModel.js'
const mocks = vi.hoisted(() => ({ covers: vi.fn(), assigned: vi.fn(), options: vi.fn() }))
vi.mock('../../../services/privateListingService', () => ({ getPrivateListingCoverImageUrls: mocks.covers, getListingCardImageSource: (src) => ({ src }) }))
vi.mock('../../../lib/api', () => ({ fetchAssignedDevelopmentIdsForRole: mocks.assigned, fetchDevelopmentOptions: mocks.options }))
vi.mock('../../../hooks/useListingWebsitePublications', () => ({ default: () => ({}) }))
const org = '11111111-1111-4111-8111-111111111111'
const user = '22222222-2222-4222-8222-222222222222'
const sale = { id: '33333333-3333-4333-8333-333333333333', organisationId: org, assignedAgentId: user, listingTitle: 'Sale home', addressLine1: '10 Sale Road', askingPrice: 1500000, bedrooms: 3, property24Status: 'published' }
const rental = { ...sale, id: '44444444-4444-4444-8444-444444444444', listingTitle: 'Rental home', listingCategory: 'rental', askingPrice: 12000, addressLine1: '11 Rental Road', sellerCanonicalFacts: { rentalInfo: { monthlyRent: 12000, availableFrom: '2026-11-01' } } }
const agent = { id: user, userId: user, organisationId: org, name: 'Kevin Croft', email: 'kevin@example.test', privateListings: [sale, rental], developmentListings: [] }
function Location() { return <output aria-label="Location">{useLocation().pathname}</output> }
function show(value = agent) { return render(<MemoryRouter><AgentWorkspaceListings key={value.userId} agent={value} /><Location /></MemoryRouter>) }
beforeEach(() => { vi.clearAllMocks(); mocks.covers.mockImplementation(async (ids) => Object.fromEntries(ids.map((id) => [id, `https://example.test/${id}.jpg`]))); mocks.assigned.mockResolvedValue(['linked-development']); mocks.options.mockResolvedValue([{ id: 'linked-development', name: 'Linked Development', organisation_id: org, planned_units: 20 }, { id: 'team-development', name: 'Team Development', planned_units: 10, stakeholder_teams: { agents: [{ email: agent.email }] } }, { id: 'other-development', name: 'Other Development', planned_units: 40, stakeholder_teams: { agents: [{ email: 'someone@example.test' }] } }]) })
afterEach(cleanup)

it('loads saved sales cover images without discarding fields and uses the normal card contents', async () => {
  show()
  const photo = await screen.findByRole('img', { name: 'Sale home' })
  expect(photo.src).toBe(`https://example.test/${sale.id}.jpg`)
  expect(screen.getByText('10 Sale Road')).toBeTruthy()
  expect(screen.getByText('3 bed')).toBeTruthy()
  expect(screen.getByText('Kevin Croft')).toBeTruthy()
  expect(screen.getByText('Property24')).toBeTruthy()
  expect(screen.queryByText('Assign Listing — unavailable')).toBeNull()
  expect(mocks.options).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  expect(screen.getByLabelText('Location').textContent).toBe(`/agent/listings/${sale.id}`)
})
it('switches to rentals, preserves monthly rent and availability, and opens the rental detail', async () => {
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Rentals' }))
  await screen.findByRole('img', { name: 'Rental home' })
  expect(screen.queryByText('10 Sale Road')).toBeNull()
  expect(screen.getByText('/ month')).toBeTruthy()
  expect(screen.getByText(/Available from/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Rentals' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Open actions for Rental home' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Open listing' }))
  expect(screen.getByLabelText('Location').textContent).toBe(`/agent/rentals/listings/${rental.id}`)
})
it('shows participant and stakeholder developments before transactions, excluding other agents', async () => {
  show()
  fireEvent.click(screen.getByRole('button', { name: 'Developments' }))
  await screen.findByText('Linked Development')
  expect(screen.getByText('Team Development')).toBeTruthy()
  expect(screen.queryByText('Other Development')).toBeNull()
  expect(mocks.assigned).toHaveBeenCalledWith({ userId: user, participantEmail: agent.email, roleType: 'agent' })
  expect(mocks.options).toHaveBeenCalledWith({ organisationId: org })
  fireEvent.click(screen.getByText('Team Development'))
  expect(screen.getByLabelText('Location').textContent).toBe('/developments/team-development')
})
it('keeps a selected agent’s listings separate from foreign organisations and other assignments', () => {
  expect(splitAgentListings({ ...agent, privateListings: [...agent.privateListings, { ...sale, id: 'foreign', organisationId: 'other-org' }, { ...sale, id: 'other-agent', assignedAgentId: 'other-agent' }] }).sales.map((row) => row.id)).toEqual([sale.id])
})
it('deduplicates development units across transactions and includes assigned development stock', () => {
  const row = { development: { id: 'development', name: 'Own Development' }, unit: { id: 'unit', status: 'sold' } }
  const cards = buildAgentDevelopmentCards({ ...agent, developmentListings: [{ row }, { row }], privateListings: [{ ...sale, developmentId: 'stock-project' }] }, [{ id: 'stock-project', name: 'Stock Project', planned_units: 5 }])
  expect(cards.find((card) => card.id === 'development')).toMatchObject({ totalUnits: 1, unitsSoldOrReserved: 1, unitsAvailable: 0 })
  expect(cards.find((card) => card.id === 'stock-project').name).toBe('Stock Project')
})
it('does not accept late photos after the agent workspace changes', async () => {
  let finish
  mocks.covers.mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
  const view = show()
  await waitFor(() => expect(mocks.covers).toHaveBeenCalled())
  view.unmount()
  show({ ...agent, id: 'other', userId: 'other', name: 'Other Agent', privateListings: [] })
  finish({ [sale.id]: 'https://example.test/late.jpg' })
  await screen.findByText('No sales listings assigned to this agent.')
  expect(screen.queryByRole('img')).toBeNull()
})
it('shows a photo failure with a retry instead of losing the listing card', async () => {
  mocks.covers.mockRejectedValueOnce(new Error('offline'))
  show()
  await screen.findByRole('alert')
  expect(screen.getByText('10 Sale Road')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry photos' }))
  await screen.findByRole('img', { name: 'Sale home' })
})
