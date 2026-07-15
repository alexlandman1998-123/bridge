import { SOUTH_AFRICAN_LEGAL_CLAUSE_PACK_DEFINITIONS } from './southAfricanLegalClausePacks.js'
import { resolveLegalTemplateGovernance } from './legalTemplateGovernance.js'

export const LEGAL_CLAUSE_PACK_COVERAGE_VERSION = 'sa_legal_clause_pack_coverage_v1'

const PACK_BY_KEY = new Map(SOUTH_AFRICAN_LEGAL_CLAUSE_PACK_DEFINITIONS.map((pack) => [pack.key, pack]))
const PUBLISHABLE_PACK_KEYS = SOUTH_AFRICAN_LEGAL_CLAUSE_PACK_DEFINITIONS
  .filter((pack) => pack.category !== 'core')
  .map((pack) => pack.key)

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (normalizeText(value)) return normalizeText(value).split(',')
  return []
}

function unique(values = []) {
  return Array.from(new Set(values.map(normalizeKey).filter((key) => PACK_BY_KEY.has(key))))
}

function getSectionMetadata(section = {}) {
  return asRecord(section.metadata_json || section.metadataJson)
}

function collectConditionPackKeys(value, keys = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectConditionPackKeys(item, keys)
    return keys
  }
  if (!value || typeof value !== 'object') return keys
  const field = normalizeKey(value.field || value.key || value.placeholder || value.placeholderKey)
  if (field === 'legal_active_clause_packs') {
    keys.push(...asArray(value.value))
  }
  for (const nested of Object.values(value)) collectConditionPackKeys(nested, keys)
  return keys
}

export function resolveSectionClausePackKeys(section = {}) {
  const metadata = getSectionMetadata(section)
  const governance = asRecord(metadata.governance)
  const sectionKey = normalizeKey(section.section_key || section.sectionKey)
  return unique([
    PACK_BY_KEY.has(sectionKey) ? sectionKey : '',
    metadata.clause_pack_key,
    metadata.clausePackKey,
    metadata.source_clause_key,
    metadata.sourceClauseKey,
    ...asArray(metadata.clause_pack_keys),
    ...asArray(metadata.clausePackKeys),
    ...asArray(governance.clause_pack_keys),
    ...collectConditionPackKeys(section.condition_json || section.conditionJson || {}),
  ])
}

export function resolveSectionClauseApproval(section = {}, { legacyCompatible = false } = {}) {
  const metadata = getSectionMetadata(section)
  const governance = asRecord(metadata.governance)
  const status = normalizeKey(
    section.approval_status ||
      metadata.approval_status ||
      metadata.approvalStatus ||
      governance.approval_status ||
      governance.approvalStatus,
  )
  const locked = Boolean(governance.locked)
  const approvalRecorded = Boolean(
    section.approved_at ||
      section.approved_by ||
      metadata.approved_at ||
      metadata.approved_by ||
      governance.approved_at ||
      governance.approved_by ||
      governance.approved_by_role,
  )
  const explicitlyApproved = ['approved', 'attorney_approved', 'legal_approved'].includes(status)
  return {
    status: status || (legacyCompatible ? 'legacy_compatible' : 'unreviewed'),
    locked,
    approvalRecorded,
    approved: legacyCompatible || (explicitlyApproved && locked && approvalRecorded),
    legacyCompatible,
    approvedAt: section.approved_at || metadata.approved_at || governance.approved_at || null,
    approvedBy: section.approved_by || metadata.approved_by || governance.approved_by || null,
    approvedByRole: normalizeText(governance.approved_by_role) || null,
  }
}

function resolveTemplateSections(template = {}, sections = null) {
  if (Array.isArray(sections)) return sections
  if (Array.isArray(template.sections)) return template.sections
  const metadata = asRecord(template.metadata_json || template.metadataJson)
  return Array.isArray(metadata.sections) ? metadata.sections : []
}

export function listPublishableLegalClausePackKeys() {
  return [...PUBLISHABLE_PACK_KEYS]
}

