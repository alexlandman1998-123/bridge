import {
  BOND_APPLICATION_PREFILL_SOURCE_KEYS,
  BOND_APPLICATION_PREFILL_SOURCE_MATRIX,
  BOND_APPLICATION_PREFILL_SOURCE_PRIORITY,
  getBondApplicationPrefillSource,
} from './bondApplicationPrefillSourceMatrix.js'

const SECTION_KEY_ALIASES = Object.freeze({
  application_summary: 'summary',
  summary: 'summary',
})

function normalizeSectionKey(section = '') {
  const key = String(section || '').trim()
  return SECTION_KEY_ALIASES[key] || key
}

function getSourceByPath(metadata = {}) {
  return metadata?.sourceByPath && typeof metadata.sourceByPath === 'object' ? metadata.sourceByPath : {}
}

function getMissingFields(metadata = {}) {
  return Array.isArray(metadata?.missingFields) ? metadata.missingFields : []
}

function getAppliedFields(metadata = {}) {
  return Array.isArray(metadata?.appliedFields) ? metadata.appliedFields : []
}

function getPreservedFields(metadata = {}) {
  return Array.isArray(metadata?.preservedFields) ? metadata.preservedFields : []
}

function getSourceLabel(sourceKey = '') {
  return getBondApplicationPrefillSource(sourceKey)?.label || sourceKey || 'Existing data'
}

function isMeaningfulValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function getSourceDisplay(source = {}) {
  if (source.sourceKey === BOND_APPLICATION_PREFILL_SOURCE_KEYS.savedBondApplication) {
    return {
      status: 'saved',
      label: 'Saved answer',
      detail: 'Already in this application',
    }
  }

  return {
    status: source.applied ? 'prefilled' : 'confirmed',
    label: 'Already filled',
    detail: getSourceLabel(source.sourceKey),
  }
}

export function normalizeBondApplicationPrefillSectionKey(section = '') {
  return normalizeSectionKey(section)
}

export function getBondApplicationPrefillFieldReview(metadata = {}, path = '', {
  required = false,
  label = '',
  section = '',
  currentValue = undefined,
} = {}) {
  const source = getSourceByPath(metadata)[path]
  if (source) {
    const display = getSourceDisplay(source)
    return {
      path,
      label: display.label,
      detail: display.detail,
      status: display.status,
      sourceKey: source.sourceKey,
      sourceLabel: source.sourceLabel || getSourceLabel(source.sourceKey),
      sourcePath: source.sourcePath || '',
      fieldLabel: source.label || label,
      section: normalizeSectionKey(source.section || section),
      applied: Boolean(source.applied),
    }
  }

  const missing = getMissingFields(metadata).find((item) => item.path === path)
  const hasCurrentValue = isMeaningfulValue(currentValue)
  if ((missing || required) && !hasCurrentValue) {
    return {
      path,
      label: 'Needs input',
      detail: 'Required for submission',
      status: 'missing',
      sourceKey: '',
      sourceLabel: '',
      sourcePath: '',
      fieldLabel: missing?.label || label,
      section: normalizeSectionKey(missing?.section || section),
      applied: false,
    }
  }

  return null
}

export function buildBondApplicationPrefillReviewModel(metadata = {}, {
  activeSection = '',
  matrix = BOND_APPLICATION_PREFILL_SOURCE_MATRIX,
} = {}) {
  const sourceByPath = getSourceByPath(metadata)
  const missingFields = getMissingFields(metadata)
  const appliedFields = getAppliedFields(metadata)
  const preservedFields = getPreservedFields(metadata)
  const missingPathSet = new Set(missingFields.map((item) => item.path))
  const appliedPathSet = new Set(appliedFields)
  const preservedPathSet = new Set(preservedFields)
  const auditedFields = Array.isArray(matrix) ? matrix : []
  const sectionMap = new Map()

  for (const field of auditedFields) {
    const sectionKey = normalizeSectionKey(field.section)
    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, {
        key: sectionKey,
        label: sectionKey,
        totalFields: 0,
        sourcedFields: 0,
        appliedFields: 0,
        preservedFields: 0,
        missingRequiredFields: 0,
        missingRequiredLabels: [],
      })
    }

    const summary = sectionMap.get(sectionKey)
    summary.totalFields += 1
    if (sourceByPath[field.path]) summary.sourcedFields += 1
    if (appliedPathSet.has(field.path)) summary.appliedFields += 1
    if (preservedPathSet.has(field.path)) summary.preservedFields += 1
    if (missingPathSet.has(field.path)) {
      summary.missingRequiredFields += 1
      summary.missingRequiredLabels.push(field.label)
    }
  }

  const sourceCounts = BOND_APPLICATION_PREFILL_SOURCE_PRIORITY
    .map((source) => ({
      key: source.key,
      label: source.label,
      count: Object.values(sourceByPath).filter((item) => item.sourceKey === source.key).length,
    }))
    .filter((source) => source.count > 0)

  const activeSectionKey = normalizeSectionKey(activeSection)
  const sectionSummaries = Array.from(sectionMap.values())
  const activeSectionSummary = sectionMap.get(activeSectionKey) || null
  const sourcedFieldCount = Object.keys(sourceByPath).length
  const totalAuditedFields = auditedFields.length

  return {
    version: metadata?.version || '',
    generatedAt: metadata?.generatedAt || '',
    totalAuditedFields,
    sourcedFieldCount,
    appliedFieldCount: appliedFields.length,
    preservedFieldCount: preservedFields.length,
    missingRequiredFieldCount: missingFields.length,
    coveragePercent: totalAuditedFields > 0 ? Math.round((sourcedFieldCount / totalAuditedFields) * 100) : 0,
    sourceCounts,
    sectionSummaries,
    activeSection: activeSectionKey,
    activeSectionSummary,
    hasMetadata: Boolean(metadata?.version),
  }
}
