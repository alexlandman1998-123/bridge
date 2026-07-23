import { getDocumentReadiness } from '../documentReadinessService.js'

export const MATTER_DOCUMENT_CATEGORIES = [
  'Instruction / OTP Documents',
  'Buyer FICA / Compliance',
  'Seller FICA / Compliance',
  'Drafting Documents',
  'Signing Documents',
  'Guarantees',
  'Clearance Documents',
  'Lodgement Documents',
  'Registration / Close-Out Documents',
  'Internal Working Documents',
]

export const MATTER_DOCUMENT_GROUPS = [
  {
    key: 'all_documents',
    label: 'All Documents',
    description: 'All uploaded and requested documents across this matter.',
    categories: MATTER_DOCUMENT_CATEGORIES,
  },
  {
    key: 'buyer_documents',
    label: 'Buyer Documents',
    description: 'Buyer FICA, finance, onboarding, and signature-ready files.',
    categories: ['Buyer FICA / Compliance'],
  },
  {
    key: 'seller_documents',
    label: 'Seller Documents',
    description: 'Seller FICA, mandate, existing bond, and seller signature files.',
    categories: ['Seller FICA / Compliance'],
  },
  {
    key: 'transfer_documents',
    label: 'Transfer Documents',
    description: 'Instruction, transfer drafting, signing, lodgement, and registration files.',
    categories: ['Instruction / OTP Documents', 'Drafting Documents', 'Signing Documents', 'Lodgement Documents'],
  },
  {
    key: 'bond_documents',
    label: 'Bond Documents',
    description: 'Guarantee, finance approval, and clearance-related files.',
    categories: ['Guarantees', 'Clearance Documents'],
  },
  {
    key: 'cancellation_documents',
    label: 'Cancellation Documents',
    description: 'Existing bond cancellation figures, cancellation packs, and bank clearances.',
    categories: ['Clearance Documents'],
  },
  {
    key: 'generated_documents',
    label: 'Generated Documents',
    description: 'Generated transfer, bond, cancellation, and reporting documents.',
    categories: ['Internal Working Documents'],
  },
  {
    key: 'signed_documents',
    label: 'Signed Documents',
    description: 'Executed documents and registration close-out files.',
    categories: ['Registration / Close-Out Documents'],
  },
]

export const MATTER_DOCUMENT_LIBRARY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'missing', label: 'Missing' },
  { key: 'pending_review', label: 'Pending Review' },
  { key: 'bank_requested', label: 'Bank Requested' },
  { key: 'verified', label: 'Verified' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'seller', label: 'Seller' },
  { key: 'finance', label: 'Finance' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'bond', label: 'Bond' },
  { key: 'cancellation', label: 'Cancellation' },
  { key: 'general', label: 'General' },
  { key: 'generated', label: 'Generated' },
  { key: 'internal', label: 'Internal' },
]

export const MATTER_DOCUMENT_CANONICAL_CATEGORIES = [
  { key: 'buyer', label: 'Buyer Documents', shortLabel: 'Buyer' },
  { key: 'seller', label: 'Seller Documents', shortLabel: 'Seller' },
  { key: 'finance', label: 'Finance Documents', shortLabel: 'Finance' },
  { key: 'transfer', label: 'Transfer Documents', shortLabel: 'Transfer' },
  { key: 'bond', label: 'Bond Documents', shortLabel: 'Bond' },
  { key: 'cancellation', label: 'Cancellation Documents', shortLabel: 'Cancellation' },
  { key: 'general', label: 'General Documents', shortLabel: 'General' },
]

export const MATTER_DOCUMENT_CATEGORY_GROUPS = {
  buyer: [
    { key: 'identity_fica', label: 'Identity & FICA' },
    { key: 'financial', label: 'Financial' },
    { key: 'entity_authority', label: 'Entity Authority' },
    { key: 'agreements', label: 'Agreements' },
    { key: 'supporting_documents', label: 'Supporting Documents' },
  ],
  seller: [
    { key: 'identity_fica', label: 'Identity & FICA' },
    { key: 'property_authority', label: 'Property Authority' },
    { key: 'entity_authority', label: 'Entity Authority' },
    { key: 'agreements', label: 'Agreements' },
    { key: 'supporting_documents', label: 'Supporting Documents' },
  ],
  finance: [
    { key: 'proof_of_funds', label: 'Proof of Funds' },
    { key: 'bank_statements', label: 'Bank Statements' },
    { key: 'guarantees', label: 'Guarantees' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'finance_documents', label: 'Finance Documents' },
  ],
  transfer: [
    { key: 'sale_agreement', label: 'Sale Agreement' },
    { key: 'transfer_duty', label: 'Transfer Duty' },
    { key: 'drafting', label: 'Drafting' },
    { key: 'lodgement', label: 'Lodgement' },
    { key: 'registration', label: 'Registration' },
    { key: 'post_registration', label: 'Post-Registration' },
  ],
  bond: [
    { key: 'bond_application', label: 'Bond Application' },
    { key: 'bank_approval', label: 'Bank Approval' },
    { key: 'guarantees', label: 'Guarantees' },
    { key: 'conditions', label: 'Conditions' },
    { key: 'bond_documents', label: 'Bond Documents' },
  ],
  cancellation: [
    { key: 'cancellation_figures', label: 'Cancellation Figures' },
    { key: 'settlement', label: 'Settlement' },
    { key: 'bank_clearance', label: 'Bank Clearance' },
    { key: 'cancellation_documents', label: 'Cancellation Documents' },
  ],
  general: [
    { key: 'generated', label: 'Generated' },
    { key: 'internal_records', label: 'Internal Records' },
    { key: 'correspondence', label: 'Correspondence' },
    { key: 'general_records', label: 'General Records' },
  ],
}

const MATTER_DOCUMENT_OPERATIONAL_FILTERS = new Set(['critical', 'missing', 'pending_review', 'bank_requested', 'verified'])

const DEFAULT_REQUESTED_FROM_OPTIONS = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'buyer_and_seller', label: 'Both Buyer and Seller' },
  { value: 'agent', label: 'Agent' },
  { value: 'developer', label: 'Developer' },
  { value: 'attorney', label: 'Attorney' },
  { value: 'bond_originator', label: 'Bond Originator' },
  { value: 'other', label: 'Other' },
]

const DEFAULT_PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent' },
]

function toArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : []
}