export function applyLegalClausePackCoverageRuntimePolicy(template = {}, coverage = null) {
  if (!coverage) return null
  const metadata = asRecord(template.metadata_json || template.metadataJson)
  const contractVersion = normalizeText(
    template.legal_clause_pack_coverage_version ||
    metadata.legal_clause_pack_coverage_version ||
    asRecord(metadata.last_clause_pack_coverage).schemaVersion,
  )
  const runtimeEnforced = Boolean(!coverage.legacyCompatible && contractVersion)
  return {
    ...coverage,
    contractVersion: contractVersion || null,
    runtimeEnforced,
    rolloutCompatible: !runtimeEnforced,
  }
}

export function buildLegalClausePackCoverage({
  template = {},
  sections = null,
  requiredPackKeys = null,
  allowLegacy = true,
  requireApproval = true,
} = {}) {
  const governance = resolveLegalTemplateGovernance(template, { allowLegacy })
  const legacyCompatible = allowLegacy && governance.legacyCompatible
  const templateSections = resolveTemplateSections(template, sections)
  const requiredKeys = unique(Array.isArray(requiredPackKeys) ? requiredPackKeys : PUBLISHABLE_PACK_KEYS)
  const sectionRows = templateSections.map((section, index) => ({
    section,
    index,
    packKeys: resolveSectionClausePackKeys(section),
    wordingPresent: normalizeText(section.legal_text || section.legalText).length > 0,
    approval: resolveSectionClauseApproval(section, { legacyCompatible }),
  }))
  const items = requiredKeys.map((packKey) => {
    const definition = PACK_BY_KEY.get(packKey)
    const matches = sectionRows.filter((row) => row.packKeys.includes(packKey))
    const wordingMatches = matches.filter((row) => row.wordingPresent)
    const approvedMatches = wordingMatches.filter((row) => row.approval.approved)
    const wordingCovered = wordingMatches.length > 0
    const approved = !requireApproval || approvedMatches.length > 0
    let status = 'ready'
    if (!wordingCovered) status = 'missing_wording'
    else if (!approved) status = wordingMatches.some((row) => row.approval.status === 'attorney_review')
      ? 'attorney_review'
      : 'approval_required'
    return {
      key: packKey,
      label: definition?.label || packKey,
      category: definition?.category || 'legal',
      status,
      covered: wordingCovered && approved,
      wordingCovered,
      approved,
      legacyCompatible: approvedMatches.some((row) => row.approval.legacyCompatible),
      sectionIndexes: matches.map((row) => row.index),
      sectionKeys: matches.map((row) => normalizeText(row.section.section_key || row.section.sectionKey)),
    }
  })
  const missingWording = items.filter((item) => item.status === 'missing_wording')
  const approvalRequired = items.filter((item) => ['approval_required', 'attorney_review'].includes(item.status))
  const coveredCount = items.filter((item) => item.covered).length
  const coveragePercent = items.length ? Math.round((coveredCount / items.length) * 100) : 100
  return {
    schemaVersion: LEGAL_CLAUSE_PACK_COVERAGE_VERSION,
    templateId: template.id || null,
    governanceVersion: governance.governanceVersion,
    legacyCompatible,
    requiredPackKeys: requiredKeys,
    items,
    coveredCount,
    requiredCount: items.length,
    coveragePercent,
    missingWording,
    approvalRequired,
    blockingItems: [...missingWording, ...approvalRequired],
    canPublish: missingWording.length === 0 && approvalRequired.length === 0,
    canAssemble: missingWording.length === 0 && approvalRequired.length === 0,
  }
}

export function buildLegalClausePackCoverageIssues(coverage = {}, { runtime = false } = {}) {
  return (coverage.blockingItems || []).map((item) => ({
    source: 'legal_clause_pack_coverage',
    sectionKey: item.key,
    sectionLabel: item.label,
    placeholderKey: 'legal_active_clause_packs',
    placeholderLabel: item.label,
    message: item.status === 'missing_wording'
      ? `${item.label} has no linked wording in this template.`
      : `${item.label} wording must be attorney-approved and locked${runtime ? ' before this OTP can be generated' : ' before publishing'}.`,
    required: true,
    packKey: item.key,
    coverageStatus: item.status,
  }))
}
