import assert from 'node:assert/strict'
import { buildCataloguePriceByUnitType, validateDevelopmentProductCatalogue } from '../developmentProductCatalogueModel.js'

const catalogue = {
  unitTypes: [{ id: 'type-a', name: 'Type A' }],
  priceBooks: [{ id: 'current', isDefault: true }],
  prices: [{ id: 'price-a', priceBookId: 'current', unitTypeId: 'type-a', listPrice: 1650000 }],
}
assert.equal(buildCataloguePriceByUnitType(catalogue).get('type-a').listPrice, 1650000)
assert.deepEqual(validateDevelopmentProductCatalogue(catalogue), [])
assert.ok(validateDevelopmentProductCatalogue({ unitTypes: [{ name: 'Type A' }, { name: 'type a' }] }).some((error) => error.includes('duplicated')))
for (const storeys of [0, -1, 1.5, Infinity]) {
  assert.ok(validateDevelopmentProductCatalogue({ floorplans: [{ name: 'Duplex', storeys }] }).some((error) => error.includes('storeys')))
}
assert.deepEqual(validateDevelopmentProductCatalogue({ floorplans: [{ name: 'Duplex', storeys: 2 }, { name: 'Legacy plan' }] }), [])
console.log('development product catalogue model checks passed')
