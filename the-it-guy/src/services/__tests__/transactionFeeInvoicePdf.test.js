import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTransactionFeeInvoiceDraftModel } from '../transactionFeeInvoicePdf.js'

test('builds the fixed R1,500 excl. VAT invoice-copy model', () => {
  const model = buildTransactionFeeInvoiceDraftModel({ invoiceReference: 'INV-100', transactionId: 'tx-1', billingPartyType: 'attorney', organisationName: 'Kingdom Real Estate' })
  assert.equal(model.amountExVat, 1500)
  assert.equal(model.vatAmount, 225)
  assert.equal(model.amountInclVat, 1725)
  assert.match(model.billedTo, /Attorney/)
})

test('requires an accounting reference and recorded billing party', () => {
  assert.throws(() => buildTransactionFeeInvoiceDraftModel({ billingPartyType: 'agent' }), /invoice reference/)
  assert.throws(() => buildTransactionFeeInvoiceDraftModel({ invoiceReference: 'INV-100', billingPartyType: 'buyer' }), /billing party/)
})
