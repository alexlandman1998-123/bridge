import { classifyLegalDocumentEditorSection } from './legalDocumentEditorScope.js'

export const OTP_LEGAL_BASELINE_SCHEMA_VERSION = 'otp_legal_baseline_v1'
export const OTP_ATTORNEY_REVIEW_SCHEMA_VERSION = 'otp_attorney_review_v1'
export const OTP_BASELINE_SECTION_CLASSES = Object.freeze([
  'core_wording',
  'conditional_clause',
  'transaction_data',
  'signing',
])
export const OTP_ATTORNEY_REVIEW_DECISIONS = Object.freeze(['pending', 'approved', 'changes_requested'])

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function getValue(record = {}, camelKey, snakeKey) {
  return record?.[camelKey] ?? record?.[snakeKey]
}

function getObject(record = {}, camelKey, snakeKey) {
  const value = getValue(record, camelKey, snakeKey)
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getArray(record = {}, camelKey, snakeKey) {
  const value = getValue(record, camelKey, snakeKey)
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value.split(',')
  return []
}

export function extractOtpTemplateVariables(legalText = '') {
  const variables = new Set()
  const pattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g
  let match = pattern.exec(String(legalText || ''))
  while (match) {
    const key = normalizeText(match[1])
    if (key) variables.add(key)
    match = pattern.exec(String(legalText || ''))
  }
  return [...variables].sort()
}

function listSectionVariables(section = {}) {
  const declared = getArray(section, 'placeholderKeys', 'placeholder_keys')
    .map(normalizeText)
    .filter(Boolean)
  const discovered = extractOtpTemplateVariables(getValue(section, 'legalText', 'legal_text'))
  return [...new Set([...declared, ...discovered])].sort()
}

function isTransactionDataSection(section = {}) {
  const sectionType = normalizeKey(getValue(section, 'sectionType', 'section_type'))
  if (['dynamic_fields', 'data_fields', 'schedule', 'transaction_data'].includes(sectionType)) return true
  const key = normalizeKey(getValue(section, 'sectionKey', 'section_key'))
  const label = normalizeKey(getValue(section, 'sectionLabel', 'section_label'))
  return /(^|_)(schedule|transaction_particulars|property_details|party_details|parties)($|_)/.test(`${key}_${label}`)
}

export function classifyOtpBaselineSection(section = {}) {
  const shared = classifyLegalDocumentEditorSection(section, { packetType: 'otp' })
  if (shared.isSigning) return 'signing'
  if (shared.isSituation) return 'conditional_clause'
  if (isTransactionDataSection(section)) return 'transaction_data'
  return 'core_wording'
}

export function describeOtpActivationFact(condition = {}) {
  if (!condition || typeof condition !== 'object' || condition.enabled === false) return null
  const field = normalizeText(condition.field)
  const operator = normalizeText(condition.operator)
  const values = Array.isArray(condition.values)
    ? condition.values
    : condition.value !== undefined && condition.value !== null
      ? [condition.value]
      : []
  const label = normalizeText(condition.label)
  const rules = Array.isArray(condition.rules) ? condition.rules : []
  if (!field && !operator && !values.length && !rules.length) return null
  return {
    label: label || null,
    field: field || null,
    operator: operator || null,
    values: values.map((value) => String(value)),
    ruleCount: rules.length,
  }
}

function normalizeSection(section = {}, index = 0) {
  const key = normalizeKey(getValue(section, 'sectionKey', 'section_key')) || `section_${index + 1}`
  const condition = getObject(section, 'conditionJson', 'condition_json')
  const metadata = getObject(section, 'metadataJson', 'metadata_json')
  const legalText = String(getValue(section, 'legalText', 'legal_text') || '')
  return {
    id: normalizeText(section.id) || null,
    key,
    label: normalizeText(getValue(section, 'sectionLabel', 'section_label')) || key,
    classification: classifyOtpBaselineSection(section),
    sectionType: normalizeKey(getValue(section, 'sectionType', 'section_type')) || 'legal_text',
    sortOrder: Number(getValue(section, 'sortOrder', 'sort_order') ?? index),
    required: Boolean(getValue(section, 'isRequired', 'is_required')),
    repeatable: Boolean(getValue(section, 'isRepeatable', 'is_repeatable')),
    activationFact: describeOtpActivationFact(condition),
    condition,
    variables: listSectionVariables(section),
    legalText,
    metadata,
  }
}

function buildVariableRegistry(sections = []) {
  const registry = new Map()
  sections.forEach((section) => {
    section.variables.forEach((variable) => {
      const entry = registry.get(variable) || { key: variable, usedBySections: [] }
      entry.usedBySections.push(section.key)
      registry.set(variable, entry)
    })
  })
  return [...registry.values()]
    .map((entry) => ({ ...entry, usedBySections: [...new Set(entry.usedBySections)].sort() }))
    .sort((left, right) => left.key.localeCompare(right.key))
}

function buildBaselineFindings(template = {}, sections = [], counts = {}) {
  const findings = []
  const metadata = template.metadata || {}
  const renderValidation = metadata.last_render_validation && typeof metadata.last_render_validation === 'object'
    ? metadata.last_render_validation
    : {}
  const add = (code, severity, message) => findings.push({ code, severity, message })
  if (!counts.core_wording) {
    add('NO_CORE_WORDING', 'blocking', 'No section is identified as standard core OTP wording.')
  }
  if (!counts.conditional_clause) {
    add('NO_CONDITIONAL_CLAUSES', 'warning', 'No section has an activation condition, so onboarding answers cannot select approved clause packs from this template.')
  }
  const lifecycleStatus = normalizeKey(metadata.lifecycle_status || metadata.template_status)
  if (template.status && lifecycleStatus && normalizeKey(template.status) !== lifecycleStatus) {
    add('LIFECYCLE_STATUS_CONFLICT', 'blocking', `Template row status is ${template.status}, while metadata lifecycle status is ${lifecycleStatus}.`)
  }
  const renderMode = normalizeKey(metadata.render_mode)
  const storagePath = normalizeText(metadata.template_storage_path || metadata.templatePath)
  if (renderMode === 'legacy_docx' && !storagePath) {
    add('LEGACY_DOCX_PATH_MISSING', 'blocking', 'Template uses the legacy DOCX renderer but has no DOCX storage path.')
  }
  const missingRequired = Array.isArray(renderValidation.missingRequired) ? renderValidation.missingRequired.filter(Boolean) : []
  if (missingRequired.length) {
    add('REQUIRED_VARIABLES_MISSING', 'blocking', `Required variables are missing: ${missingRequired.join(', ')}.`)
  }
  const deprecatedTokens = Array.isArray(renderValidation.deprecatedTokens) ? renderValidation.deprecatedTokens : []
  if (deprecatedTokens.length) {
    const labels = deprecatedTokens.map((entry) => `${entry.token} -> ${entry.canonicalKey}`).join(', ')
    add('DEPRECATED_VARIABLES', 'warning', `Deprecated variables remain in use: ${labels}.`)
  }
  const emptyLegalSections = sections.filter((section) => !normalizeText(section.legalText)).map((section) => section.key)
  if (emptyLegalSections.length) {
    add('EMPTY_SECTION_WORDING', 'blocking', `Sections without captured wording: ${emptyLegalSections.join(', ')}.`)
  }
  return findings
}

export function buildOtpLegalBaseline({ template = {}, sections = [], source = {} } = {}) {
  const packetType = normalizeKey(getValue(template, 'packetType', 'packet_type'))
  if (packetType !== 'otp') throw new Error(`Expected an OTP template, received "${packetType || 'unknown'}".`)
  const normalizedSections = [...sections]
    .map(normalizeSection)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.key.localeCompare(right.key))
  const counts = Object.fromEntries(OTP_BASELINE_SECTION_CLASSES.map((key) => [key, 0]))
  normalizedSections.forEach((section) => { counts[section.classification] += 1 })
  const normalizedTemplate = {
    id: normalizeText(template.id),
    organisationId: normalizeText(getValue(template, 'organisationId', 'organisation_id')) || null,
    packetType,
    key: normalizeText(getValue(template, 'templateKey', 'template_key')) || null,
    label: normalizeText(getValue(template, 'templateLabel', 'template_label')) || null,
    versionTag: normalizeText(getValue(template, 'versionTag', 'version_tag')) || null,
    status: normalizeText(template.status) || null,
    active: Boolean(getValue(template, 'isActive', 'is_active')),
    default: Boolean(getValue(template, 'isDefault', 'is_default')),
    updatedAt: normalizeText(getValue(template, 'updatedAt', 'updated_at')) || null,
    metadata: getObject(template, 'metadataJson', 'metadata_json'),
  }
  const findings = buildBaselineFindings(normalizedTemplate, normalizedSections, counts)
  return {
    schemaVersion: OTP_LEGAL_BASELINE_SCHEMA_VERSION,
    source: {
      environment: normalizeText(source.environment) || 'unknown',
      exportedAt: normalizeText(source.exportedAt) || new Date().toISOString(),
      exportMethod: normalizeText(source.exportMethod) || 'database',
    },
    template: normalizedTemplate,
    summary: {
      sectionCount: normalizedSections.length,
      variableCount: buildVariableRegistry(normalizedSections).length,
      classifications: counts,
      blockingFindingCount: findings.filter((finding) => finding.severity === 'blocking').length,
      warningFindingCount: findings.filter((finding) => finding.severity === 'warning').length,
    },
    findings,
    sections: normalizedSections,
    variables: buildVariableRegistry(normalizedSections),
  }
}

