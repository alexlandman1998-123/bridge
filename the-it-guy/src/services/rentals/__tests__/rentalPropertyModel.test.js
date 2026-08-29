import assert from 'node:assert/strict'
import { buildRentalPropertyListQuery, createRentalPropertyPayload, mapRentalProperty, validateRentalProperty } from '../rentalPropertyModel.js'

const property = createRentalPropertyPayload({ organisationId: 'org-1', branchId: 'branch-1', createdBy: 'user-1', name: 'Oak House', propertyType: 'House', addressLine1: '10 Oak Road', city: 'Cape Town', province: 'Western Cape', postalCode: '8001' })
assert.equal(property.property_type, 'house')
assert.equal(property.address_normalized, '10 oak road|cape town|western cape|8001')
assert.equal(validateRentalProperty({ organisationId: 'org-1', name: 'No address', propertyType: 'house' }).valid, false)
const mapped = mapRentalProperty({ id: 'property-1', ...property })
assert.equal(mapped.address.city, 'Cape Town')
assert.deepEqual(buildRentalPropertyListQuery({ organisationId: 'org-1', limit: 999 }), { organisationId: 'org-1', branchId: '', status: '', search: '', limit: 100 })
console.log('Rental property model tests passed.')
