import assert from 'node:assert/strict'
import {
  PROPERTY24_PHASE2_ALLOWED_CATEGORIES,
  PROPERTY24_PHASE2_PROPERTY_TYPES,
  resolveProperty24Phase2PropertyTypeId,
  verifyProperty24Phase2Catalogue,
} from '../server/property24/propertyTypeCatalogue.js'
import { resolveProperty24ListingCategory } from '../server/property24/listingCategoryContract.js'

assert.deepEqual(PROPERTY24_PHASE2_ALLOWED_CATEGORIES, ['residential', 'commercial', 'industrial', 'agricultural', 'land'])
assert.equal(resolveProperty24Phase2PropertyTypeId('Warehouse'), 12)
assert.equal(resolveProperty24Phase2PropertyTypeId('Vacant Land'), 8)
assert.equal(resolveProperty24Phase2PropertyTypeId('development'), null)
assert.equal(resolveProperty24ListingCategory({ property_type: 'development' }), 'unknown')
assert.equal(resolveProperty24ListingCategory({ property_type: 'vacant land' }), 'land')

const verified = verifyProperty24Phase2Catalogue(PROPERTY24_PHASE2_PROPERTY_TYPES)
assert.equal(verified.matches, true)
assert.deepEqual(verified.missing, [])
assert.deepEqual(verified.unexpected, [])

const changed = verifyProperty24Phase2Catalogue([...PROPERTY24_PHASE2_PROPERTY_TYPES, { id: 99, description: 'Development' }])
assert.equal(changed.matches, false)
assert.deepEqual(changed.unexpected, [{ id: 99, description: 'Development' }])

console.log('Property24 Phase 2 catalogue contract passed')
