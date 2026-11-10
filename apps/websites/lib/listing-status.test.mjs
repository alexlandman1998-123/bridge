import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { presentListingFeatures } from './listing-features.ts'
import { listingStatusLabel } from './listing-status.ts'
import { resolveListingTransactionType } from './listing-transaction-type.ts'
import { resolveRentalPriceFrequency } from './listing-price.ts'

test('public cards and detail pages label saved sale statuses without changing rentals', () => {
  for (const [status, label] of [['active', 'For sale'], ['under_offer', 'Under offer'], ['sold', 'Sold'], [undefined, 'For sale']]) {
    assert.equal(listingStatusLabel({ transactionType: 'sale', listingStatus: status }), label)
    assert.equal(listingStatusLabel({ transactionType: 'rental', listingStatus: status }), 'To let')
  }
})

test('the website mapper reads status from its accepted public snapshot', () => {
  const source = readFileSync(new URL('./site-repository.ts', import.meta.url), 'utf8')
  const fn = source.slice(source.indexOf('function mapProperty('), source.indexOf('function mapPublishedProperties('))
  const js = ts.transpileModule(fn, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const map = new Function('resolveListingTransactionType', 'resolveRentalPriceFrequency', 'strings', `${js}; return mapProperty`)(resolveListingTransactionType, resolveRentalPriceFrequency, value => Array.isArray(value) ? value : [])
  for (const status of ['active', 'under_offer', 'sold']) {
    const property = map({ listing_id: 'fixture', listing_type: 'Sale', listing_status: status, asking_price: 900000, features: ['reduced_banner'] })
    assert.equal(property.listingStatus, status)
    assert.equal(property.price, 900000)
    assert.deepEqual(property.features, ['reduced_banner'])
    assert.notEqual(listingStatusLabel(property), status === 'active' ? 'Sold' : 'For sale')
  }
  assert.equal(map({ listing_id: 'legacy', listing_type: 'Sale' }).listingStatus, 'active')
})

test('published Reduced features show on sale and rental cards without replacing under-offer or sold status',()=>{
 assert.equal(listingStatusLabel({transactionType:'sale',listingStatus:'active',features:['reduced_banner']}),'Reduced')
 assert.equal(listingStatusLabel({transactionType:'rental',features:['reduced_banner']}),'Reduced · To let')
 assert.equal(listingStatusLabel({transactionType:'sale',listingStatus:'under_offer',features:['reduced_banner']}),'Under offer')
 assert.equal(listingStatusLabel({transactionType:'sale',listingStatus:'sold',features:['reduced_banner']}),'Sold')
 assert.equal(listingStatusLabel({transactionType:'sale',listingStatus:'active',features:[]}),'For sale')
})

test('the Reduced marketing label is not exposed as an internal amenity key',()=>{assert.deepEqual(presentListingFeatures(['reduced_banner','Swimming pool']).map(feature=>feature.label),['Swimming pool'])})
