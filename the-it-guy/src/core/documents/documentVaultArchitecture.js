import { resolveMatterDocumentMetadata } from './matterDocumentMetadata.js'

const DOCUMENT_VAULT_GROUP_DEFINITIONS = [
  {
    key: 'sale',
    label: 'Sale',
    description: 'Reservation, OTP, and sale agreement pack.',
    sortOrder: 1,
    isClientVisible: true,
    isEnabled: true,
  },
  {
    key: 'buyer_fica',
    label: 'Buyer & FICA',
    description: 'Purchaser identity, compliance, and structure documents.',
    sortOrder: 2,
    isClientVisible: true,
    isEnabled: true,
  },
  {
    key: 'finance',
    label: 'Finance',
    description: 'Finance application and funding-related documents.',
    sortOrder: 3,
    isClientVisible: true,
    isEnabled: true,
  },
  {
    key: 'transfer',
    label: 'Transfer',
    description: 'Attorney and conveyancing transfer file documents.',
    sortOrder: 4,
    isClientVisible: true,
    isEnabled: true,
  },
  {
    key: 'handover',
    label: 'Handover',
    description: 'Post-transfer handover, snag, and homeowner documents.',
    sortOrder: 5,
    isClientVisible: true,
    isEnabled: true,
  },
]

const LEGACY_GROUP_TO_KEY = {
  onboarding: 'sale',
  'sale documents': 'sale',
  'identity documents': 'buyer_fica',
  'purchaser structure documents': 'buyer_fica',
  'finance documents': 'finance',
  'deposit / proof of funds documents': 'finance',
  'transfer documents': 'transfer',
  handover: 'handover',
}

const REQUIRED_DOCUMENT_STATUSES = ['missing', 'requested', 'uploaded', 'under_review', 'accepted', 'approved', 'rejected', 'reupload_required', 'waived', 'completed', 'not_required']

function normalizeGroupKey(value, fallback = 'buyer_fica') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  if (!normalized) {
    return fallback
  }

  if (DOCUMENT_VAULT_GROUP_DEFINITIONS.some((group) => group.key === normalized)) {
    return normalized
  }

  const legacyMapped = LEGACY_GROUP_TO_KEY[normalized.replaceAll('_', ' ')]
  if (legacyMapped) {
    return legacyMapped
  }

  return fallback
}

function getGroupByKey(groupKey) {
  return DOCUMENT_VAULT_GROUP_DEFINITIONS.find((group) => group.key === groupKey) || DOCUMENT_VAULT_GROUP_DEFINITIONS[1]
}

function inferGroupKeyFromDocument(requirement = {}) {
  const metadata = resolveMatterDocumentMetadata(requirement)
  if (metadata.confidence >= 0.86 && metadata.groupKey) {
    return metadata.groupKey
  }

  const explicitGroupKey = normalizeGroupKey(requirement.groupKey || requirement.group_key, '')
  if (explicitGroupKey) {
    return explicitGroupKey
  }

  const key = String(requirement.key || '')
    .trim()
    .toLowerCase()
  const group = String(requirement.group || '')
    .trim()
    .toLowerCase()
  const label = String(requirement.label || '')
    .trim()
    .toLowerCase()

  if (key.includes('handover') || key.includes('snag') || key.includes('warranty') || key.includes('occupation')) {
    return 'handover'
  }

  if (
    key.includes('otp') ||
    key.includes('reservation') ||
    key.includes('sale') ||
    key.includes('annexure') ||
    label.includes('offer to purchase')
  ) {
    return 'sale'
  }

  if (
    key.includes('bond') ||
    key.includes('bank') ||
    key.includes('payslip') ||
    key.includes('proof_of_funds') ||
    key.includes('grant') ||
    key.includes('guarantee') ||
    key.includes('loan') ||
    group.includes('finance') ||
    group.includes('proof of funds')
  ) {
    return 'finance'
  }

  if (
    key.includes('transfer') ||
    key.includes('clearance') ||
    key.includes('deeds') ||
    key.includes('attorney') ||
    group.includes('transfer')
  ) {
    return 'transfer'
  }

  if (
    key.includes('id') ||
    key.includes('address') ||
    key.includes('marriage') ||
    key.includes('anc') ||
    key.includes('trust') ||
    key.includes('company') ||
    key.includes('director') ||
    key.includes('passport') ||
    key.includes('fica') ||
    group.includes('identity') ||
    group.includes('purchaser')
  ) {
    return 'buyer_fica'
  }

  return normalizeGroupKey(group, 'buyer_fica')
}

