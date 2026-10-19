// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RentalOperationsDashboardPage from '../RentalOperationsDashboardPage.jsx'

const mocks = vi.hoisted(() => ({ dashboard: vi.fn(), bottom: vi.fn(), tenancies: vi.fn(), properties: vi.fn(), organisationId: 'org-1' }))
vi.mock('../../../context/WorkspaceContext', () => ({ useWorkspace: () => ({}) }))
vi.mock('../../../components/dashboard/PremiumDashboard', () => ({ MobileDashboardShell: ({ children }) => <div>{children}</div> }))
vi.mock('../../../services/rentals/rentalWorkspaceScope', () => ({ resolveRentalWorkspaceScope: () => ({ organisationId: mocks.organisationId, branchId: 'branch-1' }) }))
vi.mock('../../../services/rentals/rentalOperationsDashboardRepository.js', () => ({ getRentalManagementDashboard: mocks.dashboard, getRentalManagementDashboardBottomHalf: mocks.bottom }))
vi.mock('../../../services/rentals/rentalApplicationRepository.js', () => ({ listPersistedRentalTenancies: mocks.tenancies }))
vi.mock('../../../services/rentals/rentalPropertyRepository.js', () => ({ listRentalProperties: mocks.properties }))

const summary = (count = 8) => ({ metrics: { active_mandates: count, new_leads: 23, occupancy_rate: 75 }, occupancy: { total_units: 4, occupied_units: 3, vacant_units: 1, occupancy_rate: 75 }, applications: [] })
beforeEach(() => {
  mocks.organisationId = 'org-1'
  mocks.dashboard.mockResolvedValue(summary())
  mocks.bottom.mockResolvedValue({ portfolio_health: { managed_units: 4, occupied_units: 3, vacant_units: 1, occupancy_rate: 75 }, recent_activity: [] })
  mocks.tenancies.mockResolvedValue([])
  mocks.properties.mockResolvedValue([])
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
const mount = () => render(<MemoryRouter><RentalOperationsDashboardPage /></MemoryRouter>)

it('shows saved occupancy, loads the selected scope and refreshes on demand', async () => {
  mount()
  await screen.findByRole('button', { name: 'Refresh dashboard' })
  expect(screen.getByRole('img', { name: 'Occupancy rate: Occupied units 3, Vacant units 1' })).toBeTruthy()
  expect(mocks.dashboard).toHaveBeenCalledWith({ organisationId: 'org-1', branchId: null, scope: 'company', rangeDays: 30 })
  mocks.dashboard.mockResolvedValue(summary(12))
  fireEvent.click(screen.getByRole('button', { name: 'Refresh dashboard' }))
  await screen.findByText('12')
})

it('keeps summary figures when either portfolio details or supplementary renewals fail', async () => {
  mocks.bottom.mockRejectedValue(new Error('Portfolio request failed'))
  mocks.tenancies.mockRejectedValue(new Error('Lease request failed'))
  mount()
  await screen.findByRole('alert')
  expect(screen.getByText('8')).toBeTruthy()
  expect(screen.getByRole('img', { name: /Occupancy rate: Occupied units 3/ })).toBeTruthy()
  expect(screen.getByText('Portfolio details could not load. Refresh to try again.')).toBeTruthy()
  expect(screen.getByText('Upcoming renewals could not load. Refresh to try again.')).toBeTruthy()
  expect(screen.queryByText('No active leases are due to renew in the next 90 days.')).toBeNull()
})

it('keeps portfolio details when the summary fails and never substitutes zero for failed data', async () => {
  mocks.dashboard.mockRejectedValue(new Error('Summary request failed'))
  mount()
  await screen.findByRole('alert')
  expect(screen.getByText('Managed Units')).toBeTruthy()
  expect(screen.getByText('Applications could not load. Refresh to try again.')).toBeTruthy()
  expect(screen.queryByText('No active rental applications in this scope.')).toBeNull()
})

it('ignores a slow response from a previous filter', async () => {
  let finishOld
  mocks.dashboard.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve }))
  mount()
  act(() => window.dispatchEvent(new CustomEvent('itg:principal-dashboard-header-filter-change', { detail: { key: 'dataScope', value: 'agent' } })))
  await screen.findByText('8')
  await act(async () => { finishOld(summary(999)); await Promise.resolve() })
  expect(screen.queryByText('999')).toBeNull()
  expect(mocks.dashboard).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'agent' }))
})

it('clears the previous workspace figures when workspace selection is removed', async () => {
  const view = mount()
  await screen.findByText('8')
  mocks.organisationId = ''
  view.rerender(<MemoryRouter><RentalOperationsDashboardPage /></MemoryRouter>)
  await screen.findByText('Choose an agency workspace to load the Rentals dashboard.')
  expect(screen.queryByText('8')).toBeNull()
})

it('refreshes saved figures when the window regains focus', async () => {
  mount()
  await screen.findByText('8')
  mocks.dashboard.mockResolvedValue(summary(16))
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(screen.getByText('16')).toBeTruthy())
})

it('retries a failed section and removes its error after recovery', async () => {
  mocks.bottom.mockRejectedValueOnce(new Error('Temporary connection failure'))
  mount()
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Refresh dashboard' }))
  await screen.findByText('Managed Units')
  expect(screen.queryByRole('alert')).toBeNull()
})

it('uses the current lease end date for upcoming renewals', async () => {
  const end = new Date()
  end.setDate(end.getDate() + 45)
  mocks.tenancies.mockResolvedValue([{ id: 'tenancy-1', propertyId: 'property-1', status: 'active', lease: { rental_lease_versions: [{ is_current: true, effective_end_date: end.toISOString().slice(0, 10) }] } }])
  mocks.properties.mockResolvedValue([{ id: 'property-1', name: 'Current lease property' }])
  mount()
  await screen.findByText('Current lease property')
  expect(screen.getByText('Open tenancy workflow to start the renewal.').closest('a').getAttribute('href')).toBe('/agent/rentals/tenancies/tenancy-1')
})
