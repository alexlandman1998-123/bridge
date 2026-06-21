export const PROPERTY_DISCLOSURE_DECISION = Object.freeze({
  none: 'none',
  disclose: 'disclose',
})

export const PROPERTY_DISCLOSURE_REVIEW_STATUS = Object.freeze({
  pendingSellerCompletion: 'pending_seller_completion',
  pendingReview: 'pending_review',
  reviewed: 'reviewed',
  requiresClarification: 'requires_clarification',
})

export const RESIDENTIAL_DISCLOSURE_CATEGORIES = Object.freeze([
  { key: 'structural', label: 'Structural', issueTypes: ['Structural defects', 'Cracks', 'Subsidence', 'Foundation issues'] },
  { key: 'roof_damp', label: 'Roof & Damp', issueTypes: ['Roof leaks', 'Water ingress', 'Damp problems'] },
  { key: 'plumbing', label: 'Plumbing', issueTypes: ['Plumbing defects', 'Drainage issues', 'Sewer problems'] },
  { key: 'electrical', label: 'Electrical', issueTypes: ['Electrical defects', 'Compliance concerns', 'Safety concerns'] },
  { key: 'alterations', label: 'Alterations', issueTypes: ['Unapproved alterations', 'Building plan discrepancies', 'Additions not approved'] },
  { key: 'boundaries', label: 'Boundaries', issueTypes: ['Boundary disputes', 'Encroachments', 'Neighbour disputes'] },
  { key: 'municipal', label: 'Municipal', issueTypes: ['Municipal disputes', 'Rates issues', 'Service issues'] },
  { key: 'security_access', label: 'Security & Access', issueTypes: ['Access disputes', 'Servitudes', 'Right-of-way issues'] },
  { key: 'other', label: 'Other', issueTypes: ['Other known issue'] },
])

export const COMMERCIAL_DISCLOSURE_CATEGORIES = Object.freeze([
  ...RESIDENTIAL_DISCLOSURE_CATEGORIES,
  { key: 'tenancies', label: 'Tenancies', issueTypes: ['Existing tenants', 'Tenant disputes', 'Rental arrears', 'Occupancy concerns'] },
  { key: 'leases', label: 'Leases', issueTypes: ['Lease disputes', 'Early termination issues', 'Lease obligations affecting sale'] },
  { key: 'zoning', label: 'Zoning', issueTypes: ['Zoning concerns', 'Consent use issues', 'Land use restrictions'] },
  { key: 'commercial_compliance', label: 'Compliance', issueTypes: ['Fire compliance concerns', 'Occupational health and safety concerns', 'Compliance certificates unavailable'] },
  { key: 'environmental', label: 'Environmental', issueTypes: ['Environmental risks', 'Contamination concerns', 'Hazardous material concerns'] },
  { key: 'property_operations', label: 'Property Operations', issueTypes: ['Building management disputes', 'Common area disputes', 'Body corporate disputes'] },
  { key: 'legal_matters', label: 'Legal Matters', issueTypes: ['Pending litigation', 'Legal notices', 'Municipal enforcement actions'] },
  { key: 'access_servitudes', label: 'Access & Servitudes', issueTypes: ['Servitude disputes', 'Access restrictions', 'Shared access concerns'] },
])

function normalizeText(value) {
  return String(value || '').trim()
}

function hasText(value) {
  return normalizeText(value).length > 0
}

