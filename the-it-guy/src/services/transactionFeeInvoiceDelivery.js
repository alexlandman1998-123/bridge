const text = (value) => String(value ?? '').trim()

export function buildTransactionFeeInvoiceEmailDraft({ recipientEmail = '', billingPartyType = '', invoiceReference = '', transactionId = '' } = {}) {
  const email = text(recipientEmail).toLowerCase()
  const billingParty = text(billingPartyType).toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter the agreed billing email address before preparing delivery.')
  if (!['agent', 'attorney'].includes(billingParty)) throw new Error('The recorded billing party must be agent or attorney.')
  if (!text(invoiceReference)) throw new Error('An accounting-system invoice reference is required before preparing delivery.')
  return {
    recipientEmail: email,
    subject: `Transaction fee invoice ${text(invoiceReference)}`,
    body: `Dear ${billingParty === 'attorney' ? 'Attorney' : 'Agent'},\n\nPlease find the transaction fee invoice attached.\n\nInvoice reference: ${text(invoiceReference)}\nTransaction reference: ${text(transactionId)}\nAmount due: R1,725.00 (R1,500.00 excl. VAT plus R225.00 VAT).\n\nKind regards`,
  }
}
