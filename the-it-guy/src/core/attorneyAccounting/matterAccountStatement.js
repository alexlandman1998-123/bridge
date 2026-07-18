function title(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isoDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value || '')
  return date.toISOString().slice(0, 10)
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvLine(values = []) {
  return values.map(csvCell).join(',')
}

function safeFilePart(value, fallback = 'account') {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

export function buildMatterFinancialStatementFileName(account = {}, { scope = 'matter' } = {}) {
  const party = safeFilePart(account.partyLabel || account.partyRole || 'account')
  const role = safeFilePart(account.partyRole || 'client')
  const date = new Date().toISOString().slice(0, 10)
  return `bridge-${safeFilePart(scope)}-${role}-${party}-statement-${date}.csv`
}

export function buildMatterFinancialStatementCsv(account = {}, { includeInternal = false, generatedFor = 'client' } = {}) {
  const balance = account.balance || {}
  const documents = Array.isArray(account.documents) ? account.documents : []
  const entries = Array.isArray(account.entries) ? account.entries : []
  const events = Array.isArray(account.events) ? account.events : []
  const paymentInstructions = account.paymentInstructions || {}
  const readiness = account.readiness || {}
  const visibleEvents = includeInternal ? events : events.filter((event) => event.eventVisibility !== 'internal')
  const generatedAt = new Date().toISOString()

  const rows = [
    ['Bridge matter account statement'],
    ['Generated at', generatedAt],
    ['Generated for', generatedFor],
    ['Account', account.partyLabel || title(account.partyRole) || 'Matter account'],
    ['Party role', title(account.partyRole)],
    ['Email', account.partyEmail || ''],
    ['Currency', account.currencyCode || 'ZAR'],
    [],
    ['Summary'],
    ['Opening balance', numberValue(balance.openingBalance ?? account.openingBalance)],
    ['Total charged', numberValue(balance.totalCharged)],
    ['Total received / credited', numberValue(balance.totalCredited)],
    ['Balance due', numberValue(balance.balanceDue)],
    ['Last posted at', isoDate(balance.lastPostedAt)],
    ['Readiness', readiness.label || 'Not assessed'],
    ['Readiness issues', Array.isArray(readiness.issues) ? readiness.issues.join(' | ') : ''],
    ['Readiness warnings', Array.isArray(readiness.warnings) ? readiness.warnings.join(' | ') : ''],
    [],
    ['Payment instructions'],
    ['Published', paymentInstructions.published === true ? 'Yes' : 'No'],
    ['Account holder', paymentInstructions.accountHolder || ''],
    ['Bank', paymentInstructions.bankName || ''],
    ['Account number', paymentInstructions.accountNumber || ''],
    ['Branch code', paymentInstructions.branchCode || ''],
    ['Account type', paymentInstructions.accountType || ''],
    ['Payment reference', paymentInstructions.paymentReference || ''],
    ['Instructions', paymentInstructions.instructions || ''],
    [],
    ['Ledger entries'],
    ['Date', 'Type', 'Description', 'Amount', 'Status', 'Visibility', 'Document reference'],
    ...entries.map((entry) => [
      isoDate(entry.occurredOn),
      title(entry.entryType),
      entry.description || '',
      numberValue(entry.amount),
      title(entry.entryStatus),
      title(entry.entryVisibility),
      entry.financialDocumentId || '',
    ]),
    [],
    ['Published documents'],
    ['Published date', 'Type', 'Title', 'Reference', 'Total', 'Due', 'Status', 'Visibility'],
    ...documents.map((document) => [
      isoDate(document.publishedAt || document.issuedOn),
      title(document.documentType),
      document.title || '',
      document.externalReference || '',
      numberValue(document.amountTotal),
      numberValue(document.amountDue),
      title(document.documentStatus),
      title(document.audienceRole),
    ]),
    [],
    ['Updates'],
    ['Date', 'Type', 'Visibility', 'Description', 'Amount'],
    ...visibleEvents.map((event) => {
      const payload = event.payload || {}
      return [
        isoDate(event.createdAt),
        title(event.eventType),
        title(event.eventVisibility),
        payload.title || payload.description || payload.reference || '',
        payload.amount ? numberValue(payload.amount) : '',
      ]
    }),
  ]

  return `${rows.map(csvLine).join('\n')}\n`
}

export function downloadMatterFinancialStatement(account = {}, options = {}) {
  const csv = buildMatterFinancialStatementCsv(account, options)
  const fileName = buildMatterFinancialStatementFileName(account, options)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
  return { fileName, csv }
}
