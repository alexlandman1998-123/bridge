import assert from 'node:assert/strict'
import { claimRentalUnitActiveTenancy, createRentalUnitPayload, normalizeRentalUnitLabel, releaseRentalUnitActiveTenancy, validateRentalUnit } from '../rentalUnitModel.js'

const singleHouseUnit = createRentalUnitPayload({ organisationId: 'org-1', propertyId: 'property-1', unitLabel: '', targetRent: 12000, depositAmount: 12000 })
assert.equal(singleHouseUnit.unit_label, 'MAIN')
const flat = createRentalUnitPayload({ organisationId: 'org-1', propertyId: 'property-1', unitLabel: ' apartment 2 ', bedrooms: 2, targetRent: 9000, depositAmount: 9000 })
assert.equal(normalizeRentalUnitLabel(flat.unit_label), 'APARTMENT 2')
assert.equal(validateRentalUnit({ organisationId: 'org-1', propertyId: 'property-1', targetRent: -1, depositAmount: 0 }).valid, false)
const occupied = claimRentalUnitActiveTenancy({ id: 'unit-1', status: 'vacant' }, 'tenancy-1')
assert.equal(occupied.status, 'occupied')
assert.throws(() => claimRentalUnitActiveTenancy(occupied, 'tenancy-2'), /already has an active tenancy/)
assert.equal(releaseRentalUnitActiveTenancy(occupied, 'tenancy-1').status, 'vacant')
console.log('Rental unit model tests passed.')