export function createBlankDisclosureIssue(categoryKey = '') {
  return {
    id: `disclosure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    categoryKey,
    issueType: '',
    description: '',
    dateFirstIdentified: '',
    currentStatus: '',
    supportingDocuments: '',
  }
}

export function getDisclosureCategories(kind = 'residential') {
  return kind === 'commercial' ? COMMERCIAL_DISCLOSURE_CATEGORIES : RESIDENTIAL_DISCLOSURE_CATEGORIES
}

export function normalizePropertyDisclosure(disclosure = {}, { kind = 'residential' } = {}) {
  const source = disclosure && typeof disclosure === 'object' ? disclosure : {}
  const categories = getDisclosureCategories(kind)
  const categoryKeys = new Set(categories.map((category) => category.key))
  const issues = Array.isArray(source.issues) ? source.issues : []
  const normalizedIssues = issues
    .filter((issue) => issue && typeof issue === 'object')
    .map((issue, index) => ({
      id: normalizeText(issue.id) || `disclosure-${index + 1}`,
      categoryKey: categoryKeys.has(normalizeText(issue.categoryKey || issue.category_key))
        ? normalizeText(issue.categoryKey || issue.category_key)
        : normalizeText(issue.categoryKey || issue.category_key),
      issueType: normalizeText(issue.issueType || issue.issue_type),
      description: normalizeText(issue.description),
      dateFirstIdentified: normalizeText(issue.dateFirstIdentified || issue.date_first_identified),
      currentStatus: normalizeText(issue.currentStatus || issue.current_status),
      supportingDocuments: normalizeText(issue.supportingDocuments || issue.supporting_documents),
    }))

  const decision = normalizeText(source.decision || source.hasKnownIssues || source.has_known_issues)
  const normalizedDecision =
    decision === PROPERTY_DISCLOSURE_DECISION.none || decision === 'false' || decision === 'no'
      ? PROPERTY_DISCLOSURE_DECISION.none
      : decision === PROPERTY_DISCLOSURE_DECISION.disclose || decision === 'true' || decision === 'yes'
        ? PROPERTY_DISCLOSURE_DECISION.disclose
        : ''

  return {
    version: normalizeText(source.version) || 'property_disclosure_v1',
    kind,
    decision: normalizedDecision,
    issues: normalizedIssues,
    otherDisclosure: normalizeText(source.otherDisclosure || source.other_disclosure),
    declarationAccepted: Boolean(source.declarationAccepted ?? source.declaration_accepted),
    signature: normalizeText(source.signature),
    signedAt: normalizeText(source.signedAt || source.signed_at),
    uploadedDocumentReviewed: Boolean(source.uploadedDocumentReviewed ?? source.uploaded_document_reviewed),
    reviewedAt: normalizeText(source.reviewedAt || source.reviewed_at),
    reviewedBy: normalizeText(source.reviewedBy || source.reviewed_by),
    clarificationRequest: normalizeText(source.clarificationRequest || source.clarification_request),
    generatedDocument: source.generatedDocument && typeof source.generatedDocument === 'object' ? source.generatedDocument : null,
  }
}

export function isPropertyDisclosureDigitallyComplete(disclosure = {}) {
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosure.kind || 'residential' })
  if (!normalized.decision || !normalized.declarationAccepted || !normalized.signature || !normalized.signedAt) return false
  if (normalized.decision === PROPERTY_DISCLOSURE_DECISION.none) return true
  const issueComplete = normalized.issues.some((issue) =>
    hasText(issue.categoryKey) &&
    hasText(issue.issueType) &&
    hasText(issue.description) &&
    hasText(issue.dateFirstIdentified) &&
    hasText(issue.currentStatus),
  )
  return issueComplete || hasText(normalized.otherDisclosure)
}

export function getPropertyDisclosureStatus(disclosure = {}) {
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosure.kind || 'residential' })
  if (normalized.reviewedAt || normalized.reviewedBy) return PROPERTY_DISCLOSURE_REVIEW_STATUS.reviewed
  if (normalized.clarificationRequest) return PROPERTY_DISCLOSURE_REVIEW_STATUS.requiresClarification
  if (isPropertyDisclosureDigitallyComplete(normalized) || normalized.uploadedDocumentReviewed) {
    return PROPERTY_DISCLOSURE_REVIEW_STATUS.pendingReview
  }
  return PROPERTY_DISCLOSURE_REVIEW_STATUS.pendingSellerCompletion
}

export function getPropertyDisclosureStatusLabel(status = '') {
  const normalized = normalizeText(status)
  if (normalized === PROPERTY_DISCLOSURE_REVIEW_STATUS.reviewed) return 'Reviewed'
  if (normalized === PROPERTY_DISCLOSURE_REVIEW_STATUS.requiresClarification) return 'Requires Clarification'
  if (normalized === PROPERTY_DISCLOSURE_REVIEW_STATUS.pendingReview) return 'Pending Review'
  return 'Pending Seller Completion'
}

export function buildPropertyDisclosureDocument(disclosure = {}, context = {}) {
  const normalized = normalizePropertyDisclosure(disclosure, { kind: disclosure.kind || context.kind || 'residential' })
  return {
    id: `property-disclosure-${normalizeText(context.listingId || context.propertyId || context.sellerId || 'draft')}`,
    type: 'property_disclosure',
    title: 'Property Disclosure',
    status: isPropertyDisclosureDigitallyComplete(normalized) ? 'ready_for_generation' : 'incomplete',
    generatedAt: new Date().toISOString(),
    sellerId: normalizeText(context.sellerId),
    propertyId: normalizeText(context.propertyId),
    listingId: normalizeText(context.listingId),
    transactionId: normalizeText(context.transactionId),
    disclosure: normalized,
  }
}
