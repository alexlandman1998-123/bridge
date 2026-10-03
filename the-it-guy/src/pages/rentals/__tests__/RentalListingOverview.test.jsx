// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import RentalListingOverview from '../RentalListingOverview'
import RentalListingRelatedPanels from '../RentalListingRelatedPanels'
import { buildRentalListingOverview } from '../../../services/rentals/rentalListingOverviewModel'
afterEach(cleanup)
const detail = { listing: {}, row: { monthlyRent: 18500, landlordName: 'Owner Example' }, channels: [{ key: 'property24', label: 'Property24', status: 'Not Published' }], mandateStatusLabel: 'Signed', marketingApprovalStatusLabel: 'Approved' }
it('opens the exact lead, tenancy, documents and pricing actions from loaded records', () => {
  const navigate = vi.fn(), openTab = vi.fn(), edit = vi.fn(), addLead = vi.fn(), schedule = vi.fn()
  const snapshot = buildRentalListingOverview({ listing: { id: 'listing-1' }, leads: [{ id: 'lead-1', name: 'Amy Tenant', role: 'tenant', stageLabel: 'Qualified', relationships: { listingId: 'listing-1' } }], tenancies: [{ id: 'tenancy-1', status: 'active', tenant: { identity: { firstName: 'Amy', lastName: 'Tenant' } } }] })
  render(<RentalListingOverview detail={detail} snapshot={snapshot} agentPanel={<div>Listing agent</div>} onNavigate={navigate} onOpenTab={openTab} onOpenEdit={edit} onAddLead={addLead} onScheduleViewing={schedule} />)
  fireEvent.click(screen.getByRole('button', { name: 'Amy Tenant Qualified' }))
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
