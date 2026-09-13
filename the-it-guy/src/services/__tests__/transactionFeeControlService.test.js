import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TRANSACTION_FEE_EX_VAT,
  TRANSACTION_FEE_INCL_VAT,
  TRANSACTION_FEE_VAT,
  buildAttorneyFeeReceiptPayload,
  buildTransactionFeeInvoiceCompletionPayload,
  buildTransactionFeeInvoicePreparationPayload,
  buildTransactionFeeControlPayload,
  confirmAttorneyTransactionFeeReceipt,
  completeTransactionFeeInvoice,
  listTransactionFeeInvoiceQueue,
  prepareTransactionFeeInvoice,
  recordTransactionFeeControl,
} from '../transactionFeeControlService.js'

test('uses the fixed R1,500 excl. VAT phase-one fee values', () => {
  assert.equal(TRANSACTION_FEE_EX_VAT, 1500)
  assert.equal(TRANSACTION_FEE_VAT, 225)
  assert.equal(TRANSACTION_FEE_INCL_VAT, 1725)
})

test('builds a confirmed attorney-billed fee control payload', () => {
  assert.deepEqual(buildTransactionFeeControlPayload({
    transactionId: 'transaction-1',
    otpDocumentId: 'document-1',
    billingPartyType: 'Attorney',
    consentAndFeeTermsConfirmed: true,
    confirmationNote: 'Included in signed pack.',
  }), {
    p_transaction_id: 'transaction-1',
    p_otp_document_id: 'document-1',
    p_billing_party_type: 'attorney',
    p_consent_and_fee_terms_confirmed: true,
    p_confirmation_note: 'Included in signed pack.',
  })
})

test('requires a billing party and confirmation', () => {
  assert.throws(() => buildTransactionFeeControlPayload({ transactionId: 'transaction-1', consentAndFeeTermsConfirmed: true }), /agent or attorney/)
  assert.throws(() => buildTransactionFeeControlPayload({ transactionId: 'transaction-1', billingPartyType: 'agent' }), /consent form/)
})

test('builds an attorney receipt confirmation without changing the billing party', () => {
  assert.deepEqual(buildAttorneyFeeReceiptPayload({
    transactionId: 'transaction-1',
    documentationReceived: true,
    receiptNote: 'Signed pack reviewed.',
  }), {
    p_transaction_id: 'transaction-1',
    p_documentation_received: true,
    p_receipt_note: 'Signed pack reviewed.',
  })
  assert.throws(
    () => buildAttorneyFeeReceiptPayload({ transactionId: 'transaction-1' }),
    /signed OTP and approved consent/,
  )
})

test('calls the protected database function', async () => {
  const calls = []
  const result = await recordTransactionFeeControl({
    rpc: async (name, payload) => {
      calls.push({ name, payload })
      return { data: { status: 'verified' }, error: null }
    },
  }, {
    transactionId: 'transaction-1',
    billingPartyType: 'agent',
    consentAndFeeTermsConfirmed: true,
  })
  assert.equal(result.status, 'verified')
  assert.equal(calls[0].name, 'bridge_record_transaction_fee_control')
})

test('calls the attorney receipt confirmation function', async () => {
  const calls = []
  const result = await confirmAttorneyTransactionFeeReceipt({
    rpc: async (name, payload) => {
      calls.push({ name, payload })
      return { data: { attorneyReceiptConfirmed: true }, error: null }
    },
  }, {
    transactionId: 'transaction-1',
    documentationReceived: true,
  })
  assert.equal(result.attorneyReceiptConfirmed, true)
  assert.equal(calls[0].name, 'bridge_confirm_transaction_fee_attorney_receipt')
})

test('builds controlled finance invoice payloads', () => {
  assert.deepEqual(buildTransactionFeeInvoicePreparationPayload({
    transactionId: 'transaction-1',
    financeNote: 'Prepare after checking billing details.',
  }), {
    p_transaction_id: 'transaction-1',
    p_finance_note: 'Prepare after checking billing details.',
  })
  assert.deepEqual(buildTransactionFeeInvoiceCompletionPayload({
    transactionId: 'transaction-1',
    invoiceReference: 'INV-100',
  }), {
    p_transaction_id: 'transaction-1',
    p_invoice_reference: 'INV-100',
    p_finance_note: null,
  })
  assert.throws(() => buildTransactionFeeInvoiceCompletionPayload({ transactionId: 'transaction-1' }), /invoice reference/)
})

test('uses protected invoice queue database functions', async () => {
  const calls = []
  const client = {
    rpc: async (name, payload) => {
      calls.push({ name, payload })
      if (name === 'bridge_list_transaction_fee_invoice_queue') return { data: [{ status: 'ready_to_prepare' }], error: null }
      return { data: { status: name.includes('complete') ? 'completed' : 'ready_for_finance' }, error: null }
    },
  }
  await prepareTransactionFeeInvoice(client, { transactionId: 'transaction-1' })
  const completed = await completeTransactionFeeInvoice(client, { transactionId: 'transaction-1', invoiceReference: 'INV-100' })
  const queue = await listTransactionFeeInvoiceQueue(client)
  assert.equal(completed.status, 'completed')
  assert.equal(queue[0].status, 'ready_to_prepare')
  assert.deepEqual(calls.map((call) => call.name), [
    'bridge_prepare_transaction_fee_invoice',
    'bridge_complete_transaction_fee_invoice',
    'bridge_list_transaction_fee_invoice_queue',
  ])
})
