function pickFirstText(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim()
    if (normalized) return normalized
  }
  return ''
}

export function normalizeSellerMobileDocumentKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeSellerMobileStatus(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function resolveSellerMobileDocumentUploadTarget(document = {}) {
  const uploadSpec = document?.uploadSpec && typeof document.uploadSpec === 'object' ? document.uploadSpec : {}
  const requirementKey = pickFirstText(
    uploadSpec.requirementKey,
    uploadSpec.documentDefinitionKey,
    uploadSpec.document_definition_key,
    document.key,
    document.requirementKey,
    document.requirement_key,
    document.documentDefinitionKey,
    document.document_definition_key,
    document.documentType,
    document.document_type,
  )
  const requirementInstanceId = pickFirstText(
    uploadSpec.requirementInstanceId,
    uploadSpec.canonicalRequirementInstanceId,
    uploadSpec.canonical_requirement_instance_id,
    document.canonicalRequirementInstanceId,
    document.canonical_requirement_instance_id,
    document.requirementInstanceId,
    document.requirement_instance_id,
  )
  const normalizedRequirementKey = normalizeSellerMobileDocumentKey(requirementKey)
  const category = pickFirstText(
    uploadSpec.category,
    document.sellerCategoryLabel,
    document.stageLabel,
    document.category,
    'Seller Document',
  )
  const documentType = pickFirstText(
    uploadSpec.documentType,
    uploadSpec.document_type,
    document.documentType,
    document.document_type,
    normalizedRequirementKey,
    requirementKey,
  )

  return {
    requirementKey: normalizedRequirementKey,
    requirementInstanceId,
    uploadingKey: requirementInstanceId || normalizedRequirementKey,
    category,
    documentType,
  }
}

export function formatSellerMobileUploadSize(bytes = 0) {
  const size = Number(bytes) || 0
  if (size <= 0) return ''
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

export function getSellerMobileDocumentBucket(document = {}) {
  const statusBucket = String(document?.statusBucket || '').trim().toLowerCase()
  const status = normalizeSellerMobileStatus(document?.status || document?.requiredDocumentStatus || document?.required_document_status)
  if (document?.actionRequired || statusBucket === 'outstanding' || status === 'rejected') return 'action'
  if (document?.reviewRequired || statusBucket === 'received' || ['uploaded', 'under_review', 'reviewed', 'received'].includes(status)) return 'review'
  if (document?.satisfied || statusBucket === 'approved' || ['approved', 'completed', 'verified', 'signed'].includes(status)) return 'approved'
  if (document?.linkedDocument || document?.hasUploadedDocument || document?.uploaded) return 'review'
  return 'action'
}

export function buildSellerMobileDocumentFilters(documents = [], selectedFilter = 'action') {
  const items = documents.filter((item) => item?.applicable !== false)
  const counts = items.reduce((summary, item) => {
    const bucket = getSellerMobileDocumentBucket(item)
    summary.all += 1
    summary[bucket] += 1
    return summary
  }, { action: 0, review: 0, approved: 0, all: 0 })
  const filters = [
    { key: 'action', label: 'Pending', count: counts.action },
    { key: 'review', label: 'Review', count: counts.review },
    { key: 'approved', label: 'Approved', count: counts.approved },
    { key: 'all', label: 'All', count: counts.all },
  ]
  const requestedFilter = filters.some((filter) => filter.key === selectedFilter) ? selectedFilter : 'action'
  const activeKey = requestedFilter === 'all' || counts[requestedFilter] > 0 || counts.all === 0
    ? requestedFilter
    : filters.find((filter) => filter.key !== 'all' && filter.count > 0)?.key || requestedFilter

  return {
    items,
    counts,
    filters,
    activeKey,
    visibleItems: items.filter((item) => activeKey === 'all' || getSellerMobileDocumentBucket(item) === activeKey),
  }
}
