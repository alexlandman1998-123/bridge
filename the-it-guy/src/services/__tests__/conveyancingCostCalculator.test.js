import assert from 'node:assert/strict'
import {
  calculateConveyancingQuote,
  calculateTransferDuty,
  TRANSFER_DUTY_TABLE_EFFECTIVE,
} from '../conveyancingCostCalculator.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('transfer duty uses the current SARS threshold', () => {
  assert.equal(TRANSFER_DUTY_TABLE_EFFECTIVE, '1 April 2025')
  assert.equal(calculateTransferDuty(1210000), 0)
  assert.equal(calculateTransferDuty(1500000), 8700)
})

test('transfer duty applies progressive brackets', () => {
  assert.equal(calculateTransferDuty(2000000), 33786)
  assert.equal(calculateTransferDuty(13310000), 1241456)
  assert.equal(calculateTransferDuty(14000000), 1331156)
})

test('VAT transactions do not include transfer duty', () => {
  const quote = calculateConveyancingQuote({
    purchasePrice: 2400000,
    transactionBasis: 'vat',
    financeType: 'cash',
  })
  assert.equal(quote.summary.transferDuty, 0)
  assert.equal(quote.lineItems.some((item) => item.key === 'transfer-duty'), false)
  assert.equal(quote.vatTransaction, true)
})

test('bond finance adds bond registration estimate separately', () => {
  const quote = calculateConveyancingQuote({
    purchasePrice: 1850000,
    bondAmount: 1500000,
    transactionBasis: 'resale',
    financeType: 'bond',
    propertyTitle: 'sectional',
  })
  assert.ok(quote.summary.buyerTotal > quote.summary.transferDuty)
  assert.ok(quote.lineItems.some((item) => item.key === 'bond-professional-fee'))
  assert.ok(quote.lineItems.some((item) => item.key === 'deeds-office-bond'))
})

test('seller cancellation is kept out of buyer collection total', () => {
  const withoutCancellation = calculateConveyancingQuote({
    purchasePrice: 1600000,
    financeType: 'cash',
    includeCancellation: false,
  })
  const withCancellation = calculateConveyancingQuote({
    purchasePrice: 1600000,
    financeType: 'cash',
    includeCancellation: true,
  })
  assert.equal(withCancellation.summary.buyerTotal, withoutCancellation.summary.buyerTotal)
  assert.ok(withCancellation.summary.sellerTotal > 0)
})
