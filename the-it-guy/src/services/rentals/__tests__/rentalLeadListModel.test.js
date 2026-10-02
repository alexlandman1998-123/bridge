import { expect, it } from 'vitest'
import { filterRentalLeadList, rentalLeadListSummary } from '../rentalLeadListModel.js'
const rows = [
  { id: '1', role: 'landlord', stage: 'new', name: 'Owner', source: 'Manual', createdAt: '2026-10-01', assignedAgentId: 'agent-1', outcome: { status: 'open' } },
  { id: '2', role: 'tenant', stage: 'contacted', name: 'Tenant', source: 'Property24', createdAt: '2026-10-02', outcome: { status: 'open' } },
  { id: '3', role: 'tenant', stage: 'qualified', name: 'Won tenant', source: 'Property24', outcome: { status: 'won', recordedAt: '2026-10-01' } },
  { id: '4', role: 'landlord', stage: 'contacted', source: 'Manual', outcome: { status: 'lost', recordedAt: '2026-09-01' } },
  { id: '5', role: 'landlord', stage: 'listing_created', source: 'Property24', outcome: { status: 'won', recordedAt: '2026-09-30' } },
]
it('uses scoped data and outcome dates for metrics without treating old conversions as MTD', () => {
  expect(rentalLeadListSummary(rows, new Date('2026-10-02'))).toMatchObject({ newLeads: 1, active: 2, landlord: 1, tenant: 1, closed: 3, converted: 1, convertedTenants: 1, convertedLandlords: 0, topSource: 'Property24', topSourceCount: 3, lost: 1, lostRate: 20 })
  expect(rentalLeadListSummary([])).toMatchObject({ active: 0, converted: 0, lostRate: 0, topSource: 'No source data' })
})
it('separates active role tabs from closed records and combines filters', () => {
  expect(filterRentalLeadList(rows, { role: 'closed' }).map((row) => row.id)).toEqual(['3', '4', '5'])
  expect(filterRentalLeadList(rows, { role: 'tenant', source: 'Property24', stage: 'contacted', owner: 'unassigned', query: 'tenant' }).map((row) => row.id)).toEqual(['2'])
  expect(filterRentalLeadList(rows, { role: 'landlord', owner: 'mine', assignedAgentId: 'agent-1' }).map((row) => row.id)).toEqual(['1'])
  expect(filterRentalLeadList(rows, { role: 'landlord', owner: 'agent-2' })).toEqual([])
})
it('sorts a copy and leaves the service rows unchanged', () => {
  const data = [rows[0], { ...rows[0], id: '6', createdAt: '2026-10-03' }]
  expect(filterRentalLeadList(data, { role: 'landlord' }).map((row) => row.id)).toEqual(['6', '1'])
  expect(filterRentalLeadList(data, { role: 'landlord', sort: 'oldest' }).map((row) => row.id)).toEqual(['1', '6'])
  expect(data.map((row) => row.id)).toEqual(['1', '6'])
})
