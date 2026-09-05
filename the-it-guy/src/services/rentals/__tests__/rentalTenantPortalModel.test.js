import assert from 'node:assert/strict'
import { validateRentalTenantPortalRequest } from '../rentalTenantPortalModel.js'
assert.deepEqual(validateRentalTenantPortalRequest({ requestType: 'maintenance', message: 'The kitchen tap is leaking.' }), [])
assert.ok(validateRentalTenantPortalRequest({ requestType: 'payment', message: 'Too short' }).length === 2)
console.log('rentalTenantPortalModel.test.js passed')
