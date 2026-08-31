import assert from 'node:assert/strict'
import { buildRentalDashboardSnapshot } from '../rentalDashboardModel.js'

const snapshot = buildRentalDashboardSnapshot({
  listings: [{ status: 'active' }], leads: [{ role: 'landlord' }, { role: 'tenant' }], applications: [{ applicationStatus: 'submitted' }], leases: [{ leaseStatus: 'active', depositStatus: 'received_unverified', tenantName: 'Jamie' }], managementEvents: [{ type: 'maintenance', status: 'open' }, { type: 'arrears_follow_up', status: 'open' }],
})
assert.equal(snapshot.activeListings, 1)
assert.equal(snapshot.tenantLeads, 1)
assert.equal(snapshot.openApplications, 1)
assert.equal(snapshot.activeTenancies, 1)
assert.equal(snapshot.attention.length, 3)
console.log('Rental dashboard model tests passed.')
