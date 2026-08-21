import assert from 'node:assert/strict'

import {
  buildRentalApplicationActivityMetadata,
  buildRentalApplicationActivityPayload,
  calculateRentalAffordability,
  mapRentalApplicationActivity,
  validateRentalApplicationDraftForm,
} from '../the-it-guy/src/services/rentals/rentalApplicationDraftModel.js'

const listing = {
  id: 'listing-1',
  title: '2 bedroom apartment in Sea Point',
  askingPrice: 18000,
}

const form = {
  listingId: 'listing-1',
  tenantName: 'Taylor Tenant',
  tenantEmail: 'tenant@example.com',
  tenantPhone: '+27820000000',
  intendedOccupationDate: '2026-10-01',
  householdSize: '2',
  employmentStatus: 'employed',
  employerName: 'Acme Pty Ltd',
  monthlyIncome: '62000',
  otherIncome: '5000',
  monthlyObligations: '7000',
  currentLandlordName: 'Current Landlord',
  currentLandlordPhone: '+27821111111',
  employerReferenceName: 'Manager',
  employerReferencePhone: '+27822222222',
  idDocumentStatus: 'received',
  proofOfIncomeStatus: 'received',
  bankStatementsStatus: 'requested',
  referenceConsentStatus: 'received',
  creditCheckStatus: 'submitted',
  applicationStatus: 'screening',
  landlordApprovalStatus: 'not_sent',
  notes: 'Applicant prefers a 12 month lease.',
}

assert.deepEqual(validateRentalApplicationDraftForm(form), [])

const affordability = calculateRentalAffordability(form, listing)
assert.equal(affordability.monthlyRent, 18000)
assert.equal(affordability.netAvailableIncome, 60000)
assert.equal(affordability.score, 'strong')

const metadata = buildRentalApplicationActivityMetadata(form, listing, { nowIso: '2026-08-20T19:00:00.000Z' })
assert.equal(metadata.captureVersion, 'arch9_rental_application_capture_v1')
assert.equal(metadata.tenant.name, 'Taylor Tenant')
assert.equal(metadata.screening.creditCheckStatus, 'submitted')
assert.equal(metadata.documents.proofOfIncomeStatus, 'received')
assert.match(metadata.applicationReference, /^RTA-TAYLORTE-20260820/)

const payload = buildRentalApplicationActivityPayload(form, listing, {
  nowIso: '2026-08-20T19:00:00.000Z',
  performedBy: 'agent-1',
})
assert.equal(payload.privateListingId, 'listing-1')
assert.equal(payload.activityType, 'rental_application_received')
assert.equal(payload.visibility, 'internal')

const mapped = mapRentalApplicationActivity({
  id: 'activity-1',
  private_listing_id: 'listing-1',
  activity_type: 'rental_application_received',
  metadata,
  created_at: '2026-08-20T19:00:00.000Z',
}, listing)
assert.equal(mapped.tenantName, 'Taylor Tenant')
assert.equal(mapped.applicationStatus, 'screening')
assert.equal(mapped.affordabilityScore, 'strong')

assert.ok(
  validateRentalApplicationDraftForm({ ...form, tenantName: '' }).includes('Tenant name is required.'),
)

console.log('rental application draft model tests passed')
