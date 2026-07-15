export const LEGAL_CLAUSE_PACK_SCENARIO_MATRIX_VERSION = 'sa_legal_clause_pack_scenario_matrix_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key])
    return result
  }, {})
}

function fingerprint(value) {
  const input = JSON.stringify(stableValue(value))
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function buildLegalClausePackTemplateFingerprint(template = {}, sections = null) {
  const rows = Array.isArray(sections) ? sections : Array.isArray(template.sections) ? template.sections : []
  return fingerprint(rows.map((section, index) => {
    const metadata = asRecord(section.metadata_json || section.metadataJson)
    const governance = asRecord(metadata.governance)
    const packKeys = [
      metadata.clause_pack_key,
      metadata.clausePackKey,
      metadata.source_clause_key,
      metadata.sourceClauseKey,
      ...(Array.isArray(metadata.clause_pack_keys) ? metadata.clause_pack_keys : []),
      ...(Array.isArray(metadata.clausePackKeys) ? metadata.clausePackKeys : []),
      ...(Array.isArray(governance.clause_pack_keys) ? governance.clause_pack_keys : []),
    ].map(normalizeKey).filter(Boolean).sort()
    return {
      index,
      sectionKey: normalizeKey(section.section_key || section.sectionKey),
      sectionType: normalizeKey(section.section_type || section.sectionType),
      legalText: normalizeText(section.legal_text || section.legalText),
      condition: stableValue(section.condition_json || section.conditionJson || {}),
      packKeys,
      governance: {
        status: normalizeKey(section.approval_status || metadata.approval_status || metadata.approvalStatus || governance.approval_status || governance.approvalStatus),
        locked: Boolean(governance.locked),
        approvedAt: normalizeText(section.approved_at || metadata.approved_at || metadata.approvedAt || governance.approved_at || governance.approvedAt),
        approvedBy: normalizeText(section.approved_by || metadata.approved_by || metadata.approvedBy || governance.approved_by || governance.approvedBy),
        approvedByRole: normalizeKey(governance.approved_by_role || governance.approvedByRole),
      },
    }
  }))
}

export function resolveLegalClausePackScenarioMatrixGovernance(template = {}) {
  const metadata = asRecord(template.metadata_json || template.metadataJson)
  const lastRun = asRecord(metadata.last_clause_pack_scenario_matrix || metadata.lastClausePackScenarioMatrix)
  const contractVersion = normalizeText(
    template.legal_clause_pack_scenario_matrix_version ||
    metadata.legal_clause_pack_scenario_matrix_version ||
    lastRun.schemaVersion,
  )
  const adopted = Boolean(contractVersion)
  const supported = !adopted || contractVersion === LEGAL_CLAUSE_PACK_SCENARIO_MATRIX_VERSION
  const failedCount = Number(lastRun.failedCount || 0)
  const scenarioCount = Number(lastRun.scenarioCount || 0)
  const passedCount = Number(lastRun.passedCount || 0)
  const storedTemplateFingerprint = normalizeText(lastRun.templateFingerprint || lastRun.template_fingerprint)
  const currentTemplateFingerprint = buildLegalClausePackTemplateFingerprint(template)
  const hasCurrentTemplateSections = Array.isArray(template.sections) && template.sections.length > 0
  const matchesTemplate = Boolean(hasCurrentTemplateSections && storedTemplateFingerprint && currentTemplateFingerprint && storedTemplateFingerprint === currentTemplateFingerprint)
  const passed = Boolean(
    adopted &&
    supported &&
    matchesTemplate &&
    lastRun.canPublish === true &&
    scenarioCount > 0 &&
    failedCount === 0 &&
    passedCount === scenarioCount,
  )
  const blockingReasons = [
    ...(!adopted ? ['matrix_contract_not_adopted'] : []),
    ...(adopted && !supported ? ['matrix_contract_unsupported'] : []),
    ...(adopted && supported && !storedTemplateFingerprint ? ['matrix_fingerprint_missing'] : []),
    ...(adopted && supported && !hasCurrentTemplateSections ? ['matrix_template_sections_unavailable'] : []),
    ...(adopted && supported && hasCurrentTemplateSections && storedTemplateFingerprint && !matchesTemplate ? ['matrix_result_stale'] : []),
    ...(adopted && supported && matchesTemplate && !passed ? ['matrix_failed'] : []),
  ]
  return {
    schemaVersion: LEGAL_CLAUSE_PACK_SCENARIO_MATRIX_VERSION,
    contractVersion: contractVersion || null,
    adopted,
    supported,
    runtimeEnforced: adopted,
    passed,
    storedTemplateFingerprint: storedTemplateFingerprint || null,
    currentTemplateFingerprint: currentTemplateFingerprint || null,
    hasCurrentTemplateSections,
    matchesTemplate,
    certificationKey: normalizeText(lastRun.certificationKey || lastRun.certification_key) || null,
    blockingReasons,
    scenarioCount,
    passedCount,
    failedCount,
    failedScenarioKeys: Array.isArray(lastRun.failedScenarioKeys) ? lastRun.failedScenarioKeys : [],
    validatedAt: lastRun.validatedAt || null,
  }
}
