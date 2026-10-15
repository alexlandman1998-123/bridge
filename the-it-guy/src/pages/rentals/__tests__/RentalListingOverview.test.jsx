// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import RentalListingOverview from '../RentalListingOverview'
import RentalListingRelatedPanels from '../RentalListingRelatedPanels'
import { buildRentalListingOverview } from '../../../services/rentals/rentalListingOverviewModel'
const mocks = vi.hoisted(() => ({ analytics: vi.fn() }))
vi.mock('../../../services/listings/listingOverviewPerformanceService', () => ({ getListingOverviewAnalytics: mocks.analytics }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const detail = { listing: {}, row: { monthlyRent: 18500, landlordName: 'Owner Example' }, channels: [{ key: 'property24', label: 'Property24', status: 'Not Published' }], mediaProgress: [], mandateStatusLabel: 'Signed', marketingApprovalStatusLabel: 'Approved' }
it('opens the exact lead, tenancy, documents and pricing actions from loaded records', () => {
  const navigate = vi.fn(), openTab = vi.fn(), edit = vi.fn(), addLead = vi.fn(), schedule = vi.fn()
  const snapshot = buildRentalListingOverview({ listing: { id: 'listing-1' }, leads: [{ id: 'lead-1', name: 'Amy Tenant', role: 'tenant', stageLabel: 'Qualified', relationships: { listingId: 'listing-1' } }], tenancies: [{ id: 'tenancy-1', status: 'active', tenant: { identity: { firstName: 'Amy', lastName: 'Tenant' } } }] })
  render(<RentalListingOverview detail={detail} snapshot={snapshot} agentPanel={<div>Listing agent</div>} onNavigate={navigate} onOpenTab={openTab} onOpenEdit={edit} onAddLead={addLead} onScheduleViewing={schedule} />)
  fireEvent.click(screen.getByRole('button', { name: 'Open tenant lead for Amy Tenant' }))
  expect(navigate).toHaveBeenLastCalledWith('/agent/rentals/pipeline/leads/lead-1')
  fireEvent.click(screen.getByRole('button', { name: 'Open Tenant' }))
  expect(navigate).toHaveBeenLastCalledWith('/agent/rentals/tenancies/tenancy-1')
  fireEvent.click(screen.getByRole('button', { name: 'Open documents' }))
  expect(openTab).toHaveBeenLastCalledWith('mandate')
  fireEvent.click(screen.getByRole('button', { name: 'Edit pricing' }))
  expect(edit).toHaveBeenLastCalledWith('terms')
  fireEvent.click(screen.getByRole('button', { name: 'Add Tenant Lead' }))
  expect(addLead).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Schedule Viewing' }))
  expect(schedule).toHaveBeenCalledOnce()
})
it('links application records to the rental application workspace', () => {
  const navigate = vi.fn()
  render(<RentalListingRelatedPanels activeTab="leads" snapshot={{ leads: [], applications: [{ id: 'application-1', status: 'submitted', data: { identity: { firstName: 'Amy', lastName: 'Tenant' } } }], issues: [] }} onNavigate={navigate} />)
  fireEvent.click(screen.getByRole('button', { name: 'Amy Tenant submitted' }))
  expect(navigate).toHaveBeenCalledWith('/agent/rentals/applications/application-1')
})

it('distinguishes missing room counts from an explicit studio zero', () => {
  const snapshot = buildRentalListingOverview({ listing: { id: 'listing-1' } })
  render(<RentalListingOverview detail={{ ...detail, row: { ...detail.row, bedrooms: 0, bathrooms: null, parkingBays: '' } }} snapshot={snapshot} />)
  expect(screen.getByText('Bedrooms: 0')).toBeTruthy()
  expect(screen.getByText('Bathrooms: Not captured')).toBeTruthy()
  expect(screen.getByText('Parking: Not captured')).toBeTruthy()
})

it('loads the sales channel statistics layout with the rental scope and period while keeping rental lead totals', async () => {
  const listing = { id: 'rental-1', organisationId: 'org-1' }
  const metric = value => ({ value, available: true, complete: true, coveredDays: 30, expectedDays: 30 })
  const data = days => ({ windowDays: days, period: { startDate: '2026-09-14', endDate: '2026-10-13', completedDaysOnly: true },
    property24: { published: true, complete: true, metrics: { views: metric(12) } },
    privateProperty: { published: true, complete: true, metrics: { views: metric(0) } },
    website: { published: true, complete: true, metrics: { views: metric(3) } },
  })
  mocks.analytics.mockImplementation(({ days }) => Promise.resolve(data(days)))
  const snapshot = buildRentalListingOverview({ listing, leads: [{ id: 'tenant-1', role: 'tenant', name: 'Amy', relationships: { listingId: listing.id } }] })
  render(<RentalListingOverview detail={{ ...detail, listing, row: { ...detail.row, id: listing.id } }} snapshot={snapshot} />)
  const summary = within(screen.getByRole('group', { name: 'Listing performance summary' }))
  await summary.findByText('15')
  expect(summary.getByText('Total leads').parentElement.nextElementSibling.textContent).toBe('1')
  expect(mocks.analytics).toHaveBeenCalledWith({ organisationId: 'org-1', listingId: 'rental-1', days: 30 })
  expect(screen.getByRole('article', { name: 'Property24 statistics' })).toBeTruthy()
  expect(within(screen.getByRole('article', { name: 'Private Property statistics' })).getByText('0')).toBeTruthy()
  expect(screen.getByRole('article', { name: 'Website statistics' })).toBeTruthy()
  fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
  await summary.findByText('Across all channels · 7 days')
  expect(mocks.analytics).toHaveBeenLastCalledWith({ organisationId: 'org-1', listingId: 'rental-1', days: 7 })
})