function inferExpectedFromRole(requirement = {}, groupKey = 'buyer_fica') {
  const metadata = resolveMatterDocumentMetadata({ ...requirement, groupKey })
  if (metadata.confidence >= 0.86 && metadata.requiredFromRole) {
    return metadata.requiredFromRole
  }

  const key = String(requirement.key || '').toLowerCase()
  const label = String(requirement.label || '').toLowerCase()

  if (groupKey === 'transfer') {
    return 'attorney'
  }
  if (groupKey === 'handover') {
    return 'developer'
  }
  if (groupKey === 'finance') {
    if (key.includes('bond_approval') || key.includes('grant') || key.includes('loan') || key.includes('guarantee')) {
      return 'bond_originator'
    }
    return 'client'
  }
  if (groupKey === 'sale') {
    if (key.includes('signed_otp') || key.includes('otp')) {
      return 'client'
    }
    if (key.includes('reservation')) {
      return 'client'
    }
    return 'agent'
  }

  if (label.includes('attorney') || label.includes('transfer')) {
    return 'attorney'
  }
  if (label.includes('bond') || label.includes('bank')) {
    return 'bond_originator'
  }
  return 'client'
}

function inferVisibilityScope(groupKey = 'buyer_fica') {
  if (groupKey === 'transfer') {
    return 'shared'
  }
  return 'client'
}

function normalizeRequiredStatus(value, fallback = 'missing') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return REQUIRED_DOCUMENT_STATUSES.includes(normalized) ? normalized : fallback
}

function statusFromLegacyFlags({ isRequired = true, isUploaded = false } = {}) {
  if (!isRequired) {
    return 'not_required'
  }
  if (isUploaded) {
    return 'uploaded'
  }
  return 'missing'
}

function buildDocumentTemplate(requirement = {}, sortOrder = 0) {
  const metadata = resolveMatterDocumentMetadata(requirement)
  const groupKey = metadata.confidence >= 0.86 && metadata.groupKey ? metadata.groupKey : inferGroupKeyFromDocument(requirement)
  const group = getGroupByKey(groupKey)
  return {
    key: String(requirement.key || '').trim(),
    label: String(requirement.label || '').trim() || 'Document',
    description: String(requirement.description || '').trim(),
    requirementLevel: String(requirement.requirementLevel || requirement.requirement_level || 'required').trim().toLowerCase() === 'optional_required'
      ? 'optional_required'
      : 'required',
    groupKey,
    groupLabel: metadata.confidence >= 0.86 && metadata.groupLabel ? metadata.groupLabel : group.label,
    expectedFromRole: metadata.confidence >= 0.86 && metadata.requiredFromRole ? metadata.requiredFromRole : inferExpectedFromRole(requirement, groupKey),
    defaultVisibility: metadata.confidence >= 0.86 && metadata.visibilityScope ? metadata.visibilityScope : inferVisibilityScope(groupKey),
    allowMultiple: Boolean(requirement.allowMultiple),
    sortOrder: Number.isFinite(Number(requirement.sortOrder)) ? Number(requirement.sortOrder) : sortOrder,
    keywords: Array.isArray(requirement.keywords) ? requirement.keywords : [],
    isActive: true,
  }
}

function buildTemplateMap(requirements = []) {
  return requirements.reduce((accumulator, requirement, index) => {
    const template = buildDocumentTemplate(requirement, index + 1)
    if (template.key) {
      accumulator[template.key] = template
    }
    return accumulator
  }, {})
}

export {
  DOCUMENT_VAULT_GROUP_DEFINITIONS,
  buildDocumentTemplate,
  buildTemplateMap,
  getGroupByKey,
  inferExpectedFromRole,
  inferGroupKeyFromDocument,
  inferVisibilityScope,
  normalizeGroupKey,
  normalizeRequiredStatus,
  statusFromLegacyFlags,
}
