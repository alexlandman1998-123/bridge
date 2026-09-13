export const TRANSACTION_FEE_EX_VAT = 1500
export const TRANSACTION_FEE_VAT = 225
export const TRANSACTION_FEE_INCL_VAT = 1725

function text(value) {
  return String(value ?? '').trim()
}

export function buildTransactionFeeControlPayload({
  transactionId = '',
  otpDocumentId = '',
  billingPartyType = '',
  consentAndFeeTermsConfirmed = false,
  confirmationNote = '',
} = {}) {
  const billingParty = text(billingPartyType).toLowerCase()
  if (!text(transactionId)) throw new Error('A transaction is required to record the transaction fee control.')
  if (!['agent', 'attorney'].includes(billingParty)) {
    throw new Error('Choose whether the transaction fee will be billed to the agent or attorney.')
  }
  if (consentAndFeeTermsConfirmed !== true) {
    throw new Error('Confirm that the transaction-fee terms and consent form are included before uploading the OTP.')
  }

  return {
    p_transaction_id: text(transactionId),
    p_otp_document_id: text(otpDocumentId) || null,
    p_billing_party_type: billingParty,
    p_consent_and_fee_terms_confirmed: true,
    p_confirmation_note: text(confirmationNote) || null,
  }
}

export async function recordTransactionFeeControl(client, values = {}) {
  if (!client?.rpc) throw new Error('Transaction fee control is unavailable until the workspace is connected.')
  const payload = buildTransactionFeeControlPayload(values)
  const { data, error } = await client.rpc('bridge_record_transaction_fee_control', payload)
  if (error) throw error
  return data || null
}

export function buildAttorneyFeeReceiptPayload({
  transactionId = '',
  documentationReceived = false,
  receiptNote = '',
} = {}) {
  if (!text(transactionId)) throw new Error('A transaction is required to confirm document receipt.')
  if (documentationReceived !== true) {
    throw new Error('Confirm receipt and review of the signed OTP and approved consent documentation.')
  }

  return {
    p_transaction_id: text(transactionId),
    p_documentation_received: true,
    p_receipt_note: text(receiptNote) || null,
  }
}

export async function confirmAttorneyTransactionFeeReceipt(client, values = {}) {
  if (!client?.rpc) throw new Error('Attorney receipt confirmation is unavailable until the workspace is connected.')
  const payload = buildAttorneyFeeReceiptPayload(values)
  const { data, error } = await client.rpc('bridge_confirm_transaction_fee_attorney_receipt', payload)
  if (error) throw error
  return data || null
}


export function buildTransactionFeeInvoicePreparationPayload({ transactionId = '', financeNote = '' } = {}) {
  if (!text(transactionId)) throw new Error('A transaction is required to prepare a transaction-fee invoice.')
  return {
    p_transaction_id: text(transactionId),
    p_finance_note: text(financeNote) || null,
  }
}

export async function prepareTransactionFeeInvoice(client, values = {}) {
  if (!client?.rpc) throw new Error('Transaction-fee invoice preparation is unavailable until the workspace is connected.')
  const payload = buildTransactionFeeInvoicePreparationPayload(values)
  const { data, error } = await client.rpc('bridge_prepare_transaction_fee_invoice', payload)
  if (error) throw error
  return data || null
}

export function buildTransactionFeeInvoiceCompletionPayload({ transactionId = '', invoiceReference = '', financeNote = '' } = {}) {
  if (!text(transactionId)) throw new Error('A transaction is required to complete a transaction-fee invoice.')
  if (!text(invoiceReference)) throw new Error('Enter the invoice reference from your accounting system.')
  return {
    p_transaction_id: text(transactionId),
    p_invoice_reference: text(invoiceReference),
    p_finance_note: text(financeNote) || null,
  }
}

export async function completeTransactionFeeInvoice(client, values = {}) {
  if (!client?.rpc) throw new Error('Transaction-fee invoice completion is unavailable until the workspace is connected.')
  const payload = buildTransactionFeeInvoiceCompletionPayload(values)
  const { data, error } = await client.rpc('bridge_complete_transaction_fee_invoice', payload)
  if (error) throw error
  return data || null
}

export async function listTransactionFeeInvoiceQueue(client) {
  if (!client?.rpc) throw new Error('Transaction-fee invoice queue is unavailable until the workspace is connected.')
  const { data, error } = await client.rpc('bridge_list_transaction_fee_invoice_queue')
  if (error) throw error
  return Array.isArray(data) ? data : []
}
