function text(value = '') { return String(value || '').trim() }
function number(value = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }

function quote(value = '') {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function formatDate(value) {
  const date = new Date(value || '')
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : ''
}

export function buildProperty24AnalyticsCsv({ performance = {}, period = {} } = {}) {
  const rows = []
  const append = (...values) => rows.push(values.map(quote).join(','))
  append('Property24 analytics report')
  append('Period', formatDate(period.start), formatDate(period.end))
  append('Generated at', new Date().toISOString())
  append('')
  append('Summary metric', 'Value')
  append('Listing views', number(performance.listingViews))
  append('Listing alerts', number(performance.listingAlerts))
  append('Listing contact forms', number(performance.listingContactFormLeads))
  append('WhatsApp contact forms', number(performance.whatsAppContactFormLeads))
  append('Telephone contacts', number(performance.telephoneLeads))
  append('SMS contacts', number(performance.smsLeads))
  append('Total portal contacts', number(performance.totalContactLeads))
  append('Contact rate', performance.contactRate === null || performance.contactRate === undefined ? '' : `${number(performance.contactRate)}%`)
  append('Last statistics sync', text(performance.lastSyncedAt))
  append('')
  append('Daily date', 'Listing views', 'Listing contact forms', 'WhatsApp contact forms', 'Total portal contacts')
  for (const day of Array.isArray(performance.daily) ? performance.daily : []) {
    append(day?.date, number(day?.listingViews), number(day?.listingContactFormLeads), number(day?.whatsAppContactFormLeads), number(day?.totalContactLeads))
  }
  const insights = Array.isArray(performance.insights) ? performance.insights : []
  if (insights.length) {
    append('')
    append('Insight', 'Detail')
    for (const insight of insights) append(text(insight?.title), text(insight?.detail))
  }
  return `${rows.join('\n')}\n`
}

export function property24AnalyticsExportFilename(period = {}) {
  const end = formatDate(period.end) || new Date().toISOString().slice(0, 10)
  return `property24-analytics-${end}.csv`
}

export function downloadProperty24AnalyticsCsv(payload = {}) {
  const csv = buildProperty24AnalyticsCsv(payload)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = property24AnalyticsExportFilename(payload.period)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
