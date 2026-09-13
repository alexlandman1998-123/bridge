import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTransactionFeeInvoiceEmailDraft } from '../transactionFeeInvoiceDelivery.js'

test('builds a reviewed invoice delivery email for the recorded billing party', () => {
  const draft = buildTransactionFeeInvoiceEmailDraft({ recipientEmail: 'finance@example.com', billingPartyType: 'attorney', invoiceReference: 'INV-100', transactionId: 'tx-1' })
  assert.equal(draft.subject, 'Transaction fee invoice INV-100')
  assert.match(draft.body, /R1,725.00/)
})

test('rejects unverified delivery details', () => {
  assert.throws(() => buildTransactionFeeInvoiceEmailDraft({ billingPartyType: 'agent', invoiceReference: 'INV-100' }), /billing email/)
})
