import assert from 'node:assert/strict'
import { assertTransactionCreationInput } from '../transactionCreationInput.js'

assert.throws(
  () => assertTransactionCreationInput({ setup: { buyerName: 'Buyer' } }),
  /Development and unit are required/,
)
assert.throws(
  () => assertTransactionCreationInput({
    transactionType: 'private_property',
    setup: { buyerName: 'Buyer', propertyAddressLine1: '1 Main Road', city: 'Cape Town' },
  }),
  /Property category is required/,
)
assert.throws(
  () => assertTransactionCreationInput({
    transactionType: 'private_property',
    propertyType: 'house',
    setup: { buyerName: 'Buyer', city: 'Cape Town' },
  }),
  /Property address is required/,
)
assert.throws(
  () => assertTransactionCreationInput({
    transactionType: 'private_property',
    propertyType: 'house',
    setup: { buyerName: 'Buyer', propertyAddressLine1: '1 Main Road' },
  }),
  /City is required/,
)
assert.throws(
  () => assertTransactionCreationInput({
    transactionType: 'private_property',
    propertyType: 'house',
    setup: { propertyAddressLine1: '1 Main Road', city: 'Cape Town' },
  }),
  /Buyer full name is required/,
)
assert.doesNotThrow(() => assertTransactionCreationInput({
  transactionType: 'private_property',
  propertyType: 'house',
  setup: { propertyAddressLine1: '1 Main Road', city: 'Cape Town' },
  allowIncomplete: true,
}))
assert.doesNotThrow(() => assertTransactionCreationInput({
  setup: { developmentId: 'dev-1', unitId: 'unit-1', buyerName: 'Buyer' },
}))

console.log('Transaction creation input tests passed.')
