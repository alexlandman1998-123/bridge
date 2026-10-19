const cell = value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
export function reportInvoiceCsv(invoice) {
  const lines = invoice.knowledge_factory_report_invoice_lines || [];
  return [['Invoice reference', 'Month', 'Status', 'Report', 'Date', 'Amount (ZAR)'],
    ...lines.map(line => [invoice.id, invoice.invoice_month, invoice.status, line.product_name, line.created_at, (line.amount_cents / 100).toFixed(2)])]
    .map(row => row.map(cell).join(',')).join('\r\n');
}
