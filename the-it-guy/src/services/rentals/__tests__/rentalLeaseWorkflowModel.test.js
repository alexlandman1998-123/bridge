import assert from 'node:assert/strict'
import {
  applyRentalLeaseWorkflowUpdate,
  buildRentalLeaseWorkflowActivityPayload,
  buildRentalLeaseWorkflowUpdateActivityPayload,
  mapRentalLeaseWorkflowActivity,
} from '../rentalLeaseWorkflowModel.js'

const createdPayload = buildRentalLeaseWorkflowActivityPayload({
  listingId: 'listing-1', tenantName: 'Jamie Tenant', leaseStartDate: '2026-09-01', occupationDate: '2026-09-01', monthlyRent: '15000', depositAmount: '30000', leaseStatus: 'draft', signatureStatus: 'not_started', depositStatus: 'requested', handoverStatus: 'scheduled', checkInStatus: 'scheduled', keysStatus: 'not_started', conditionReportStatus: 'not_started',
}, { listingTitle: 'Green Point apartment' }, {}, { nowIso: '2026-08-30T00:00:00.000Z' })
const lease = mapRentalLeaseWorkflowActivity({ id: 'created-1', created_at: '2026-08-30T00:00:00.000Z', metadata: createdPayload.metadata })
const updatePayload = buildRentalLeaseWorkflowUpdateActivityPayload(lease, { signatureStatus: 'fully_signed', depositStatus: 'verified', handoverStatus: 'completed' }, { nowIso: '2026-08-31T00:00:00.000Z' })
const updated = applyRentalLeaseWorkflowUpdate(lease, { id: 'update-1', created_at: '2026-08-31T00:00:00.000Z', metadata: updatePayload.metadata })

assert.equal(updated.reference, lease.reference)
assert.equal(updated.signatureStatus, 'fully_signed')
assert.equal(updated.depositStatus, 'verified')
assert.equal(updated.handoverStatus, 'completed')
console.log('Rental lease workflow model tests passed.')
