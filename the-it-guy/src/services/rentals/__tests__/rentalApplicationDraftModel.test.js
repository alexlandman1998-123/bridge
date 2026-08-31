import assert from 'node:assert/strict'
import {
  buildRentalApplicationActivityMetadata,
  mapRentalApplicationActivity,
} from '../rentalApplicationDraftModel.js'

const metadata = buildRentalApplicationActivityMetadata({
  listingId: 'listing-1',
  tenantLeadId: 'tenant-lead-1',
  tenantName: 'Jamie Tenant',
  tenantEmail: 'jamie@example.com',
  monthlyIncome: '45000',
}, { listingTitle: 'Green Point apartment', askingPrice: 15000 }, { nowIso: '2026-08-30T00:00:00.000Z' })

assert.equal(metadata.tenantLeadId, 'tenant-lead-1')
assert.equal(metadata.affordability.score, 'strong')
assert.equal(mapRentalApplicationActivity({ id: 'activity-1', metadata }).tenantLeadId, 'tenant-lead-1')
console.log('Rental application draft model tests passed.')
