// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import QuickCreateDropdown from '../QuickCreateDropdown'

const mocks = vi.hoisted(() => ({
  role: 'agent', businessWorkspaceId: 'sales', createLead: vi.fn(), createAppointment: vi.fn(), listings: vi.fn(),
  profile: { id: '00000000-0000-4000-8000-000000000001', fullName: 'Test Agent', email: 'agent@example.test' },
}))
vi.mock('../../context/WorkspaceContext', () => ({ useWorkspace: () => ({
  role: mocks.role, agencyWorkflowMode: 'agent', businessWorkspaceId: mocks.businessWorkspaceId,
  profile: mocks.profile,
}) }))
vi.mock('../../lib/agencyCrmRepository', () => ({ createAgencyCrmLeadRecord: mocks.createLead }))
vi.mock('../../lib/agencyPipelineService', () => ({ createAppointmentAsync: mocks.createAppointment }))
vi.mock('../../lib/settingsApi', () => ({
  fetchOrganisationSettings: vi.fn(async () => ({ organisation: { id: '00000000-0000-4000-8000-000000000002' } })),
  listOrganisationUsers: vi.fn(async () => []),
}))
vi.mock('../../services/privateListingService', () => ({ getOrganisationPrivateListings: mocks.listings }))
vi.mock('../../lib/agentListingStorage', () => ({ readAgentPrivateListings: () => [] }))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="destination">{JSON.stringify({ path: location.pathname, search: location.search, state: location.state })}</output>
}

function openMenu(path = '/dashboard') {
  render(<MemoryRouter initialEntries={[path]}><QuickCreateDropdown initialOpen /><LocationProbe /></MemoryRouter>)
}

beforeEach(() => { mocks.role = 'agent'; mocks.businessWorkspaceId = 'sales'; vi.clearAllMocks(); mocks.listings.mockReset().mockResolvedValue([]) })
afterEach(cleanup)

it('shows the seven supported Agent actions', () => {
  openMenu()
  const items = screen.getAllByRole('menuitem')
  expect(items).toHaveLength(7)
  for (const type of ['lead', 'client', 'listing', 'transaction', 'third-party', 'appointment', 'viewing']) {
    expect(screen.getByTestId(`quick-create-${type}`)).toBeTruthy()
  }
  expect(screen.queryByTestId('quick-create-prospect')).toBeNull()
})

it.each(['landlord', 'tenant'])('opens native %s capture from a rental page without offering seller/buyer capture', role => {
  openMenu('/agent/rentals/listings')
  expect(screen.queryByTestId('quick-create-lead')).toBeNull()
  fireEvent.click(screen.getByTestId(`quick-create-${role}-lead`))
  expect(JSON.parse(screen.getByTestId('destination').textContent)).toMatchObject({ path: '/agent/rentals/pipeline/leads', search: `?create=${role}` })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(mocks.createLead).not.toHaveBeenCalled()
})

it('keeps rental capture on shared pages while the Rentals business line is selected', () => {
  mocks.businessWorkspaceId = 'rentals'
  openMenu('/clients')
  fireEvent.click(screen.getByTestId('quick-create-landlord-lead'))
  expect(JSON.parse(screen.getByTestId('destination').textContent)).toMatchObject({ path: '/agent/rentals/pipeline/leads', search: '?create=landlord' })
  expect(mocks.createLead).not.toHaveBeenCalled()
})

it('opens the rental listing form from Create in Rentals', () => {
  openMenu('/agent/rentals/long-term/dashboard')
  fireEvent.click(screen.getByTestId('quick-create-listing'))
  expect(JSON.parse(screen.getByTestId('destination').textContent).path).toBe('/agent/rentals/listings/new')
})

