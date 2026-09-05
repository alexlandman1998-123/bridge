import assert from 'node:assert/strict'
import { buildRentalCrmDashboard } from '../rentalCrmDashboardModel.js'

const dashboard = buildRentalCrmDashboard({
  now: new Date('2026-09-05T10:00:00.000Z'),
  leads: [
    { id: 'l1', role: 'landlord', stage: 'mandate_pending' },
    { id: 'l2', role: 'landlord', stage: 'listing_ready' },
    { id: 't1', role: 'tenant', stage: 'application_submitted' },
    { id: 't2', role: 'tenant', stage: 'fica_pending' },
    { id: 't3', role: 'tenant', stage: 'placement_ready' },
  ],
  tasks: [
    { status: 'Pending', dueDate: '2026-09-04T10:00:00.000Z' },
    { status: 'Pending', dueDate: '2026-09-06T10:00:00.000Z' },
    { status: 'Completed', dueDate: '2026-09-01T10:00:00.000Z' },
  ],
})

assert.equal(dashboard.leads.total, 5)
assert.equal(dashboard.leads.landlords, 2)
assert.equal(dashboard.leads.tenants, 3)
assert.equal(dashboard.leads.listingReady, 1)
assert.equal(dashboard.leads.applicationsSubmitted, 1)
assert.equal(dashboard.leads.ficaPending, 1)
assert.equal(dashboard.leads.placementReady, 1)
assert.deepEqual(dashboard.followUps, { overdue: 1, open: 1, completed: 1 })
assert.equal(dashboard.pipelines.landlords.find((stage) => stage.stage === 'mandate_pending').count, 1)
assert.equal(dashboard.pipelines.tenants.find((stage) => stage.stage === 'placement_ready').count, 1)
assert.equal(dashboard.attention.length, 3)

console.log('rentalCrmDashboardModel.test.js passed')
