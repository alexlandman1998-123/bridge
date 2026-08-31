import assert from 'node:assert/strict'
import { buildRentalCalendarItems } from '../rentalCalendarModel.js'
const items = buildRentalCalendarItems({ leases: [{ id: 'lease-1', occupationDate: '2026-09-05', leaseStatus: 'active', handoverStatus: 'scheduled', tenantName: 'Jamie' }], events: [{ id: 'event-1', dueDate: '2026-09-01', type: 'inspection', status: 'open', tenantName: 'Jamie' }] })
assert.equal(items.length, 2)
assert.equal(items[0].type, 'inspection')
assert.equal(items[1].type, 'occupation')
console.log('Rental calendar model tests passed.')
