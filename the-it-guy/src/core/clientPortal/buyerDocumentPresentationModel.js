const ACTION_STATUSES = new Set(['required', 'requested', 'rejected', 'missing', 'outstanding', 'action_required', 'action-required'])
const REVIEW_STATUSES = new Set(['uploaded', 'under_review', 'under-review', 'received', 'reviewed', 'pending_review', 'pending-review'])
const APPROVED_STATUSES = new Set(['approved', 'completed', 'complete', 'verified', 'signed', 'available'])

export const BUYER_DOCUMENT_CATEGORIES = Object.freeze([
  Object.freeze({ key: 'sales', label: 'Sales Documents', shortLabel: 'Sales' }),
  Object.freeze({ key: 'fica', label: 'FICA Documents', shortLabel: 'FICA' }),
  Object.freeze({ key: 'finance', label: 'Finance Documents', shortLabel: 'Finance' }),
  Object.freeze({ key: 'property', label: 'Property Documents', shortLabel: 'Property' }),
  Object.freeze({ key: 'additional', label: 'Additional Requests', shortLabel: 'Additional' }),
])

function normalizeText(value = '') {
  return String(value || '').trim()
}
function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function resolveBuyerDocumentCategory(item = {}) {
  const explicit = normalizeKey(item.buyerCategoryKey || item.categoryKey || item.sellerCategoryKey)
  if (BUYER_DOCUMENT_CATEGORIES.some((category) => category.key === explicit)) return explicit

  const haystack = normalizeText([
    item.group,
    item.category,
    item.sourceId,
    item.title,
    item.description,
  ].filter(Boolean).join(' ')).toLowerCase()
  if (/additional/.test(haystack)) return 'additional'
  if (/bond|bank|finance|income|employ|affordability|proof.of.funds|source.of.funds|deposit|cash|salary|statement|liabilit|payslip/.test(haystack)) return 'finance'
  if (/offer|otp|reservation|sale agreement|agreement of sale|purchase agreement|signed/.test(haystack)) return 'sales'
  if (/property|unit|developer|specification|plan|levy|rates|hoa|body corporate|sectional title/.test(haystack)) return 'property'
  return 'fica'
}

export function resolveBuyerDocumentStatus(item = {}) {
  const rawStatus = normalizeKey(item.status || item.requiredDocumentStatus || item.required_document_status)
  if (item.actionRequired || ACTION_STATUSES.has(rawStatus)) return 'action'
  if (item.reviewRequired || REVIEW_STATUSES.has(rawStatus)) return 'review'
  if (item.satisfied || APPROVED_STATUSES.has(rawStatus)) return 'approved'
  if (item.linkedDocument || item.hasUploadedDocument || item.uploaded) return 'review'
  if (item.uploadSpec) return 'action'
  return 'upcoming'
}

function statusLabel(status, item = {}) {
  if (status === 'action') return normalizeKey(item.status) === 'rejected' ? 'Rejected' : 'Action required'
  if (status === 'review') return 'In review'
  if (status === 'approved') return 'Approved'
  return 'Upcoming'
}

export function buildBuyerDocumentPresentationModel({ items = [], source = 'unknown' } = {}) {
  const normalizedItems = (Array.isArray(items) ? items : []).filter(Boolean).map((item, index) => {
    const categoryKey = resolveBuyerDocumentCategory(item)
    const presentationStatus = resolveBuyerDocumentStatus(item)
    return Object.freeze({
      ...item,
      id: normalizeText(item.id || item.sourceId || item.uploadKey) || `buyer-document-${index + 1}`,
      title: normalizeText(item.title || item.label) || `Document ${index + 1}`,
      description: normalizeText(item.description || item.message) || 'Supporting document for your property purchase.',
      categoryKey,
      categoryLabel: BUYER_DOCUMENT_CATEGORIES.find((category) => category.key === categoryKey)?.label || 'Documents',
      presentationStatus,
      presentationStatusLabel: statusLabel(presentationStatus, item),
      isActionRequired: presentationStatus === 'action',
      isInReview: presentationStatus === 'review',
      isApproved: presentationStatus === 'approved',
      isUpcoming: presentationStatus === 'upcoming',
    })
  })
  const counts = normalizedItems.reduce((result, item) => {
    result[item.presentationStatus] += 1
    result.total += 1
    return result
  }, { action: 0, review: 0, approved: 0, upcoming: 0, total: 0 })
  const receivedCount = counts.review + counts.approved
  const completionPercent = counts.total ? Math.round((counts.approved / counts.total) * 100) : 100
  const collectionPercent = counts.total ? Math.round((receivedCount / counts.total) * 100) : 100
  const categories = BUYER_DOCUMENT_CATEGORIES.map((category) => {
    const categoryItems = normalizedItems.filter((item) => item.categoryKey === category.key)
    return Object.freeze({
      ...category,
      items: Object.freeze(categoryItems),
      counts: Object.freeze(categoryItems.reduce((result, item) => {
        result[item.presentationStatus] += 1
        result.total += 1
        return result
      }, { action: 0, review: 0, approved: 0, upcoming: 0, total: 0 })),
    })
  })
  const sortedItems = [...normalizedItems].sort((left, right) => {
    const priority = { action: 0, review: 1, approved: 2, upcoming: 3 }
    return priority[left.presentationStatus] - priority[right.presentationStatus] || left.title.localeCompare(right.title)
  })

  return Object.freeze({
    source,
    items: Object.freeze(normalizedItems),
    sortedItems: Object.freeze(sortedItems),
    categories: Object.freeze(categories),
    counts: Object.freeze(counts),
    receivedCount,
    completionPercent,
    collectionPercent,
    firstActionItem: sortedItems.find((item) => item.isActionRequired) || null,
    isComplete: counts.total === 0 || counts.action === 0,
  })
}
