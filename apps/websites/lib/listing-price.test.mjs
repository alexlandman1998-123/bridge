import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { resolveListingTransactionType } from './listing-transaction-type.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveRentalPriceFrequency, rentalPriceSuffix } from './listing-price.ts'

test('rental pricing preserves the captured unit instead of presenting every amount per month', () => {
  for (const [frequency, suffix] of [['monthly', ' / month'], ['weekly', ' / week'], ['daily', ' / day'], ['annual', ' / year'], ['per_square_metre', ' / m²']]) {
    assert.equal(rentalPriceSuffix({ transactionType: 'rental', rentalPriceFrequency: resolveRentalPriceFrequency(frequency) }), suffix)
  }
  assert.equal(resolveRentalPriceFrequency(undefined), 'monthly')
  assert.equal(resolveRentalPriceFrequency('unsupported'), undefined)
  assert.equal(rentalPriceSuffix({ transactionType: 'sale', rentalPriceFrequency: 'monthly' }), '')
})

test('the actual public mapper carries cadence from a published snapshot and preserves POA', () => {
  const source = readFileSync(new URL('./site-repository.ts', import.meta.url), 'utf8')
  const fn = source.slice(source.indexOf('function mapProperty('), source.indexOf('function mapPublishedProperties('))
  const javascript = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const map = new Function('resolveListingTransactionType', 'resolveRentalPriceFrequency', 'strings', `${javascript}; return mapProperty`)(resolveListingTransactionType, resolveRentalPriceFrequency, value => Array.isArray(value) ? value : [])
  for (const frequency of ['monthly', 'weekly', 'daily', 'annual', 'per_square_metre']) {
    const property = map({ listing_id: 'rental', listing_type: 'Rental', asking_price: 1200, rental_price_frequency: frequency })
    assert.equal(property.price, 1200)
    assert.equal(property.rentalPriceFrequency, frequency)
    assert.notEqual(rentalPriceSuffix(property), '')
  }
  assert.equal(map({ listing_id: 'sale', listing_type: 'Sale' }).price, undefined)
})
