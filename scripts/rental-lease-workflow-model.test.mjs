import assert from 'node:assert/strict'

import {
  buildRentalLeaseInitialFormFromApplication,
  buildRentalLeaseWorkflowActivityPayload,
  buildRentalLeaseWorkflowMetadata,
  mapRentalLeaseWorkflowActivity,
  validateRentalLeaseWorkflowForm,
} from '../the-it-guy/src/services/rentals/rentalLeaseWorkflowModel.js'

const listing = {
  id: 'listing-1',
  title: '2 bedroom apartment in Sea Point',
  askingPrice: 18000,
}

const application = {
  listingId: 'listing-1',
  reference: 'RTA-TAYLORTE-20260820',
  tenantName: 'Taylor Tenant',
  tenantEmail: 'tenant@example.com',
  tenantPhone: '+27820000000',
  intendedOccupationDate: '2026-10-01',
}

const initial = buildRentalLeaseInitialFormFromApplication(application, listing)
assert.equal(initial.listingId, 'listing-1')
assert.equal(initial.applicationReference, 'RTA-TAYLORTE-20260820')
assert.equal(initial.leaseStartDate, '2026-10-01')
assert.equal(initial.leaseEndDate, '2027-09-30')
assert.equal(initial.monthlyRent, '18000')
assert.equal(initial.depositAmount, '36000')

const form = {
  ...initial,
  leaseStatus: 'generated',
  signatureStatus: 'prepared',
  depositStatus: 'requested',
  handoverStatus: 'scheduled',
  checkInStatus: 'scheduled',
  keysStatus: 'not_started',
  conditionReportStatus: 'not_started',
  notes: 'Lease draft ready for signature.',
}

assert.deepEqual(validateRentalLeaseWorkflowForm(form), [])

const metadata = buildRentalLeaseWorkflowMetadata(form, listing, application, {
  nowIso: '2026-08-20T19:00:00.000Z',
})
assert.equal(metadata.captureVersion, 'arch9_rental_lease_capture_v1')
assert.equal(metadata.lease.monthlyRent, 18000)
assert.equal(metadata.deposit.accountingEnabled, false)
assert.match(metadata.leaseReference, /^RTL-TAYLORTE-20260820/)

const payload = buildRentalLeaseWorkflowActivityPayload(form, listing, application, {
  nowIso: '2026-08-20T19:00:00.000Z',
  performedBy: 'agent-1',
})
assert.equal(payload.privateListingId, 'listing-1')
assert.equal(payload.activityType, 'rental_lease_workflow_created')
assert.equal(payload.visibility, 'internal')

const mapped = mapRentalLeaseWorkflowActivity({
  id: 'activity-1',
  private_listing_id: 'listing-1',
  activity_type: 'rental_lease_workflow_created',
  metadata,
  created_at: '2026-08-20T19:00:00.000Z',
}, listing)
assert.equal(mapped.tenantName, 'Taylor Tenant')
assert.equal(mapped.leaseStatus, 'generated')
assert.equal(mapped.depositStatus, 'requested')
assert.equal(mapped.handoverStatus, 'scheduled')

assert.ok(
  validateRentalLeaseWorkflowForm({ ...form, monthlyRent: '' }).includes('Monthly rent is required.'),
)

console.log('rental lease workflow model tests passed')
