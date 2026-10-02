// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RentalTenanciesPage from '../RentalTenanciesPage'
const mocks = vi.hoisted(() => ({ tenancies: vi.fn() }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => ({}) }))
vi.mock('../../../services/rentals/rentalWorkspaceScope', () => ({ resolveRentalWorkspaceScope: () => ({ organisationId: 'org-1', branchId: '' }) }))
vi.mock('../../../services/rentals/rentalApplicationRepository.js', () => ({ listPersistedRentalTenancies: mocks.tenancies }))
vi.mock('../../../services/rentals/rentalPropertyRepository.js', () => ({ listRentalProperties: async () => [{ id: 'property-1', name: 'Harbour View', address: { city: 'Cape Town' } }] }))
vi.mock('../../../services/rentals/rentalUnitRepository.js', () => ({ listRentalUnits: async () => [{ id: 'unit-1', unitLabel: '302' }] }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('shows actual tenancy rows, keeps closed tenancies separate, and paginates at 15', async () => {
  mocks.tenancies.mockResolvedValue(Array.from({ length: 17 }, (_, index) => ({ id: `tenancy-${index}`, propertyId: 'property-1', unitId: 'unit-1', status: index === 16 ? 'closed' : 'active', tenant: { identity: { name: `Tenant ${index}` } }, lease: { terms_json: { monthly_rent: 7500 } } })))
  render(<MemoryRouter><RentalTenanciesPage /></MemoryRouter>)
  await screen.findByText('Tenant 0')
  expect(screen.getAllByText('Open tenancy')).toHaveLength(15)
  expect(screen.getByText('Page 1 of 2')).toBeTruthy()
  fireEvent.click(screen.getByText('Next'))
  expect(screen.getByText('Tenant 15')).toBeTruthy()
  expect(screen.getAllByText('Open tenancy')).toHaveLength(1)
  const link = screen.getByText('Open tenancy').closest('a')
  expect(link.getAttribute('href')).toBe('/agent/rentals/tenancies/tenancy-15')
  fireEvent.click(screen.getByRole('button', { name: /Completed/ }))
  expect(screen.getByText('Tenant 16')).toBeTruthy()
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('5')
  expect(screen.getByText('Review applications').getAttribute('href')).toBe('/agent/rentals/applications')
})
it('shows a load failure rather than a successful empty portfolio', async () => {
  mocks.tenancies.mockRejectedValue(new Error('Unable to load tenancy records'))
  render(<MemoryRouter><RentalTenanciesPage /></MemoryRouter>)
  expect((await screen.findByRole('alert')).textContent).toContain('Unable to load tenancy records')
  expect(screen.queryByText(/No tenancies yet/)).toBeNull()
})

it('loads beyond the first 100 records before filtering', async () => {
  mocks.tenancies.mockImplementation(async (_organisationId, { offset }) => offset === 0
    ? Array.from({ length: 100 }, (_, index) => ({ id: `closed-${index}`, status: 'closed' }))
    : [{ id: 'later-active', status: 'active', tenant: { identity: { name: 'Later tenant' } } }])
  render(<MemoryRouter><RentalTenanciesPage /></MemoryRouter>)
  await screen.findByText('Later tenant')
  expect(mocks.tenancies).toHaveBeenCalledWith('org-1', { offset: 100 })
  expect(screen.getAllByText('Open tenancy')).toHaveLength(1)
})

it('shows the current landlord and actual lifecycle progress and searches by landlord', async () => {
  mocks.tenancies.mockResolvedValue([{ id: 'tenancy-current', propertyId: 'property-1', unitId: 'unit-1', status: 'active', tenant: { identity: { name: 'Current Tenant' } }, lease: { rental_lease_versions: [{ is_current: true, rental_lease_signers: [{ signer_role: 'landlord', signer_name: 'Current Owner' }] }] } }])
  render(<MemoryRouter><RentalTenanciesPage /></MemoryRouter>)
  await screen.findByText('Current Owner')
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3')
  expect(screen.getByText('Stage 4 of 6')).toBeTruthy()
  fireEvent.change(screen.getByRole('textbox', { name: 'Search tenancies' }), { target: { value: 'current owner' } })
  expect(screen.getByText('Current Tenant')).toBeTruthy()
})
