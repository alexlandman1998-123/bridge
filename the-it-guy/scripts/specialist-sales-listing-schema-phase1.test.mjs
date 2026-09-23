import assert from 'node:assert/strict'
import {
  getSpecialistSalesListingSchema,
  resolveSpecialistSalesCategory,
} from '../src/services/listings/specialistSalesListingSchema.js'

assert.equal(resolveSpecialistSalesCategory('retail'), 'commercial')
assert.equal(resolveSpecialistSalesCategory('Farm'), 'agricultural')
assert.equal(resolveSpecialistSalesCategory('vacant_land'), 'land')

assert.deepEqual(
  getSpecialistSalesListingSchema('commercial').requiredFields,
  ['grossLettableArea', 'zoning', 'parking', 'listingTerms'],
)
assert.deepEqual(
  getSpecialistSalesListingSchema('industrial').requiredFields,
  ['warehouseOrFactoryArea', 'yardSize', 'powerSupply', 'loadingAccess'],
)
assert.deepEqual(
  getSpecialistSalesListingSchema('agricultural').requiredFields,
  ['farmSize', 'waterSupplyOrRights', 'agriculturalUse'],
)
assert.deepEqual(
  getSpecialistSalesListingSchema('vacant_land').requiredFields,
  ['erfSize', 'zoning'],
)

console.log('Specialist sales listing schema Phase 1 checks passed.')