function toTitle(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

export function formatDocumentFileSize(value = '') {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  if (numeric >= 1024 * 1024) return `${(numeric / (1024 * 1024)).toFixed(numeric >= 10 * 1024 * 1024 ? 0 : 1)} MB`
  if (numeric >= 1024) return `${Math.round(numeric / 1024)} KB`
  return `${Math.round(numeric)} B`
}

export function resolveMatterDocumentTypeLabel(document = {}, fallback = '') {
  const value = firstPresent(
    document?.document_type,
    document?.documentType,
    document?.type,
    document?.documentKey,
    document?.document_key,
    document?.key,
    fallback,
  )
  return toTitle(value || 'Document')
}

export function resolveMatterDocumentVersionLabel(document = {}) {
  const value = firstPresent(
    document?.version_label,
    document?.versionLabel,
    document?.version_number,
    document?.versionNumber,
    document?.document_version,
    document?.documentVersion,
    document?.version,
  )
  if (!value) return document?.id || document?.url || document?.file_path || document?.filePath ? 'v1' : ''
  const text = String(value).trim()
  return /^v/i.test(text) ? text : `v${text}`
}

export function resolveMatterDocumentFileSizeLabel(document = {}) {
  const raw = firstPresent(
    document?.file_size,
    document?.fileSize,
    document?.size_bytes,
    document?.sizeBytes,
    document?.byte_size,
    document?.byteSize,
    document?.size,
  )
  if (typeof raw === 'string' && /[a-z]/i.test(raw)) return raw
  return formatDocumentFileSize(raw)
}

export function resolveMatterDocumentFavourite(document = {}) {
  return Boolean(document?.favourite || document?.favorite || document?.is_favourite || document?.isFavorite || document?.starred || document?.isStarred)
}

export function resolveMatterDocumentLinkedToLabel({ document = {}, requirement = null, fallback = '' } = {}) {
  const raw = firstPresent(
    requirement?.workflowLabel,
    requirement?.workflow_label,
    requirement?.owningWorkflow,
    requirement?.workflow,
    requirement?.visibleSection,
    document?.workflowLabel,
    document?.workflow_label,
    document?.stage_label,
    document?.stageLabel,
    document?.stage_key,
    document?.stageKey,
    document?.relatedWorkflow,
    fallback,
  )
  if (!raw) return 'Matter library'
  const label = toTitle(raw)
  return label === 'Bank Requested' ? 'Bank requested' : label
}

function pickConfiguredCategoryGroup(category = '', key = '') {
  const groups = MATTER_DOCUMENT_CATEGORY_GROUPS[normalizeMatterDocumentCategory(category)] || MATTER_DOCUMENT_CATEGORY_GROUPS.general
  return groups.find((group) => group.key === key) || groups[groups.length - 1] || { key: 'general_records', label: 'General Records' }
}

export function resolveMatterDocumentCategoryGroup({ category = '', document = {}, requirement = null } = {}) {
  const canonicalCategory = normalizeMatterDocumentCategory(category || resolveDocumentLibraryCategory({ ...document, linkedRequirement: requirement }))
  const tokens = [
    document?.document_type,
    document?.documentType,
    document?.type,
    document?.category,
    document?.document_category,
    document?.source,
    document?.stage_key,
    document?.stageKey,
    document?.bucket_key,
    document?.bucketKey,
    requirement?.key,
    requirement?.documentKey,
    requirement?.document_key,
    requirement?.documentType,
    requirement?.document_type,
    requirement?.groupKey,
    requirement?.group,
    requirement?.visibleSection,
    requirement?.owningWorkflow,
    requirement?.workflow,
  ].map((value) => String(value || '').toLowerCase()).join(' ')

  const hasAny = (values = []) => values.some((value) => tokens.includes(value))
  let key = ''

  if (canonicalCategory === 'buyer' || canonicalCategory === 'seller') {
    if (hasAny(['fica', 'identity', 'id', 'passport', 'address', 'compliance'])) key = 'identity_fica'
    else if (hasAny(['fund', 'finance', 'financial', 'bank', 'statement', 'payslip', 'income'])) key = canonicalCategory === 'buyer' ? 'financial' : 'supporting_documents'
    else if (hasAny(['resolution', 'authority', 'company', 'trust', 'director', 'member', 'poa', 'power_of_attorney'])) key = 'entity_authority'
    else if (hasAny(['agreement', 'otp', 'offer', 'sale'])) key = 'agreements'
    else if (canonicalCategory === 'seller' && hasAny(['title', 'rates', 'levy', 'property'])) key = 'property_authority'
    else key = 'supporting_documents'
  } else if (canonicalCategory === 'finance') {
    if (hasAny(['proof_of_funds', 'proof of funds', 'fund'])) key = 'proof_of_funds'
    else if (hasAny(['statement', 'bank_statement'])) key = 'bank_statements'
    else if (hasAny(['guarantee'])) key = 'guarantees'
    else if (hasAny(['approval', 'grant', 'quote', 'offer'])) key = 'approvals'
    else key = 'finance_documents'
  } else if (canonicalCategory === 'transfer') {
    if (hasAny(['otp', 'offer', 'sale_agreement', 'sale agreement'])) key = 'sale_agreement'
    else if (hasAny(['transfer_duty', 'transfer duty', 'duty'])) key = 'transfer_duty'
    else if (hasAny(['draft', 'drafting'])) key = 'drafting'
    else if (hasAny(['lodgement', 'lodge'])) key = 'lodgement'
    else if (hasAny(['registration', 'registered'])) key = 'registration'
    else if (hasAny(['post_registration', 'post registration', 'close_out', 'close-out'])) key = 'post_registration'
    else key = 'drafting'
  } else if (canonicalCategory === 'bond') {
    if (hasAny(['application'])) key = 'bond_application'
    else if (hasAny(['approval', 'grant', 'quote', 'offer'])) key = 'bank_approval'
    else if (hasAny(['guarantee'])) key = 'guarantees'
    else if (hasAny(['condition'])) key = 'conditions'
    else key = 'bond_documents'
  } else if (canonicalCategory === 'cancellation') {
    if (hasAny(['figure', 'cancellation_figure', 'cancellation figure'])) key = 'cancellation_figures'
    else if (hasAny(['settlement', 'payout'])) key = 'settlement'
    else if (hasAny(['clearance', 'bank_clearance', 'bank clearance'])) key = 'bank_clearance'
    else key = 'cancellation_documents'
  } else {
    if (hasAny(['generated'])) key = 'generated'
    else if (hasAny(['internal'])) key = 'internal_records'
    else if (hasAny(['email', 'correspondence', 'message'])) key = 'correspondence'
    else key = 'general_records'
  }

  return pickConfiguredCategoryGroup(canonicalCategory, key)
}

export function getAttorneyCategoryForRequiredDocument(requirement = {}) {
  const groupKey = String(requirement?.groupKey || requirement?.group || '').trim().toLowerCase()
  const key = String(requirement?.key || '').trim().toLowerCase()
  const visibleSection = String(requirement?.visibleSection || '').trim().toLowerCase()
  if (visibleSection === 'finance_documents' || groupKey === 'finance') {
    return 'Internal Working Documents'
  }
  if (groupKey.includes('buyer') || key.startsWith('buyer_')) return 'Buyer FICA / Compliance'
  if (groupKey.includes('seller') || key.startsWith('seller_')) return 'Seller FICA / Compliance'
  if (key.includes('guarantee')) return 'Guarantees'
  if (key.includes('clearance') || key.includes('rates') || key.includes('levy')) return 'Clearance Documents'
  if (key.includes('lodgement')) return 'Lodgement Documents'
  if (key.includes('registration')) return 'Registration / Close-Out Documents'
  if (key.includes('signed') || key.includes('signature')) return 'Signing Documents'
  if (key.includes('otp') || key.includes('instruction')) return 'Instruction / OTP Documents'
  if (key.includes('transfer')) return 'Drafting Documents'
  return 'Internal Working Documents'
}

export function inferLibraryCategoryFromTokens(tokens = '') {
  const normalized = String(tokens || '').toLowerCase()
  if (normalized.includes('buyer')) return 'buyer'
  if (normalized.includes('seller')) return 'seller'
  if (normalized.includes('bond cancellation') || normalized.includes('cancellation')) return 'cancellation'
  if (normalized.includes('bond') || normalized.includes('bank') || normalized.includes('guarantee')) return 'bond'
  if (normalized.includes('finance') || normalized.includes('proof of funds') || normalized.includes('payslip') || normalized.includes('statement')) return 'finance'
  if (normalized.includes('transfer') || normalized.includes('otp') || normalized.includes('offer to purchase') || normalized.includes('lodgement') || normalized.includes('registration')) return 'transfer'
  if (normalized.includes('generated')) return 'generated'
  if (normalized.includes('internal')) return 'internal'
  return ''
}

export function resolveDocumentLibraryCategory(document = {}) {
  const requirement = document?.linkedRequirement || document?.requiredDocument || null
  const rawCategory = String(document?.category || document?.document_category || '').trim().toLowerCase()
  const visibleSection = String(requirement?.visibleSection || requirement?.visible_section || document?.visibleSection || document?.visible_section || '').toLowerCase()
  const source = String(document?.source || '').toLowerCase()
  const documentType = String(document?.document_type || document?.documentType || '').toLowerCase()
  const name = String(document?.name || document?.displayName || '').toLowerCase()
  const group = String(requirement?.groupKey || requirement?.group || '').toLowerCase()
  if (source === 'generated' || rawCategory === 'generated' || documentType.includes('generated')) return 'generated'
  if (rawCategory.includes('buyer') || group.includes('buyer') || name.includes('buyer')) return 'buyer'
  if (rawCategory.includes('seller') || group.includes('seller') || name.includes('seller')) return 'seller'
  if (visibleSection === 'finance_documents' || group === 'finance') return 'finance'
  if (rawCategory.includes('guarantee') || rawCategory.includes('bond') || documentType.includes('bond')) return 'bond'
  if (rawCategory.includes('clearance') || documentType.includes('cancellation') || name.includes('cancellation')) return 'cancellation'
  const tokens = [rawCategory, documentType, name, visibleSection, group, requirement?.key].join(' ')
  const byTokens = inferLibraryCategoryFromTokens(tokens)
  if (byTokens) return byTokens
  if (rawCategory.includes('internal')) return 'internal'
  return 'transfer'
}

export function isBondOriginatorFinanceDocument(document = {}) {
  const category = resolveDocumentLibraryCategory(document)
  if (['finance', 'bond'].includes(category)) return true
  const tokens = [
    document?.name,
    document?.displayName,
    document?.document_type,
    document?.key,
    document?.visibleSection,
  ].map((value) => String(value || '').toLowerCase()).join(' ')
  return ['finance', 'bond', 'bank', 'payslip', 'statement', 'proof of funds', 'guarantee'].some((token) => tokens.includes(token))
}

export function resolveRequirementLibraryCategory(requirement = {}) {
  const attorneyCategory = getAttorneyCategoryForRequiredDocument(requirement)
  if (attorneyCategory.includes('Buyer')) return 'buyer'
  if (attorneyCategory.includes('Seller')) return 'seller'
  if (attorneyCategory.includes('Guarantee')) return 'bond'
  if (attorneyCategory.includes('Clearance')) return 'cancellation'
  const requirementTokens = [requirement?.key, requirement?.label, requirement?.documentLabel, requirement?.groupKey, requirement?.visibleSection].join(' ')
  const byTokens = inferLibraryCategoryFromTokens(requirementTokens)
  return byTokens || 'transfer'
}

export function resolveDocumentLibraryVisibility(document = {}) {
  const visibility = String(document?.visibility_scope || document?.visibilityScope || document?.visibility || '').trim().toLowerCase()
  if (visibility === 'internal' || visibility === 'internal_only') return 'Internal only'
  if (visibility === 'shared' || visibility === 'role_players' || visibility === 'shared_role_players') return 'Professional / roleplayers only'
  if (visibility === 'client_visible' || visibility === 'public') return 'Buyer & seller visible'
  return 'Professional / roleplayers only'
}

export function resolveDocumentWorkflowLabel(document = {}) {
  const workflow = String(document?.stage_key || document?.stageKey || document?.relatedWorkflow || '').trim().toLowerCase()
  if (workflow.includes('bond')) return 'Bond'
  if (workflow.includes('cancel')) return 'Cancellation'
  if (workflow.includes('finance')) return 'Finance'
  if (workflow.includes('transfer')) return 'Transfer'
  return ''
}

export function normalizeLibraryCategory(category = '') {
  const normalized = String(category || '').trim().toLowerCase()
  if (MATTER_DOCUMENT_LIBRARY_FILTERS.some((filter) => filter.key === normalized)) return normalized
  return ''
}

export function normalizeMatterDocumentCategory(category = '') {
  const normalized = normalizeLibraryCategory(category)
  if (MATTER_DOCUMENT_CANONICAL_CATEGORIES.some((entry) => entry.key === normalized)) return normalized
  if (normalized === 'generated' || normalized === 'internal') return 'general'
  if (normalized === 'bank_requested') return 'finance'
  if (normalized === 'critical' || normalized === 'missing' || normalized === 'pending_review' || normalized === 'verified') return ''
  return normalized || 'general'
}

export function normalizeDocumentCommandStatus(status = '', { hasDocument = false } = {}) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'expired') return 'expired'
  if (normalized === 'rejected' || normalized === 'reupload_required') return 'rejected'
  if (normalized === 'requested') return hasDocument ? 'uploaded' : 'requested'
  if (normalized === 'pending') return hasDocument ? 'uploaded' : 'missing'
  if (normalized === 'under_review' || normalized === 'reviewed' || normalized === 'pending_review') return 'pending_review'
  if (normalized === 'approved' || normalized === 'accepted' || normalized === 'completed' || normalized === 'verified') return 'verified'
  if (normalized === 'generated') return 'generated'
  if (normalized === 'uploaded') return 'uploaded'
  return hasDocument ? 'uploaded' : 'missing'
}

