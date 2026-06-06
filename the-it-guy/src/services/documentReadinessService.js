const CRITICAL_DOCUMENT_HINTS = [
  'id',
  'identity',
  'payslip',
  'pay slip',
  'bank statement',
  'statement',
  'proof of residence',
  'proof of address',
  'offer to purchase',
  'otp',
]

const BANK_NAME_HINTS = ['absa', 'fnb', 'nedbank', 'investec', 'standard bank', 'capitec', 'discovery']

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeStatus(value) {
  const normalized = normalizeLower(value)
  if (['verified', 'approved', 'accepted', 'completed'].includes(normalized)) return 'verified'
  if (['pending_review', 'under_review', 'reviewed'].includes(normalized)) return 'pending_review'
  if (['uploaded', 'generated', 'received'].includes(normalized)) return 'uploaded'
  if (['rejected', 'declined'].includes(normalized)) return 'rejected'
  if (['missing', 'requested', 'expired', 'not_started', 'pending'].includes(normalized)) return 'missing'
  return normalized || 'missing'
}

function rowHaystack(row = {}) {
  return [
    row.displayName,
    row.title,
    row.documentType,
    row.category,
    row.categoryLabel,
    row.requiredDocumentKey,
    row.relatedWorkflow,
    row.notes,
    row.description,
  ].map(normalizeLower).filter(Boolean).join(' ')
}

function isCriticalDocument(row = {}) {
  const haystack = rowHaystack(row)
  return Boolean(
    row.blocksStage ||
      normalizeLower(row.priority) === 'high' ||
      CRITICAL_DOCUMENT_HINTS.some((hint) => haystack.includes(hint)),
  )
}

function getTimestamp(row = {}) {
  const value = row.updatedAt || row.uploadedAt || row.createdAt || row.dueDate || ''
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function getBankNameForRequest(request = {}, configuredBanks = []) {
  const haystack = rowHaystack(request)
  const configured = asArray(configuredBanks).map((bank) => normalizeText(bank.bank || bank.name || bank.label)).filter(Boolean)
  const matchedConfigured = configured.find((bank) => haystack.includes(bank.toLowerCase()))
  if (matchedConfigured) return matchedConfigured
  const matchedHint = BANK_NAME_HINTS.find((bank) => haystack.includes(bank))
  return matchedHint ? matchedHint.replace(/\b\w/g, (match) => match.toUpperCase()) : ''
}

export function getCriticalDocuments(context = {}) {
  return asArray(context.requiredDocumentRows)
    .filter(isCriticalDocument)
    .sort((left, right) => {
      const leftStatus = normalizeStatus(left.status)
      const rightStatus = normalizeStatus(right.status)
      const rank = { missing: 0, rejected: 1, pending_review: 2, uploaded: 3, verified: 4 }
      return (rank[leftStatus] ?? 9) - (rank[rightStatus] ?? 9)
    })
}

export function getBankRequestedDocuments(context = {}) {
  const configuredBanks = asArray(context.configuredBanks)
  const requests = asArray(context.documentRequests)
    .filter((request) => {
      const bankName = getBankNameForRequest(request, configuredBanks)
      const haystack = rowHaystack(request)
      return Boolean(bankName || haystack.includes('bank requested') || haystack.includes('bank request'))
    })
    .map((request) => ({
      ...request,
      bankName: getBankNameForRequest(request, configuredBanks) || 'Bank Request',
      status: normalizeStatus(request.status),
    }))

  const grouped = new Map()
  for (const request of requests) {
    const key = request.bankName || 'Bank Request'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(request)
  }

  return [...grouped.entries()].map(([bankName, items]) => ({
    bankName,
    requestedAt: items.map(getTimestamp).filter(Boolean).sort((left, right) => right - left)[0] || 0,
    items,
  }))
}

export function getMissingDocuments(context = {}) {
  return getCriticalDocuments(context)
    .filter((row) => ['missing', 'rejected'].includes(normalizeStatus(row.status)))
    .slice(0, 5)
}

export function getRecentUploads(context = {}) {
  return asArray(context.documentLibraryRows)
    .filter((row) => Boolean(row.uploadedAt || row.updatedAt))
    .sort((left, right) => getTimestamp(right) - getTimestamp(left))
    .slice(0, 5)
}

export function getDocumentKpis(context = {}) {
  const requiredRows = asArray(context.requiredDocumentRows)
  const required = requiredRows.length
  const received = requiredRows.filter((row) => ['uploaded', 'pending_review', 'verified'].includes(normalizeStatus(row.status))).length
  const missing = requiredRows.filter((row) => normalizeStatus(row.status) === 'missing').length
  const verified = requiredRows.filter((row) => normalizeStatus(row.status) === 'verified').length
  const pendingReview = requiredRows.filter((row) => normalizeStatus(row.status) === 'pending_review').length
  const rejected = requiredRows.filter((row) => normalizeStatus(row.status) === 'rejected').length

  return { required, received, missing, verified, pendingReview, rejected }
}

export function calculateReadinessScore(context = {}) {
  const kpis = getDocumentKpis(context)
  if (!kpis.required) return 0

  const base = (kpis.received / kpis.required) * 55 + (kpis.verified / kpis.required) * 45
  const criticalMissingPenalty = getMissingDocuments(context).length * 12
  const rejectedPenalty = kpis.rejected * 10
  const pendingPenalty = kpis.pendingReview * 3
  return Math.max(0, Math.min(100, Math.round(base - criticalMissingPenalty - rejectedPenalty - pendingPenalty)))
}

export function getDocumentReadiness(applicationIdOrContext = {}, maybeContext = {}) {
  const context = typeof applicationIdOrContext === 'object' && applicationIdOrContext !== null
    ? applicationIdOrContext
    : { ...maybeContext, applicationId: applicationIdOrContext }
  const kpis = getDocumentKpis(context)
  const criticalDocuments = getCriticalDocuments(context)
  const missingDocuments = getMissingDocuments(context)
  const bankRequestedDocuments = getBankRequestedDocuments(context)
  const recentUploads = getRecentUploads(context)
  const score = calculateReadinessScore(context)
  const hasBlockingItems = missingDocuments.length > 0 || kpis.rejected > 0
  const scoreLabel = score >= 86 ? 'Ready' : score >= 61 ? 'Good' : score >= 31 ? 'Needs Attention' : 'Critical'

  return {
    applicationId: context.applicationId || null,
    score,
    scoreLabel,
    submissionReady: !hasBlockingItems,
    blockerCount: missingDocuments.length + kpis.rejected,
    summaryText: hasBlockingItems
      ? `${missingDocuments.length + kpis.rejected} critical item${missingDocuments.length + kpis.rejected === 1 ? '' : 's'} blocking submission`
      : 'All critical documents received',
    kpis,
    criticalDocuments,
    bankRequestedDocuments,
    missingDocuments,
    recentUploads,
  }
}

export default {
  getDocumentReadiness,
  calculateReadinessScore,
  getCriticalDocuments,
  getBankRequestedDocuments,
  getMissingDocuments,
  getRecentUploads,
  getDocumentKpis,
}
