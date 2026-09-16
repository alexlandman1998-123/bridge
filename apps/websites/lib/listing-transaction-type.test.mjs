import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveListingTransactionType } from './listing-transaction-type.ts'

test('classifies only explicit sale and rental source values', () => {
  assert.equal(resolveListingTransactionType('Sale'), 'sale')
  assert.equal(resolveListingTransactionType('For Sale'), 'sale')
  assert.equal(resolveListingTransactionType('Rental'), 'rental')
  assert.equal(resolveListingTransactionType('To Let'), 'rental')
})

test('excludes ambiguous or missing source values from public listing results', () => {
  assert.equal(resolveListingTransactionType('Both'), null)
  assert.equal(resolveListingTransactionType('Unknown'), null)
  assert.equal(resolveListingTransactionType(''), null)
  assert.equal(resolveListingTransactionType(undefined), null)
})
