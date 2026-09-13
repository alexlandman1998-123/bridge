import { buildFicaComplianceCertificateModel } from './ficaComplianceCertificateModel.js'

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}

export function renderFicaComplianceCertificateMarkup(input = {}) {
  const model = buildFicaComplianceCertificateModel(input)
  const rows = [
    ['Certificate reference', model.certificateReference],
    ['Party', `${model.partyName} (${model.partyRole})`],
    ['Transaction reference', model.transactionReference],
    ['Property reference', model.propertyReference],
    ['Verification provider', model.providerName],
    ['Provider reference', model.providerReference],
    ['Result', model.result],
    ['Reviewed by', model.reviewerName],
    ['Approved', model.approvedAt],
    ['Expires', model.expiresAt],
  ]
  const checks = model.checkSummary.length
    ? `<ul>${model.checkSummary.map((check) => `<li>${escapeHtml(check.label)}: <strong>${escapeHtml(check.status)}</strong></li>`).join('')}</ul>`
    : '<p>No individual check detail was supplied.</p>'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(model.title)}</title><style>body{font-family:Arial,sans-serif;color:#172033;margin:0}main{width:760px;margin:0 auto;padding:54px;border-top:12px solid #1769dc}h1{margin:0 0 6px;font-size:30px}p{line-height:1.5}table{border-collapse:collapse;width:100%;margin:28px 0}th,td{padding:11px 12px;border-bottom:1px solid #d9e0ea;text-align:left;font-size:14px}th{width:35%;color:#506078;background:#f5f8fc}.notice{margin-top:28px;padding:14px;background:#f5f8fc;border-radius:8px;font-size:13px;color:#506078}</style></head><body><main><p style="color:#1769dc;font-weight:700;margin:0 0 14px">ARCH9</p><h1>${escapeHtml(model.title)}</h1><p>This certificate records the approved compliance outcome. It does not contain identity numbers, document copies, or raw provider data.</p><table>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</table><h2>Check summary</h2>${checks}<p class="notice">Generated ${escapeHtml(model.generatedAt)}. This certificate is subject to the expiry date and the underlying compliance record.</p></main></body></html>`
}
