import assert from 'node:assert/strict'
import { buildRentalTenantPlacementHandoff } from '../rentalTenantPlacementHandoffModel.js'

const handoff = buildRentalTenantPlacementHandoff({ id: 'lead-1', role: 'tenant', stage: 'placement_ready', name: 'Sam Tenant', email: 'sam@example.com', phone: '0710000000', workflow: { events: [{ applicationReference: 'RTA-SAM-1' }] } }, { listingId: 'listing-1' })
assert.equal(handoff.listingId, 'listing-1')
assert.equal(handoff.tenantName, 'Sam Tenant')
assert.equal(handoff.applicationReference, 'RTA-SAM-1')
assert.throws(() => buildRentalTenantPlacementHandoff({ role: 'tenant', stage: 'fica_pending' }, { listingId: 'listing-1' }), /Placement ready/)
console.log('rentalTenantPlacementHandoffModel.test.js passed')
