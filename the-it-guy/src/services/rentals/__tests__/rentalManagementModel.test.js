import assert from 'node:assert/strict'
import { buildRentalManagementEventPayload, buildRentalManagementSummary, mapRentalManagementEvent } from '../rentalManagementModel.js'

const lease = { id: 'lease-1', reference: 'RTL-JAMIE-1', listingId: 'listing-1', listingTitle: 'Green Point apartment', tenantName: 'Jamie Tenant', leaseStatus: 'active', leaseEndDate: '2026-10-01' }
const payload = buildRentalManagementEventPayload(lease, { type: 'maintenance', status: 'open', dueDate: '2026-09-05', note: 'Repair leaking tap.' }, { nowIso: '2026-08-30T00:00:00.000Z' })
const event = mapRentalManagementEvent({ id: 'event-1', metadata: payload.metadata })
const summary = buildRentalManagementSummary({ leases: [lease], events: [event], now: new Date('2026-08-30T00:00:00.000Z') })

assert.equal(event.leaseReference, 'RTL-JAMIE-1')
assert.equal(summary.activeTenancies, 1)
assert.equal(summary.renewalsDue, 1)
assert.equal(summary.openMaintenance, 1)
console.log('Rental management model tests passed.')