export function createOtpAttorneyReviewManifest(baseline = {}) {
  return {
    schemaVersion: OTP_ATTORNEY_REVIEW_SCHEMA_VERSION,
    baselineHash: normalizeText(baseline.baselineHash),
    templateId: normalizeText(baseline?.template?.id),
    status: 'pending',
    reviewer: { name: null, role: null, organisation: null },
    reviewedAt: null,
    notes: '',
    sections: (Array.isArray(baseline.sections) ? baseline.sections : []).map((section) => ({
      sectionKey: section.key,
      classification: section.classification,
      activationFact: section.activationFact,
      decision: 'pending',
      notes: '',
    })),
  }
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function getOtpBaselineHashPayload(baseline = {}) {
  return {
    schemaVersion: baseline.schemaVersion,
    template: baseline.template,
    summary: baseline.summary,
    findings: baseline.findings,
    sections: baseline.sections,
    variables: baseline.variables,
  }
}

export function validateOtpLegalBaseline(baseline = {}) {
  const errors = []
  if (baseline.schemaVersion !== OTP_LEGAL_BASELINE_SCHEMA_VERSION) errors.push('Unsupported OTP baseline schema version.')
  if (baseline?.template?.packetType !== 'otp') errors.push('Baseline template must have packetType "otp".')
  if (!normalizeText(baseline?.template?.id)) errors.push('Baseline template id is required.')
  if (!normalizeText(baseline.baselineHash)) errors.push('Baseline hash is required.')
  if (!Array.isArray(baseline.sections) || baseline.sections.length === 0) errors.push('Baseline must contain at least one section.')
  const keys = new Set()
  ;(baseline.sections || []).forEach((section) => {
    if (!OTP_BASELINE_SECTION_CLASSES.includes(section.classification)) errors.push(`Section ${section.key || '?'} has an invalid classification.`)
    if (keys.has(section.key)) errors.push(`Duplicate section key: ${section.key}.`)
    keys.add(section.key)
    if (section.classification === 'conditional_clause' && !section.activationFact) {
      errors.push(`Conditional section ${section.key} has no readable activation fact.`)
    }
  })
  return { valid: errors.length === 0, errors }
}

export function validateOtpAttorneyReview(review = {}, baseline = {}) {
  const errors = []
  if (review.schemaVersion !== OTP_ATTORNEY_REVIEW_SCHEMA_VERSION) errors.push('Unsupported attorney review schema version.')
  if (review.baselineHash !== baseline.baselineHash) errors.push('Attorney review does not match the baseline hash.')
  if (review.templateId !== baseline?.template?.id) errors.push('Attorney review does not match the template id.')
  const decisions = new Map((review.sections || []).map((entry) => [entry.sectionKey, entry]))
  ;(baseline.sections || []).forEach((section) => {
    const entry = decisions.get(section.key)
    if (!entry) errors.push(`Missing attorney decision for ${section.key}.`)
    else if (!OTP_ATTORNEY_REVIEW_DECISIONS.includes(entry.decision)) errors.push(`Invalid attorney decision for ${section.key}.`)
  })
  if (review.status === 'approved') {
    if (!normalizeText(review?.reviewer?.name) || !normalizeText(review?.reviewer?.role)) errors.push('Approved review requires reviewer name and role.')
    if (!normalizeText(review.reviewedAt)) errors.push('Approved review requires a reviewedAt timestamp.')
    ;(review.sections || []).forEach((entry) => {
      if (entry.decision !== 'approved') errors.push(`Review cannot be approved while ${entry.sectionKey} is ${entry.decision}.`)
    })
  }
  return { valid: errors.length === 0, errors }
}