export function getDocumentCommandStatusLabel(status = '') {
  const normalized = normalizeDocumentCommandStatus(status)
  if (normalized === 'missing') return 'Missing'
  if (normalized === 'requested') return 'Requested'
  if (normalized === 'uploaded') return 'Uploaded'
  if (normalized === 'pending_review') return 'Pending Review'
  if (normalized === 'verified') return 'Verified'
  if (normalized === 'rejected') return 'Rejected'
  if (normalized === 'expired') return 'Expired'
  if (normalized === 'generated') return 'Generated'
  return toTitle(normalized || 'Unknown')
}

export function getDocumentCommandCategoryLabel(category = '') {
  const normalized = normalizeLibraryCategory(category)
  const labels = {
    buyer: 'Buyer',
    seller: 'Seller',
    finance: 'Finance',
    transfer: 'Transfer',
    bond: 'Bond',
    cancellation: 'Cancellation',
    general: 'General',
    generated: 'Generated',
    internal: 'Internal',
    critical: 'Critical',
    missing: 'Missing',
    pending_review: 'Pending Review',
    bank_requested: 'Bank Requested',
    verified: 'Verified',
  }
  return labels[normalized] || 'Instruction / OTP'
}

export function getDocumentPriorityLabel(requirement = {}) {
  const raw = String(
    requirement?.priority ||
      requirement?.requirementLevel ||
      requirement?.requirement_level ||
      requirement?.priorityLevel ||
      '',
  )
    .trim()
    .toLowerCase()
  if (requirement?.isBlocking || raw === 'blocker' || raw === 'required' || raw === 'high' || raw === 'urgent') return 'High'
  if (raw === 'optional' || raw === 'low') return 'Low'
  return 'Medium'
}

