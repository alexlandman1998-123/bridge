import assert from 'node:assert/strict'
import { createRentalTenantPortalAccess } from '../rentalTenantPortalAccessModel.js'
const access = await createRentalTenantPortalAccess({ tenancyId: 'tenancy-1', token: 'safe-token', now: new Date('2026-09-05T10:00:00.000Z'), expiresInMinutes: 60 })
assert.equal(access.tenancyId, 'tenancy-1')
assert.equal(access.token, 'safe-token')
assert.equal(access.expiresAt, '2026-09-05T11:00:00.000Z')
assert.match(access.tokenHash, /^[a-f0-9]{64}$/)
console.log('rentalTenantPortalAccessModel.test.js passed')
