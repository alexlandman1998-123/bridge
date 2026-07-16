import { classifyLegalDocumentEditorSection } from './legalDocumentEditorScope.js'
import { resolveSectionClauseApproval } from './legalClausePackCoverage.js'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function cloneRecord(value) {
  return { ...asRecord(value) }
}

function cloneArray(value) {
  return Array.isArray(value) ? value.map((item) => (
    item && typeof item === 'object' ? { ...item } : item
  )) : []
}

function getMetadata(section = {}) {
  return cloneRecord(section.metadataJson || section.metadata_json)
}

function getCondition(section = {}) {
  return cloneRecord(section.conditionJson || section.condition_json)
}

function getPlaceholderKeys(section = {}) {
  const values = Array.isArray(section.placeholderKeys)
    ? section.placeholderKeys
    : Array.isArray(section.placeholder_keys)
      ? section.placeholder_keys
      : []
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

function getSigningFields(section = {}, metadata = {}) {
  const signing = asRecord(metadata.signing)
  const candidates = [
    section.signingFields,
    section.signing_fields,
    metadata.planned_signing_fields,
    signing.planned_fields,
    signing.signing_fields,
  ]
  return cloneArray(candidates.find(Array.isArray) || [])
}

function getSigningValue(section = {}, metadata = {}, signing = {}, keys = []) {
  for (const key of keys) {
    if (section[key] !== undefined) return section[key]
    if (metadata[key] !== undefined) return metadata[key]
    if (signing[key] !== undefined) return signing[key]
  }
  return undefined
}

function hasOwn(record = {}, key = '') {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, key) => ({
    ...result,
    [key]: stableValue(value[key]),
  }), {})
}

function valuesMatch(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))
}

function getContentPlaceholderKeys(content = '') {
  const matches = String(content || '').matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)
  return [...new Set(Array.from(matches, (match) => normalizeText(match[1])).filter(Boolean))]
}

function invalidateBlockApproval(block = {}, metadata = {}, changedAt = '') {
  const governance = asRecord(metadata.governance)
  const approved = Boolean(
    block.approval?.approved ||
    block.approval?.locked ||
    governance.locked ||
    ['approved', 'attorney_approved', 'legal_approved'].includes(
      normalizeText(block.approval?.status || governance.approval_status || governance.approvalStatus).toLowerCase(),
    )
  )
  if (!approved) return { metadata, approval: block.approval }
  const invalidatedAt = normalizeText(changedAt) || new Date().toISOString()
  return {
    metadata: {
      ...metadata,
      governance: {
        ...governance,
        locked: false,
        locked_at: null,
        locked_by_role: null,
        lockReason: 'Wording changed after approval',
        approval_status: 'attorney_review',
        approved_at: null,
        approved_by: null,
        approved_by_role: null,
        review_invalidated_at: invalidatedAt,
      },
    },
    approval: {
      ...asRecord(block.approval),
      status: 'attorney_review',
      approved: false,
      locked: false,
      reviewedAt: null,
      reviewedBy: null,
    },
  }
}

function hasSigningMetadata(metadata = {}) {
  const signing = asRecord(metadata.signing)
  return Object.keys(signing).length > 0 || [
    'planned_signing_fields',
    'signing_requirement',
    'signingRequirement',
    'signing_role',
    'signingRole',
    'requires_initial',
    'requiresInitial',
    'requires_signature',
    'requiresSignature',
  ].some((key) => hasOwn(metadata, key))
}

function buildSigningModel(section = {}, metadata = {}) {
  const signing = asRecord(metadata.signing)
  const fields = getSigningFields(section, metadata)
  const requirement = normalizeText(getSigningValue(section, metadata, signing, [
    'signingRequirement',
    'signing_requirement',
  ])) || 'none'
  const requiresInitial = Boolean(getSigningValue(section, metadata, signing, [
    'requiresInitial',
    'requires_initial',
  ])) || requirement === 'client_initial'
  const requiresSignature = Boolean(getSigningValue(section, metadata, signing, [
    'requiresSignature',
    'requires_signature',
  ])) || requirement === 'client_signature'

  return {
    configured: fields.length > 0 || requirement !== 'none' || requiresInitial || requiresSignature || hasSigningMetadata(metadata),
    persistedInMetadata: hasSigningMetadata(metadata),
    modified: false,
    requirement,
    role: normalizeText(getSigningValue(section, metadata, signing, ['signingRole', 'signing_role'])) || 'client',
    requiresInitial,
    requiresSignature,
    initialPlaceholderKey: normalizeText(getSigningValue(section, metadata, signing, [
      'initialPlaceholderKey',
      'initial_placeholder_key',
    ])),
    signaturePlaceholderKey: normalizeText(getSigningValue(section, metadata, signing, [
      'signaturePlaceholderKey',
      'signature_placeholder_key',
    ])),
    fields,
  }
}

function getBlockKind(section = {}, classification = {}) {
  const sectionType = normalizeText(section.sectionType || section.section_type || 'legal_text').toLowerCase() || 'legal_text'
  if (classification.isSigning) return 'signing'
  return sectionType
}

function getApproval(section = {}) {
  const approval = resolveSectionClauseApproval(section, { legacyCompatible: false })
  return {
    status: approval.status,
    approved: approval.approved,
    locked: approval.locked,
    reviewedAt: approval.approvedAt || null,
    reviewedBy: approval.approvedBy || null,
  }
}