it('requires a current property before handing Viewing to the listing-owned form', async () => {
  mocks.listings.mockResolvedValue([
    { id: 'listing-1', listingTitle: 'Rose Cottage', listingStatus: 'active' },
    { id: 'listing-closed', listingTitle: 'Sold Cottage', listingStatus: 'sold' },
  ])
  openMenu()
  fireEvent.click(screen.getByTestId('quick-create-viewing'))
  expect(screen.queryByRole('menu')).toBeNull()
  expect(screen.getByRole('button', { name: 'Continue to viewing' }).disabled).toBe(true)
  await screen.findByRole('option', { name: 'Rose Cottage' })
  expect(screen.queryByRole('option', { name: 'Sold Cottage' })).toBeNull()
  expect(mocks.listings).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000002', { includeRequirementsAndDocuments: false })
  fireEvent.change(screen.getByLabelText('Property'), { target: { value: 'listing-1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue to viewing' }))
  expect(JSON.parse(screen.getByTestId('destination').textContent)).toEqual({ path: '/agent/listings/listing-1', search: '?tab=leads&scheduleViewing=1', state: null })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(mocks.createLead).not.toHaveBeenCalled()
  expect(mocks.createAppointment).not.toHaveBeenCalled()
})

it('keeps Viewing blocked on load errors and allows a fresh retry', async () => {
  mocks.listings.mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValueOnce([{ id: 'listing-1', listingTitle: 'Rose Cottage' }])
  openMenu()
  fireEvent.click(screen.getByTestId('quick-create-viewing'))
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Continue to viewing' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByRole('option', { name: 'Rose Cottage' })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByRole('button', { name: 'Continue to viewing' }).disabled).toBe(true)
})

it('handles no available properties and cancellation without creating a record', async () => {
  openMenu()
  fireEvent.click(screen.getByTestId('quick-create-viewing'))
  await screen.findByText(/No current properties/)
  expect(screen.getByRole('button', { name: 'Continue to viewing' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(JSON.parse(screen.getByTestId('destination').textContent).path).toBe('/dashboard')
  expect(mocks.createLead).not.toHaveBeenCalled()
  expect(mocks.createAppointment).not.toHaveBeenCalled()
})

it.each([
  ['client', '/clients', '', { openAddClient: true }],
  ['listing', '/listings/new', '', { listingModalMode: 'agent' }],
  ['transaction', '/new-transaction', '', null],
  ['third-party', '/partners', '', { openAddThirdParty: true, partnerType: 'transfer_attorney' }],
  ['appointment', '/pipeline/calendar', '?schedule=1', null],
])('opens the existing %s workflow and closes the menu without saving', (type, path, search, state) => {
  openMenu()
  fireEvent.click(screen.getByTestId(`quick-create-${type}`))
  expect(JSON.parse(screen.getByTestId('destination').textContent)).toEqual({ path, search, state })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(mocks.createLead).not.toHaveBeenCalled()
  expect(mocks.createAppointment).not.toHaveBeenCalled()
})

it('keeps Lead connected to the existing capture and save service', async () => {
  mocks.createLead.mockResolvedValue({ leadId: 'saved-lead' })
  openMenu()
  fireEvent.click(screen.getByTestId('quick-create-lead'))
  fireEvent.click(screen.getByTestId('quick-create-lead-choice-buyer'))
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Taylor Buyer' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create Lead' }))
  await waitFor(() => expect(mocks.createLead).toHaveBeenCalledTimes(1))
  const [organisationId, payload] = mocks.createLead.mock.calls[0]
  expect(organisationId).toBe('00000000-0000-4000-8000-000000000002')
  expect(payload.contact.firstName).toBe('Taylor')
  expect(payload.contact.lastName).toBe('Buyer')
  expect(payload.lead.leadCategory).toBe('buyer')
  await screen.findByText(/Buyer lead created as a search opportunity/)
})

it('preserves the developer menu', () => {
  mocks.role = 'developer'
  openMenu()
  expect(screen.getByTestId('quick-create-prospect')).toBeTruthy()
  expect(screen.getByTestId('quick-create-viewing')).toBeTruthy()
})

it('preserves the Commercial workspace menu', () => {
  openMenu('/commercial')
  expect(screen.getByTestId('quick-create-commercial-viewing')).toBeTruthy()
  expect(screen.queryByTestId('quick-create-lead')).toBeNull()
})
