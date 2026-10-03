// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RentalLeadsPage from '../RentalLeadsPage'
import RentalViewingsPage from '../RentalViewingsPage'
const mocks = vi.hoisted(() => ({ workspace: { profile: { id: 'agent-1' } }, scope: { organisationId: 'org-1', assignedAgentId: 'agent-1', scopeLevel: 'assigned' }, getListing: vi.fn(), listListings: vi.fn(), leads: vi.fn(), createLead: vi.fn(), viewing: vi.fn(), advance: vi.fn(), outcome: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => mocks.workspace }))
vi.mock('../../../services/rentals/rentalWorkspaceScope', () => ({ resolveRentalWorkspaceScope: () => mocks.scope, buildRentalListingQueryOptions: () => ({ organisationId: 'org-1' }) }))
vi.mock('../../../services/rentals/rentalListingDraftService', () => ({ getRentalListingForAgent: mocks.getListing, listRentalListingsForAgent: mocks.listListings }))
vi.mock('../../../services/rentals/rentalLeadService', () => ({ listRentalLeads: mocks.leads, createRentalLead: mocks.createLead, advanceRentalLead: mocks.advance }))
vi.mock('../../../services/rentals/rentalLeadOutcomeService', () => ({ recordRentalLeadOutcome: mocks.outcome }))
vi.mock('../../../services/rentals/rentalViewingService', () => ({ createRentalViewing: mocks.viewing, listRentalViewings: async () => [], recordRentalViewingOutcome: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('opens a scoped tenant lead form and saves its property enquiry association', async () => {
  mocks.leads.mockResolvedValue([])
  mocks.getListing.mockResolvedValue({ id: 'listing-2', title: 'Demo Apartment', suburb: 'Woodstock' })
  mocks.createLead.mockResolvedValue({ id: 'lead-new', name: 'Amy Tenant', role: 'tenant', stage: 'new', source: 'Manual', relationships: { listingId: 'listing-2' } })
  render(<MemoryRouter initialEntries={['/agent/rentals/pipeline/leads?create=tenant&listingId=listing-2']}><RentalLeadsPage /></MemoryRouter>)
  const dialog = await screen.findByRole('dialog', { name: 'Create rental lead' })
  expect(within(dialog).getByText('Demo Apartment')).toBeTruthy()
  expect(within(dialog).getByLabelText('Desired area').value).toBe('Woodstock')
  fireEvent.change(within(dialog).getByLabelText('First name'), { target: { value: 'Amy' } })
  fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: 'amy@example.test' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create Rental Lead' }))
  await waitFor(() => expect(mocks.createLead).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'listing-2', role: 'tenant', desiredArea: 'Woodstock' }), expect.objectContaining({ organisationId: 'org-1' })))
})
it('preselects the requested visible property and saves the viewing against it', async () => {
  mocks.leads.mockResolvedValue([{ id: 'lead-1', name: 'Amy Tenant', role: 'tenant', stage: 'qualified' }])
  mocks.listListings.mockResolvedValue([{ id: 'first-property', title: 'Another Property' }, { id: 'listing-2', title: 'Requested Apartment' }])
  mocks.viewing.mockResolvedValue({ id: 'view-1', listingId: 'listing-2', tenantLeadId: 'lead-1', startsAt: '2026-11-01T10:00' })
  mocks.advance.mockResolvedValue({})
  render(<MemoryRouter initialEntries={['/agent/rentals/pipeline/viewings?listingId=listing-2']}><RentalViewingsPage /></MemoryRouter>)
  await waitFor(() => expect(screen.getByLabelText('Listing').value).toBe('listing-2'))
  fireEvent.change(screen.getByLabelText('Viewing time'), { target: { value: '2026-11-01T10:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Schedule viewing' }))
  await waitFor(() => expect(mocks.viewing).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'listing-2', tenantLeadId: 'lead-1' }), { assignedAgentId: 'agent-1' }))
})

it('does not silently substitute another listing when the requested property is unavailable', async () => {
  mocks.leads.mockResolvedValue([{ id: 'lead-1', name: 'Amy', role: 'tenant', stage: 'qualified' }])
  mocks.listListings.mockResolvedValue([{ id: 'different-property', title: 'Other property' }])
  render(<MemoryRouter initialEntries={['/agent/rentals/pipeline/viewings?listingId=removed-listing']}><RentalViewingsPage /></MemoryRouter>)
  await screen.findByText('The requested listing is unavailable. Choose an available listing.')
  expect(screen.getByLabelText('Listing').value).toBe('')
  expect(mocks.viewing).not.toHaveBeenCalled()
})

it('marks a lead lost with its selected reason and moves it into Closed Leads', async () => {
  const lead = { id: 'landlord-1', name: 'Alex Landlord', role: 'landlord', stage: 'new', stageLabel: 'New', source: 'Manual', focus: 'Apartment', outcome: { status: 'open' } }
  mocks.leads.mockResolvedValue([lead])
  mocks.outcome.mockResolvedValue({ outcome: { status: 'lost', reason: 'budget' } })
  render(<MemoryRouter><RentalLeadsPage /></MemoryRouter>)
  const triggers = await screen.findAllByRole('button', { name: 'Actions for Alex Landlord' })
  fireEvent.click(triggers[0])
  fireEvent.click(screen.getByRole('button', { name: 'Mark as lost' }))
  const dialog = screen.getByRole('dialog', { name: 'Mark lead as lost' })
  fireEvent.change(within(dialog).getByLabelText('Lost reason'), { target: { value: 'budget' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as lost' }))
  await waitFor(() => expect(mocks.outcome).toHaveBeenCalledWith(lead, { status: 'lost', reason: 'budget' }, expect.objectContaining({ organisationId: 'org-1', scope: expect.objectContaining({ assignedAgentId: 'agent-1' }) })))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.queryByRole('button', { name: 'Actions for Alex Landlord' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Closed Leads/ }))
  expect(screen.getAllByRole('button', { name: 'Actions for Alex Landlord' }).length).toBe(2)
})
