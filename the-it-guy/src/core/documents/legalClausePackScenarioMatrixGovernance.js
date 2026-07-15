export const LEGAL_CLAUSE_PACK_SCENARIO_MATRIX_VERSION = 'sa_legal_clause_pack_scenario_matrix_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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
  const failedCount = Number(lastRun.failedCount || 0)
  const scenarioCount = Number(lastRun.scenarioCount || 0)
  const passedCount = Number(lastRun.passedCount || 0)
  const passed = Boolean(
    adopted &&
    lastRun.canPublish === true &&
    scenarioCount > 0 &&
    failedCount === 0 &&
    passedCount === scenarioCount,
  )
  return {
    schemaVersion: LEGAL_CLAUSE_PACK_SCENARIO_MATRIX_VERSION,
    contractVersion: contractVersion || null,
    adopted,
    runtimeEnforced: adopted,
    passed,
    scenarioCount,
    passedCount,
    failedCount,
    failedScenarioKeys: Array.isArray(lastRun.failedScenarioKeys) ? lastRun.failedScenarioKeys : [],
    validatedAt: lastRun.validatedAt || null,
  }
}
