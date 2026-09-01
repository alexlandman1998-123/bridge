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
console.log('development product catalogue model checks passed')