export function templateSectionToLegalDocumentBlock(section = {}, index = 0, {
  packetType = '',
  templateId = '',
} = {}) {
  const key = normalizeText(section.sectionKey || section.section_key || `section_${index + 1}`)
  const label = normalizeText(section.sectionLabel || section.section_label || section.title) || `Section ${index + 1}`
  const metadata = getMetadata(section)
  const classification = classifyLegalDocumentEditorSection(section, { packetType })
  const persistedId = normalizeText(section.id)

  return {
    id: persistedId || `${normalizeText(templateId) || 'template'}:${key}:${index}`,
    persistedId: persistedId || null,
    key,
    label,
    kind: getBlockKind(section, classification),
    sectionType: normalizeText(section.sectionType || section.section_type || 'legal_text').toLowerCase() || 'legal_text',
    content: String(section.legalText ?? section.legal_text ?? ''),
    placeholderKeys: getPlaceholderKeys(section),
    required: section.isRequired === undefined && section.is_required === undefined
      ? true
      : Boolean(section.isRequired ?? section.is_required),
    repeatable: Boolean(section.isRepeatable ?? section.is_repeatable),
    sortOrder: Number.isFinite(Number(section.sortOrder ?? section.sort_order))
      ? Math.trunc(Number(section.sortOrder ?? section.sort_order))
      : index,
    condition: getCondition(section),
    signing: buildSigningModel(section, metadata),
    approval: getApproval(section),
    metadata,
    classification: {
      standard: classification.isStandard,
      conditional: classification.isSituation,
      signing: classification.isSigning,
    },
  }
}

export function templateSectionsToLegalDocumentBlocks(sections = [], options = {}) {
  return (Array.isArray(sections) ? sections : [])
    .map((section, index) => templateSectionToLegalDocumentBlock(section, index, options))
    .sort((left, right) => left.sortOrder - right.sortOrder)
}

function mergeSigningMetadata(metadata = {}, signingModel = {}) {
  const shouldMerge = signingModel.modified || (
    signingModel.configured && !signingModel.persistedInMetadata
  )
  if (!shouldMerge) return metadata
  const existingSigning = asRecord(metadata.signing)
  const fields = cloneArray(signingModel.fields)
  return {
    ...metadata,
    signing: {
      ...existingSigning,
      signing_requirement: normalizeText(signingModel.requirement) || 'none',
      signing_role: normalizeText(signingModel.role) || 'client',
      requires_initial: Boolean(signingModel.requiresInitial),
      initial_placeholder_key: normalizeText(signingModel.initialPlaceholderKey),
      requires_signature: Boolean(signingModel.requiresSignature),
      signature_placeholder_key: normalizeText(signingModel.signaturePlaceholderKey),
      planned_fields: fields,
      signing_fields: fields,
    },
    signing_requirement: normalizeText(signingModel.requirement) || 'none',
    signing_role: normalizeText(signingModel.role) || 'client',
    requires_initial: Boolean(signingModel.requiresInitial),
    initial_placeholder_key: normalizeText(signingModel.initialPlaceholderKey),
    requires_signature: Boolean(signingModel.requiresSignature),
    signature_placeholder_key: normalizeText(signingModel.signaturePlaceholderKey),
    planned_signing_fields: fields,
  }
}

export function legalDocumentBlockToTemplateSection(block = {}, index = 0) {
  const metadata = mergeSigningMetadata(cloneRecord(block.metadata), asRecord(block.signing))
  return {
    sectionKey: normalizeText(block.key || `section_${index + 1}`),
    sectionLabel: normalizeText(block.label) || `Section ${index + 1}`,
    sectionType: normalizeText(block.sectionType || block.kind || 'legal_text').toLowerCase() || 'legal_text',
    legalText: String(block.content ?? ''),
    placeholderKeys: [...new Set(cloneArray(block.placeholderKeys).map(normalizeText).filter(Boolean))],
    isRequired: block.required === undefined ? true : Boolean(block.required),
    isRepeatable: Boolean(block.repeatable),
    conditionJson: cloneRecord(block.condition),
    metadataJson: metadata,
    sortOrder: Number.isFinite(Number(block.sortOrder)) ? Math.trunc(Number(block.sortOrder)) : index,
  }
}

export function legalDocumentBlocksToTemplateSections(blocks = []) {
  return (Array.isArray(blocks) ? blocks : [])
    .map((block, index) => legalDocumentBlockToTemplateSection(block, index))
    .sort((left, right) => left.sortOrder - right.sortOrder)
}

export function updateLegalDocumentBlock(block = {}, patch = {}, { changedAt = '' } = {}) {
  const nextBlock = { ...block, ...patch }
  const contentChanged = ['key', 'content', 'placeholderKeys', 'condition', 'signing'].some((key) => (
    hasOwn(patch, key) && !valuesMatch(patch[key], block[key])
  ))
  if (!contentChanged) return nextBlock

  const placeholderKeys = hasOwn(patch, 'content')
    ? [...new Set([
        ...cloneArray(nextBlock.placeholderKeys).map(normalizeText).filter(Boolean),
        ...getContentPlaceholderKeys(nextBlock.content),
      ])]
    : cloneArray(nextBlock.placeholderKeys).map(normalizeText).filter(Boolean)
  const invalidated = invalidateBlockApproval(block, cloneRecord(nextBlock.metadata), changedAt)
  return {
    ...nextBlock,
    placeholderKeys,
    metadata: invalidated.metadata,
    approval: invalidated.approval,
  }
}
