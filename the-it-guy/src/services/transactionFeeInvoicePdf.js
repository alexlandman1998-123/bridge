const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 })

const text = (value, fallback = '—') => String(value ?? '').trim() || fallback

export function buildTransactionFeeInvoiceDraftModel({
  invoiceReference = '',
  transactionId = '',
  billingPartyType = '',
  organisationName = '',
} = {}) {
  const reference = text(invoiceReference, '')
  if (!reference) throw new Error('An accounting-system invoice reference is required before downloading the invoice copy.')
  const billingParty = String(billingPartyType || '').trim().toLowerCase()
  if (!['agent', 'attorney'].includes(billingParty)) throw new Error('The recorded billing party must be agent or attorney.')
  return {
    reference,
    transactionId: text(transactionId),
    issuer: text(organisationName, 'Organisation details to be confirmed'),
    billedTo: billingParty === 'attorney' ? 'Attorney, as recorded for this transaction' : 'Agent, as recorded for this transaction',
    amountExVat: 1500,
    vatAmount: 225,
    amountInclVat: 1725,
  }
}

export async function downloadTransactionFeeInvoiceDraft(values = {}) {
  const model = buildTransactionFeeInvoiceDraftModel(values)
  const { jsPDF } = await import('jspdf')
  const document = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  document.setProperties({ title: `Transaction fee invoice ${model.reference}`, subject: 'R1,500 excl. VAT transaction fee', creator: 'Arch9' })
  document.setFontSize(20)
  document.text('TRANSACTION FEE INVOICE COPY', 18, 22)
  document.setFontSize(10)
  document.setTextColor('#5b6573')
  document.text('Finance-reviewed copy. The accounting-system invoice reference remains the source of truth.', 18, 30)
  document.setTextColor('#202938')
  const rows = [
    ['Issued by', model.issuer],
    ['Invoice reference', model.reference],
    ['Transaction', model.transactionId],
    ['Billed to', model.billedTo],
    ['Transaction fee excl. VAT', money.format(model.amountExVat)],
    ['VAT (15%)', money.format(model.vatAmount)],
    ['Total incl. VAT', money.format(model.amountInclVat)],
  ]
  let y = 48
  for (const [label, value] of rows) {
    document.setFontSize(10)
    document.setTextColor('#5b6573')
    document.text(label, 18, y)
    document.setTextColor('#202938')
    const valueLines = document.splitTextToSize(value, 105)
    document.text(valueLines, 82, y)
    y += Math.max(9, valueLines.length * 5 + 4)
    document.setDrawColor('#d9e1ea')
    document.line(18, y - 4, 192, y - 4)
  }
  document.setFontSize(9)
  document.setTextColor('#5b6573')
  document.text('Confirm recipient legal details and VAT treatment against the organisation’s approved billing records before external delivery.', 18, 278, { maxWidth: 174 })
  document.save(`transaction-fee-invoice-${model.reference.replace(/[^a-zA-Z0-9_-]/g, '-')}.pdf`)
  return model
}
