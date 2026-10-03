// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import RentalListingLeadsPanel from '../RentalListingLeadsPanel'
afterEach(cleanup)
it('filters and pages actual property leads and opens the linked application', () => {
  const navigate = vi.fn()
  const leads = Array.from({ length: 12 }, (_, index) => ({ id: `lead-${index}`, name: `Tenant ${index}`, email: `tenant${index}@example.test`, source: index === 0 ? 'Property24' : 'Manual', stage: index === 0 ? 'qualified' : 'new', stageLabel: index === 0 ? 'Qualified' : 'New', createdAt: '2026-10-03T08:00:00Z' }))
  const snapshot = { leads, applications: [{ id: 'app-1', leadId: 'lead-0', status: 'submitted' }], viewings: [{ tenantLeadId: 'lead-0', startsAt: '2026-10-04T08:00:00Z' }], upcoming: [], leadCount: 12, viewingCount: 1, newLeadCount: 12, issues: [], refreshedAt: Date.parse('2026-10-03T10:00:00Z') }
  render(<RentalListingLeadsPanel snapshot={snapshot} onNavigate={navigate} />)
  const table = screen.getByRole('table')
  expect(within(table).getAllByRole('row')).toHaveLength(11)
  fireEvent.click(screen.getByRole('button', { name: 'Next leads page' }))
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  fireEvent.change(screen.getByRole('textbox', { name: 'Search listing leads' }), { target: { value: 'tenant0@example.test' } })
  expect(within(table).getAllByRole('row')).toHaveLength(2)
  fireEvent.click(within(table).getByRole('button', { name: 'submitted' }))
  expect(navigate).toHaveBeenCalledWith('/agent/rentals/applications/app-1')
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'Manual' } })
  expect(within(table).getByText('No leads match the current filters.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(within(table).getByText('Tenant 0')).toBeTruthy()
})