export function getAdditionalRequestStatusLabel(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'uploaded') return 'Uploaded'
  if (normalized === 'under_review' || normalized === 'reviewed') return 'Under Review'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'rejected') return 'Rejected'
  if (normalized === 'cancelled') return 'Cancelled'
  return 'Requested'
}

export function getAdditionalRequestOptionLabel(options, value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  const matched = toArray(options).find((option) => option.value === normalized || option.key === normalized)
  if (matched?.label) return matched.label
  return fallback || toTitle(normalized || 'not set')
}

export function getRequirementDocumentId(requirement = {}) {
  return requirement?.uploadedDocumentId || requirement?.uploaded_document_id || requirement?.matchedDocument?.id || null
}

export function getRequirementCanonicalId(requirement = {}) {
  return requirement?.canonicalRequirementInstanceId || requirement?.canonical_requirement_instance_id || null
}

export function getDocumentCanonicalId(document = {}) {
  return document?.canonicalRequirementInstanceId || document?.canonical_requirement_instance_id || null
}

export function uniqueDocumentsByRenderKey(items = []) {
  const seen = new Set()
  return toArray(items).filter((item) => {
    const key = String(item?.id || `${item?.name || ''}:${item?.file_path || ''}`)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function getRequirementPartyLabel(requirement = {}) {
  const normalized = String(requirement?.expectedFromRole || requirement?.requiredFromRole || requirement?.requestedFrom || requirement?.requested_from || '').trim().toLowerCase()
  if (!normalized || normalized === 'client' || normalized === 'buyer') return 'Buyer'
  if (normalized === 'seller') return 'Seller'
  if (normalized === 'agent') return 'Agent'
  if (normalized === 'bond_originator') return 'Bond originator'
  if (normalized === 'bond_attorney') return 'Bond attorney'
  if (normalized === 'cancellation_attorney') return 'Cancellation attorney'
  if (normalized === 'attorney' || normalized === 'transfer_attorney') return 'Conveyancer / Transfer Attorney'
  return toTitle(normalized.replaceAll('_', ' '))
}

export function resolveUploadedByLabel(document = {}, participants = []) {
  const role = String(document?.uploaded_by_role || document?.uploadedByRole || '').trim()
  const participant = toArray(participants).find((entry) => String(entry?.roleType || '').trim().toLowerCase() === String(role).trim().toLowerCase())
  if (participant?.participantName) return participant.participantName
  if (role) return toTitle(role)
  return 'System'
}

export function getAttorneyDocumentGroupKey(category, groups = MATTER_DOCUMENT_GROUPS, categories = MATTER_DOCUMENT_CATEGORIES) {
  const normalizedCategory = categories.includes(category) ? category : 'Internal Working Documents'
  const match = toArray(groups).find((group) => toArray(group.categories).includes(normalizedCategory))
  return match?.key || 'generated_documents'
}

export function buildGroupedDocuments({
  documents = [],
  getLinkedRequirementForDocument = () => null,
  documentGroups = MATTER_DOCUMENT_GROUPS,
  documentCategories = MATTER_DOCUMENT_CATEGORIES,
} = {}) {
  const groups = toArray(documentGroups).reduce((accumulator, group) => {
    accumulator[group.key] = []
    return accumulator
  }, {})
  if (!groups.all_documents) groups.all_documents = []

  const seenDocumentIds = new Set()
  for (const document of toArray(documents)) {
    const linkedRequirement = getLinkedRequirementForDocument(document)
    const currentRequirementDocumentId = linkedRequirement ? getRequirementDocumentId(linkedRequirement) : null
    if (currentRequirementDocumentId && document?.id && String(currentRequirementDocumentId) !== String(document.id)) {
      continue
    }
    const category = documentCategories.includes(document?.category)
      ? document.category
      : linkedRequirement
        ? getAttorneyCategoryForRequiredDocument(linkedRequirement)
        : 'Internal Working Documents'
    const groupKey = getAttorneyDocumentGroupKey(category, documentGroups, documentCategories)
    const normalizedDocument = { ...document, normalizedCategory: category, linkedRequirement }
    const documentKey = String(document?.id || `${document?.name || ''}:${document?.file_path || ''}`)
    if (seenDocumentIds.has(documentKey)) continue
    seenDocumentIds.add(documentKey)
    groups.all_documents.push(normalizedDocument)
    if (!groups[groupKey]) groups[groupKey] = []
    groups[groupKey].push(normalizedDocument)
  }

  return groups
}

export function buildRequirementDocumentLookup({ documents = [], getLinkedRequirementForDocument = () => null } = {}) {
  const byCanonicalId = new Map()
  const byDocumentId = new Map()
  for (const document of toArray(documents)) {
    const linkedRequirement = getLinkedRequirementForDocument(document)
    const canonicalId = getRequirementCanonicalId(linkedRequirement)
    if (canonicalId && !byCanonicalId.has(String(canonicalId))) {
      byCanonicalId.set(String(canonicalId), document)
    }
    if (document?.id && !byDocumentId.has(String(document.id))) {
      byDocumentId.set(String(document.id), document)
    }
  }
  return { byCanonicalId, byDocumentId }
}

export function buildRequiredDocumentRows({
  requiredDocumentChecklist = [],
  requirementDocumentLookup,
  transaction = {},
} = {}) {
  const lookup = requirementDocumentLookup || { byCanonicalId: new Map(), byDocumentId: new Map() }
  const transactionRecord = transaction || {}
  return toArray(requiredDocumentChecklist).map((requirement) => {
    const canonicalId = getRequirementCanonicalId(requirement)
    const uploadedDocumentId = getRequirementDocumentId(requirement)
    const linkedDocument =
      (canonicalId ? lookup.byCanonicalId.get(String(canonicalId)) : null) ||
      (uploadedDocumentId ? lookup.byDocumentId.get(String(uploadedDocumentId)) : null) ||
      requirement?.matchedDocument ||
      null
    const status = normalizeDocumentCommandStatus(requirement?.status || linkedDocument?.review_status || linkedDocument?.status, {
      hasDocument: Boolean(linkedDocument || uploadedDocumentId),
    })
    const category = resolveRequirementLibraryCategory(requirement)
    const categoryGroup = resolveMatterDocumentCategoryGroup({ category, requirement, document: linkedDocument || {} })
    const priority = getDocumentPriorityLabel(requirement)
    const documentType = firstPresent(requirement?.documentType, requirement?.document_type, requirement?.type, requirement?.key, '')
    const requiredParty = getRequirementPartyLabel(requirement)

    return {
      id: String(canonicalId || requirement?.id || requirement?.key || requirement?.documentKey || requirement?.document_key),
      transactionId: transactionRecord?.id || requirement?.transactionId || requirement?.transaction_id || '',
      displayName: requirement?.label || requirement?.documentLabel || requirement?.document_label || requirement?.key || 'Document requirement',
      category,
      canonicalCategory: normalizeMatterDocumentCategory(category),
      categoryLabel: getDocumentCommandCategoryLabel(category),
      categoryGroup: categoryGroup.key,
      categoryGroupLabel: categoryGroup.label,
      status,
      statusLabel: getDocumentCommandStatusLabel(status),
      priority,
      blocksStage: Boolean(requirement?.isBlocking || requirement?.blocksStage || requirement?.blocks_stage),
      requiredParty,
      ownerLabel: requiredParty,
      documentType,
      documentTypeLabel: resolveMatterDocumentTypeLabel(requirement, requirement?.label || requirement?.documentLabel || requirement?.key),
      versionLabel: resolveMatterDocumentVersionLabel(linkedDocument || {}),
      fileSizeLabel: resolveMatterDocumentFileSizeLabel(linkedDocument || {}),
      linkedToLabel: resolveMatterDocumentLinkedToLabel({ document: linkedDocument || {}, requirement }),
      isFavourite: resolveMatterDocumentFavourite(linkedDocument || requirement),
      relatedWorkflow: requirement?.owningWorkflow || requirement?.workflow || requirement?.visibleSection || '',
      requiredDocumentId: requirement?.id || null,
      requiredDocumentKey: requirement?.key || requirement?.documentKey || requirement?.document_key || '',
      canonicalRequirementInstanceId: canonicalId || '',
      fileUrl: linkedDocument?.url || '',
      requirement,
      linkedDocument,
      source: 'transaction_required_documents',
      satisfiesRequirement: Boolean(linkedDocument || uploadedDocumentId),
    }
  })
}

export function buildAllDocumentLibraryRows({
  documents = [],
  getLinkedRequirementForDocument = () => null,
  transaction = {},
  transactionParticipants = [],
} = {}) {
  const transactionRecord = transaction || {}
  return uniqueDocumentsByRenderKey(documents)
    .filter((document) => !document?.archived_at)
    .map((document) => {
      const linkedRequirement = getLinkedRequirementForDocument(document)
      const category = resolveDocumentLibraryCategory({ ...document, linkedRequirement })
      const categoryGroup = resolveMatterDocumentCategoryGroup({ category, document, requirement: linkedRequirement })
      const documentType = firstPresent(document?.document_type, document?.documentType, linkedRequirement?.documentType, linkedRequirement?.document_type, linkedRequirement?.key, '')
      const requiredParty = linkedRequirement ? getRequirementPartyLabel(linkedRequirement) : ''
      const uploadedBy = resolveUploadedByLabel(document, transactionParticipants)
      const rawStatus =
        document?.source === 'generated' || category === 'generated'
          ? 'generated'
          : document?.review_status || document?.status || linkedRequirement?.status || 'uploaded'

      return {
        id: String(document?.id || `${document?.name || ''}:${document?.file_path || ''}`),
        transactionId: transactionRecord?.id || document?.transaction_id || document?.transactionId || '',
        displayName: document?.name || document?.displayName || 'Untitled document',
        category,
        canonicalCategory: normalizeMatterDocumentCategory(category),
        categoryLabel: getDocumentCommandCategoryLabel(category),
        categoryGroup: categoryGroup.key,
        categoryGroupLabel: categoryGroup.label,
        status: normalizeDocumentCommandStatus(rawStatus, { hasDocument: true }),
        visibility: resolveDocumentLibraryVisibility(document),
        requiredParty,
        ownerLabel: requiredParty || uploadedBy || 'Matter team',
        uploadedBy,
        uploadedAt: document?.created_at || document?.uploaded_at || document?.uploadedAt || '',
        updatedAt: document?.updated_at || document?.updatedAt || document?.created_at || '',
        source: document?.source || (category === 'generated' ? 'generated' : 'documents'),
        fileUrl: document?.url || '',
        documentType,
        documentTypeLabel: resolveMatterDocumentTypeLabel(document, linkedRequirement?.label || linkedRequirement?.key || document?.name),
        versionLabel: resolveMatterDocumentVersionLabel(document),
        fileSizeLabel: resolveMatterDocumentFileSizeLabel(document),
        linkedToLabel: resolveMatterDocumentLinkedToLabel({ document, requirement: linkedRequirement, fallback: resolveDocumentWorkflowLabel(document) }),
        isFavourite: resolveMatterDocumentFavourite(document),
        relatedWorkflow: resolveDocumentWorkflowLabel(document),
        requiredDocumentId: linkedRequirement?.id || null,
        requiredDocumentKey: linkedRequirement?.key || document?.document_type || '',
        requiredDocument: linkedRequirement,
        requiredDocumentStatus: linkedRequirement?.status || '',
        requiredDocumentCanonicalId: getRequirementCanonicalId(linkedRequirement) || getDocumentCanonicalId(document) || '',
        documentRequestId: document?.document_request_id || document?.documentRequestId || '',
        satisfiesRequirement: Boolean(linkedRequirement),
        priority: linkedRequirement ? getDocumentPriorityLabel(linkedRequirement) : '',
        blocksStage: Boolean(linkedRequirement?.isBlocking || linkedRequirement?.blocksStage || linkedRequirement?.blocks_stage),
        raw: document,
      }
    })
}

export function buildDocumentHealthSummary({
  readiness,
  requiredDocumentRows = [],
  allDocumentLibraryRows = [],
  documentRequests = [],
  requestedFromOptions = DEFAULT_REQUESTED_FROM_OPTIONS,
} = {}) {
  const documentReadiness = readiness || {}
  const kpis = documentReadiness.kpis || {}
  const statusRank = {
    missing: 0,
    requested: 1,
    rejected: 2,
    pending_review: 3,
    uploaded: 4,
    verified: 5,
  }
  const requiredDocuments = [...toArray(requiredDocumentRows)].sort((left, right) => {
    const leftRank = statusRank[left.status] ?? 9
    const rightRank = statusRank[right.status] ?? 9
    if (leftRank !== rightRank) return leftRank - rightRank
    return String(left.displayName || '').localeCompare(String(right.displayName || ''))
  })
  const recentActivity = [
    ...toArray(allDocumentLibraryRows).map((row) => ({
      id: `document:${row.id}`,
      label: row.displayName || 'Document uploaded',
      detail: `${row.categoryLabel || 'Document'} - ${getDocumentCommandStatusLabel(row.status)}`,
      timestamp: row.updatedAt || row.uploadedAt || '',
      fileUrl: row.fileUrl || '',
    })),
    ...toArray(documentRequests).map((request) => ({
      id: `request:${request.id || request.title}`,
      label: request.title || request.documentType || 'Document requested',
      detail: `${getAdditionalRequestStatusLabel(request.status)} - ${getAdditionalRequestOptionLabel(requestedFromOptions, request.requestedFrom, 'Buyer')}`,
      timestamp: request.updatedAt || request.createdAt || '',
      fileUrl: '',
    })),
  ]
    .filter((item) => item.label)
    .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime())
    .slice(0, 5)

  return {
    applicationId: documentReadiness.applicationId,
    score: documentReadiness.score,
    scoreLabel: documentReadiness.scoreLabel,
    summaryText: documentReadiness.summaryText,
    submissionReady: documentReadiness.submissionReady,
    blockerCount: documentReadiness.blockerCount,
    requiredDocuments,
    recentActivity,
    kpis,
    requiredCount: kpis.required || requiredDocuments.length,
    uploadedCount: kpis.received || 0,
    missingCount: kpis.missing || 0,
    pendingReviewCount: kpis.pendingReview || 0,
    approvedCount: kpis.verified || 0,
    rejectedCount: kpis.rejected || 0,
    percentComplete: kpis.required ? Math.round(((kpis.received || 0) / kpis.required) * 100) : 0,
  }
}

export function buildMatterDocumentCategorySummaries({
  allDocumentLibraryRows = [],
  requiredDocumentRows = [],
  categories = MATTER_DOCUMENT_CANONICAL_CATEGORIES,
} = {}) {
  const documentRows = toArray(allDocumentLibraryRows)
  const requirementRows = toArray(requiredDocumentRows)
  const statusBuckets = {
    verified: ['verified'],
    pendingReview: ['pending_review'],
    missing: ['missing', 'requested', 'rejected', 'expired'],
    uploaded: ['uploaded', 'generated'],
  }

  return toArray(categories).map((category) => {
    const key = category.key
    const documents = documentRows.filter((row) => (row.canonicalCategory || normalizeMatterDocumentCategory(row.category)) === key)
    const requirements = requirementRows.filter((row) => (row.canonicalCategory || normalizeMatterDocumentCategory(row.category)) === key)
    const requirementKeys = new Set(requirements.map((row) =>
      String(row.canonicalRequirementInstanceId || row.requiredDocumentId || row.requiredDocumentKey || row.id || ''),
    ).filter(Boolean))
    const unlinkedDocuments = documents.filter((row) => {
      const requirementKey = String(row.requiredDocumentCanonicalId || row.requiredDocumentId || row.requiredDocumentKey || '')
      return !requirementKey || !requirementKeys.has(requirementKey)
    })
    const statusRows = [...requirements, ...unlinkedDocuments]
    const countByStatus = (bucket) => statusRows.filter((row) => statusBuckets[bucket].includes(normalizeDocumentCommandStatus(row.status, { hasDocument: Boolean(row.fileUrl || row.linkedDocument) }))).length
    const verifiedCount = countByStatus('verified')
    const pendingReviewCount = countByStatus('pendingReview')
    const missingCount = requirements.filter((row) => statusBuckets.missing.includes(normalizeDocumentCommandStatus(row.status))).length
    const uploadedCount = countByStatus('uploaded')
    const requiredCount = requirements.length
    const totalDocuments = documents.length
    const totalItems = statusRows.length
    const configuredGroups = MATTER_DOCUMENT_CATEGORY_GROUPS[key] || []
    const groupSummaries = configuredGroups.map((group) => {
      const groupRows = statusRows.filter((row) => row.categoryGroup === group.key)
      const groupVerifiedCount = groupRows.filter((row) => statusBuckets.verified.includes(normalizeDocumentCommandStatus(row.status, { hasDocument: Boolean(row.fileUrl || row.linkedDocument || row.raw) }))).length
      const groupMissingCount = groupRows.filter((row) => statusBuckets.missing.includes(normalizeDocumentCommandStatus(row.status, { hasDocument: Boolean(row.fileUrl || row.linkedDocument || row.raw) }))).length
      return {
        key: group.key,
        label: group.label,
        count: groupRows.length,
        verifiedCount: groupVerifiedCount,
        missingCount: groupMissingCount,
      }
    }).filter((group) => group.count > 0)
    const progressBase = requiredCount || totalDocuments
    const progressComplete = requiredCount
      ? verifiedCount
      : documents.filter((row) => !['missing', 'requested', 'rejected', 'expired'].includes(normalizeDocumentCommandStatus(row.status, { hasDocument: Boolean(row.fileUrl || row.raw) }))).length
    const progressPercent = progressBase ? Math.round((progressComplete / progressBase) * 100) : 0

    return {
      key,
      label: category.label,
      shortLabel: category.shortLabel || category.label,
      totalDocuments,
      requiredCount,
      totalItems,
      verifiedCount,
      pendingReviewCount,
      missingCount,
      uploadedCount,
      uploadedOrUnreviewedCount: uploadedCount,
      progressPercent,
      groupSummaries,
      documents,
      requirements,
      statusRows,
      visible: totalDocuments > 0 || requiredCount > 0,
    }
  }).filter((summary) => summary.visible)
}

export function filterMatterDocumentLibraryRows({
  activeFilter = 'all',
  search = '',
  transaction = {},
  allDocumentLibraryRows = [],
  requiredDocumentRows = [],
  readiness = {},
  requestedFromOptions = DEFAULT_REQUESTED_FROM_OPTIONS,
  priorityOptions = DEFAULT_PRIORITY_OPTIONS,
} = {}) {
  const normalizedFilter = String(activeFilter || 'all').trim().toLowerCase()
  const normalizedSearch = String(search || '').trim().toLowerCase()
  const transactionRecord = transaction || {}
  const documentReadiness = readiness || {}
  const criticalIds = new Set(toArray(documentReadiness.criticalDocuments).map((row) => String(row.id || '')))
  const bankRequestIds = new Set(
    toArray(documentReadiness.bankRequestedDocuments)
      .flatMap((group) => group.items || [])
      .map((row) => String(row.id || '')),
  )

  const mapRequirementAsLibraryRow = (row, suffix = 'requirement') => ({
    id: `${suffix}-${row.id || row.displayName}`,
    transactionId: row.transactionId || transactionRecord?.id || '',
    displayName: row.displayName || row.title || 'Document requirement',
    category: row.category || 'finance',
    canonicalCategory: row.canonicalCategory || normalizeMatterDocumentCategory(row.category || 'finance'),
    categoryLabel: row.categoryLabel || getDocumentCommandCategoryLabel(row.category || 'finance'),
    categoryGroup: row.categoryGroup || resolveMatterDocumentCategoryGroup({ category: row.category || 'finance', requirement: row.requirement || row.requiredDocument || null, document: row.linkedDocument || {} }).key,
    categoryGroupLabel: row.categoryGroupLabel || resolveMatterDocumentCategoryGroup({ category: row.category || 'finance', requirement: row.requirement || row.requiredDocument || null, document: row.linkedDocument || {} }).label,
    status: row.status || 'missing',
    visibility: 'Buyer & seller visible',
    requiredParty: row.requiredParty || 'Buyer',
    ownerLabel: row.ownerLabel || row.requiredParty || 'Buyer',
    uploadedBy: row.requiredParty || 'Buyer',
    uploadedAt: row.linkedDocument?.created_at || row.linkedDocument?.uploaded_at || row.updatedAt || '',
    updatedAt: row.linkedDocument?.updated_at || row.updatedAt || '',
    source: 'requirement',
    fileUrl: row.fileUrl || row.linkedDocument?.url || '',
    documentType: row.documentType || row.requiredDocumentKey || row.requirement?.documentType || row.requirement?.document_type || '',
    documentTypeLabel: row.documentTypeLabel || resolveMatterDocumentTypeLabel(row.requirement || row.requiredDocument || {}, row.displayName || row.requiredDocumentKey),
    versionLabel: row.versionLabel || resolveMatterDocumentVersionLabel(row.linkedDocument || {}),
    fileSizeLabel: row.fileSizeLabel || resolveMatterDocumentFileSizeLabel(row.linkedDocument || {}),
    linkedToLabel: row.linkedToLabel || resolveMatterDocumentLinkedToLabel({ document: row.linkedDocument || {}, requirement: row.requirement || row.requiredDocument || null, fallback: row.relatedWorkflow }),
    isFavourite: row.isFavourite || resolveMatterDocumentFavourite(row.linkedDocument || {}),
    relatedWorkflow: row.relatedWorkflow || '',
    requiredDocumentId: row.requiredDocumentId || '',
    requiredDocumentKey: row.requiredDocumentKey || '',
    requiredDocument: row.requirement || row.requiredDocument || null,
    requiredDocumentStatus: row.status || '',
    requiredDocumentCanonicalId: row.canonicalRequirementInstanceId || row.id || '',
    documentRequestId: '',
    satisfiesRequirement: row.satisfiesRequirement,
    priority: row.priority || '',
    blocksStage: row.blocksStage,
    raw: row.linkedDocument || null,
  })

  const mapRequestAsLibraryRow = (request, bankName = '') => ({
    id: `request-${request.id || request.title}`,
    transactionId: request.transactionId || transactionRecord?.id || '',
    displayName: request.title || request.documentType || 'Bank requested document',
    category: 'bank_requested',
    canonicalCategory: 'finance',
    categoryLabel: bankName || 'Bank Requested',
    categoryGroup: resolveMatterDocumentCategoryGroup({ category: 'finance', document: request }).key,
    categoryGroupLabel: resolveMatterDocumentCategoryGroup({ category: 'finance', document: request }).label,
    status: request.status || 'missing',
    visibility: request.clientVisible ? 'Buyer & seller visible' : 'Professional / roleplayers only',
    requiredParty: getAdditionalRequestOptionLabel(requestedFromOptions, request.requestedFrom, 'Buyer'),
    ownerLabel: getAdditionalRequestOptionLabel(requestedFromOptions, request.requestedFrom, 'Buyer'),
    uploadedBy: bankName || 'Bank request',
    uploadedAt: request.createdAt || '',
    updatedAt: request.updatedAt || request.createdAt || '',
    source: 'document_request',
    fileUrl: '',
    documentType: request.documentType || request.document_type || request.title || '',
    documentTypeLabel: resolveMatterDocumentTypeLabel(request, request.title || 'Bank requested document'),
    versionLabel: '',
    fileSizeLabel: '',
    linkedToLabel: bankName ? `${bankName} request` : 'Bank requested',
    isFavourite: false,
    relatedWorkflow: 'bank requested',
    requiredDocumentId: '',
    requiredDocumentKey: request.documentType || request.title || '',
    requiredDocument: null,
    requiredDocumentStatus: request.status || '',
    requiredDocumentCanonicalId: '',
    documentRequestId: request.id || '',
    satisfiesRequirement: false,
    priority: getAdditionalRequestOptionLabel(priorityOptions, request.additionalPriority || request.priority, 'Normal'),
    blocksStage: true,
    raw: request,
  })

  let rows = toArray(allDocumentLibraryRows)

  if (normalizedFilter === 'critical') {
    rows = [
      ...toArray(allDocumentLibraryRows).filter((row) => criticalIds.has(String(row.requiredDocumentCanonicalId || row.requiredDocumentId || row.requiredDocumentKey || row.id))),
      ...toArray(documentReadiness.criticalDocuments)
        .filter((row) => !row.fileUrl)
        .map((row) => mapRequirementAsLibraryRow(row, 'critical')),
    ]
  } else if (normalizedFilter === 'missing') {
    rows = toArray(documentReadiness.missingDocuments).map((row) => mapRequirementAsLibraryRow(row, 'missing'))
  } else if (normalizedFilter === 'pending_review') {
    rows = [
      ...toArray(allDocumentLibraryRows).filter((row) => row.status === 'pending_review'),
      ...toArray(requiredDocumentRows)
        .filter((row) => row.status === 'pending_review' && !row.fileUrl)
        .map((row) => mapRequirementAsLibraryRow(row, 'pending')),
    ]
  } else if (normalizedFilter === 'verified') {
    rows = toArray(allDocumentLibraryRows).filter((row) => row.status === 'verified')
  } else if (normalizedFilter === 'bank_requested') {
    rows = toArray(documentReadiness.bankRequestedDocuments).flatMap((group) =>
      toArray(group.items)
        .filter((request) => !bankRequestIds.size || bankRequestIds.has(String(request.id || '')))
        .map((request) => mapRequestAsLibraryRow(request, group.bankName)),
    )
  } else if (normalizedFilter !== 'all') {
    rows = toArray(allDocumentLibraryRows).filter((row) => row.category === normalizedFilter || row.canonicalCategory === normalizedFilter)
  }

  const deduped = []
  const seen = new Set()
  for (const row of rows) {
    const key = String(row.id || `${row.displayName}:${row.source}`)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(row)
  }

  if (!normalizedSearch) return deduped
  return deduped.filter((row) =>
    [
      row.displayName,
      row.categoryLabel,
      row.uploadedBy,
      row.status,
      row.requiredParty,
      row.ownerLabel,
      row.categoryGroupLabel,
      row.documentType,
      row.documentTypeLabel,
      row.versionLabel,
      row.fileSizeLabel,
      row.linkedToLabel,
      row.relatedWorkflow,
      row.requiredDocumentKey,
      row.visibility,
      row.raw?.file_name,
      row.raw?.fileName,
      row.raw?.file_path,
      row.raw?.filePath,
      toArray(row.raw?.tags).join(' '),
    ].map((value) => String(value || '').toLowerCase()).join(' ').includes(normalizedSearch),
  )
}

export function buildDocumentsByWorkflow({ allDocumentLibraryRows = [], requiredDocumentRows = [] } = {}) {
  const rows = [...toArray(allDocumentLibraryRows), ...toArray(requiredDocumentRows)]
  const dedupeRows = (items = []) => {
    const seen = new Set()
    return toArray(items).filter((row) => {
      const key = String(row.id || `${row.displayName}:${row.relatedWorkflow}`)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  const pickRows = (tokens = []) => {
    const matches = rows.filter((row) => {
      const haystack = [
        row.displayName,
        row.category,
        row.categoryLabel,
        row.relatedWorkflow,
        row.requiredDocumentKey,
        row.requiredParty,
        row.ownerLabel,
        row.categoryGroupLabel,
        row.documentTypeLabel,
        row.linkedToLabel,
      ].map((value) => String(value || '').toLowerCase()).join(' ')
      return tokens.some((token) => haystack.includes(token))
    })
    return dedupeRows(matches.length ? matches : rows).slice(0, 8)
  }
  return {
    transfer: pickRows(['transfer', 'registration', 'lodgement', 'instruction', 'signed', 'otp', 'title deed']),
    finance: pickRows(['finance', 'bond', 'bank', 'payslip', 'statement', 'income', 'guarantee']),
    cancellation: pickRows(['cancel', 'cancellation', 'existing bond', 'settlement']),
  }
}

export function buildMatterDocumentWorkspaceModel({
  transaction = {},
  documents = [],
  requiredDocumentChecklist = [],
  documentRequests = [],
  transactionParticipants = [],
  activeFilter = 'all',
  search = '',
  configuredBanks = [],
  workflowData = null,
  getLinkedRequirementForDocument = () => null,
  documentGroups = MATTER_DOCUMENT_GROUPS,
  documentCategories = MATTER_DOCUMENT_CATEGORIES,
  requestedFromOptions = DEFAULT_REQUESTED_FROM_OPTIONS,
  priorityOptions = DEFAULT_PRIORITY_OPTIONS,
} = {}) {
  const transactionRecord = transaction || {}
  const groupedDocuments = buildGroupedDocuments({
    documents,
    getLinkedRequirementForDocument,
    documentGroups,
    documentCategories,
  })
  const requirementDocumentLookup = buildRequirementDocumentLookup({ documents, getLinkedRequirementForDocument })
  const requiredRows = buildRequiredDocumentRows({
    requiredDocumentChecklist,
    requirementDocumentLookup,
    transaction: transactionRecord,
  })
  const allLibraryRows = buildAllDocumentLibraryRows({
    documents,
    getLinkedRequirementForDocument,
    transaction: transactionRecord,
    transactionParticipants,
  })
  const readiness = getDocumentReadiness({
    applicationId: transactionRecord?.bond_application_id || transactionRecord?.bondApplicationId || transactionRecord?.id || null,
    requiredDocumentRows: requiredRows,
    documentRequests,
    documentLibraryRows: allLibraryRows,
    configuredBanks,
    workflowData,
  })
  const healthSummary = buildDocumentHealthSummary({
    readiness,
    requiredDocumentRows: requiredRows,
    allDocumentLibraryRows: allLibraryRows,
    documentRequests,
    requestedFromOptions,
  })
  const categorySummaries = buildMatterDocumentCategorySummaries({
    allDocumentLibraryRows: allLibraryRows,
    requiredDocumentRows: requiredRows,
  })
  const libraryRows = filterMatterDocumentLibraryRows({
    activeFilter,
    search,
    transaction: transactionRecord,
    allDocumentLibraryRows: allLibraryRows,
    requiredDocumentRows: requiredRows,
    readiness,
    requestedFromOptions,
    priorityOptions,
  })
  const documentsByWorkflow = buildDocumentsByWorkflow({
    allDocumentLibraryRows: allLibraryRows,
    requiredDocumentRows: requiredRows,
  })

  return {
    groupedDocuments,
    requirementDocumentLookup,
    requiredRows,
    allLibraryRows,
    readiness,
    healthSummary,
    categorySummaries,
    libraryRows,
    documentsByWorkflow,
    filters: MATTER_DOCUMENT_LIBRARY_FILTERS,
    operationalFilters: MATTER_DOCUMENT_OPERATIONAL_FILTERS,
  }
}
