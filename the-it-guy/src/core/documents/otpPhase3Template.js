import { listPublishableLegalClausePackKeys } from './legalClausePackCoverage.js'
import { classifyOtpBaselineSection, extractOtpTemplateVariables } from './otpLegalBaseline.js'
import { SOUTH_AFRICAN_LEGAL_CLAUSE_STARTERS } from './southAfricanLegalClauseLibrary.js'

export const OTP_PHASE3_TEMPLATE_VERSION = 'otp_phase3_complete_clause_catalogue_v1'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function getSectionKey(section = {}) {
  return normalizeKey(section.sectionKey || section.section_key)
}

function getMetadata(section = {}) {
  const metadata = section.metadataJson || section.metadata_json
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
}

function getCondition(section = {}) {
  const condition = section.conditionJson || section.condition_json
  return condition && typeof condition === 'object' && !Array.isArray(condition) ? condition : {}
}

function getLegalText(section = {}) {
  return String(section.legalText || section.legal_text || '')
}

function getPlaceholderKeys(section = {}) {
  const values = section.placeholderKeys || section.placeholder_keys
  const declared = Array.isArray(values)
    ? values
    : normalizeText(section.placeholderKeysText).split(',')
  return [...new Set([
    ...declared.map(normalizeText).filter(Boolean),
    ...extractOtpTemplateVariables(getLegalText(section)),
  ])].sort()
}

function getPackKeys(section = {}, publishableKeys = new Set()) {
  const key = getSectionKey(section)
  const metadata = getMetadata(section)
  const governance = metadata.governance && typeof metadata.governance === 'object' ? metadata.governance : {}
  const values = [
    publishableKeys.has(key) ? key : '',
    metadata.clause_pack_key,
    ...(Array.isArray(metadata.clause_pack_keys) ? metadata.clause_pack_keys : []),
    ...(Array.isArray(governance.clause_pack_keys) ? governance.clause_pack_keys : []),
  ]
  if (key === 'schedule_2') values.push('bond_finance_pack')
  return [...new Set(values.map(normalizeKey).filter((value) => publishableKeys.has(value)))]
}

function withPendingGovernance(section = {}, publishableKeys = new Set()) {
  const metadata = getMetadata(section)
  const packKeys = getPackKeys(section, publishableKeys)
  const classification = classifyOtpBaselineSection(section)
  const requiresLegalReview = classification !== 'signing'
  return {
    ...section,
    sectionKey: section.sectionKey || section.section_key,
    sectionLabel: section.sectionLabel || section.section_label,
    sectionType: section.sectionType || section.section_type || 'legal_text',
    legalText: getLegalText(section),
    placeholderKeys: getPlaceholderKeys(section),
    placeholderKeysText: getPlaceholderKeys(section).join(', '),
    conditionJson: getCondition(section),
    metadataJson: {
      ...metadata,
      phase3_classification: classification,
      phase3_template_version: OTP_PHASE3_TEMPLATE_VERSION,
      legal_review_status: requiresLegalReview ? 'pending' : metadata.legal_review_status || 'not_applicable',
      ...(packKeys.length ? { clause_pack_keys: packKeys } : {}),
      governance: {
        ...(metadata.governance && typeof metadata.governance === 'object' ? metadata.governance : {}),
        ...(packKeys.length ? { clause_pack_keys: packKeys } : {}),
        ...(requiresLegalReview ? { approval_status: 'attorney_review', locked: false } : {}),
      },
    },
  }
}

function starterToSection(starter = {}) {
  return {
    sectionKey: starter.packKey || starter.key,
    sectionLabel: starter.title,
    sectionType: 'legal_text',
    legalText: starter.snippet,
    placeholderKeys: extractOtpTemplateVariables(starter.snippet),
    placeholderKeysText: extractOtpTemplateVariables(starter.snippet).join(', '),
    isRequired: false,
    conditionJson: starter.defaultCondition || {},
    metadataJson: {
      category: starter.category,
      description: starter.description,
      source_clause_key: starter.key,
      clause_pack_keys: [starter.packKey || starter.key],
      phase3_template_version: OTP_PHASE3_TEMPLATE_VERSION,
      legal_review_status: 'pending',
      governance: {
        clause_pack_keys: [starter.packKey || starter.key],
        approval_status: 'attorney_review',
        locked: false,
      },
    },
  }
}

export function buildOtpPhase3CandidateSections(baseSections = []) {
  const publishableKeys = new Set(listPublishableLegalClausePackKeys())
  const normalizedBase = (Array.isArray(baseSections) ? baseSections : [])
    .map((section) => withPendingGovernance(section, publishableKeys))
  const coveredKeys = new Set(normalizedBase.flatMap((section) => getPackKeys(section, publishableKeys)))
  const missingPackSections = SOUTH_AFRICAN_LEGAL_CLAUSE_STARTERS
    .filter((starter) => !coveredKeys.has(normalizeKey(starter.packKey || starter.key)))
    .map(starterToSection)
  const firstCoreIndex = normalizedBase.findIndex((section, index) => (
    index > 0 && classifyOtpBaselineSection(section) === 'core_wording'
  ))
  const insertionIndex = firstCoreIndex >= 0 ? firstCoreIndex : Math.max(0, normalizedBase.length - 1)
  return [
    ...normalizedBase.slice(0, insertionIndex),
    ...missingPackSections,
    ...normalizedBase.slice(insertionIndex),
  ].map((section, index) => ({ ...section, sortOrder: index }))
}

export function auditOtpPhase3CandidateSections(sections = []) {
  const publishableKeys = new Set(listPublishableLegalClausePackKeys())
  const coveredKeys = new Set((sections || []).flatMap((section) => getPackKeys(section, publishableKeys)))
  const missingPackKeys = [...publishableKeys].filter((key) => !coveredKeys.has(key))
  const classifications = (sections || []).reduce((counts, section) => {
    const key = classifyOtpBaselineSection(section)
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
  return {
    complete: missingPackKeys.length === 0 && Number(classifications.core_wording || 0) > 0,
    requiredPackCount: publishableKeys.size,
    coveredPackCount: publishableKeys.size - missingPackKeys.length,
    missingPackKeys,
    classifications,
  }
}

