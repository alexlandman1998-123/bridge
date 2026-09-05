import assert from 'node:assert/strict'
import { createRentalLandlordPortalAccess } from '../rentalLandlordPortalAccessModel.js'
const access = await createRentalLandlordPortalAccess({ propertyId: 'property-1', token: 'safe-token', now: new Date('2026-09-05T10:00:00.000Z'), expiresInMinutes: 60 })
assert.equal(access.propertyId, 'property-1'); assert.equal(access.expiresAt, '2026-09-05T11:00:00.000Z'); assert.match(access.tokenHash, /^[a-f0-9]{64}$/)
console.log('rentalLandlordPortalAccessModel.test.js passed')
