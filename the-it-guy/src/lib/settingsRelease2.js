import { SETTINGS_RELEASE_1_REQUIRED_MIGRATIONS } from './settingsRelease1.js'

export const SETTINGS_RELEASE_2_VERSION = 'settings_phase7_release2_v1'

export const SETTINGS_RELEASE_2_REQUIRED_MIGRATIONS = Object.freeze([
  ...SETTINGS_RELEASE_1_REQUIRED_MIGRATIONS,
])

export const SETTINGS_RELEASE_2_REQUIRED_CHECKS = Object.freeze([
  'release_1_completed',
  'release_1_evidence_verified',
  'unique_migration_versions',
  'required_migrations_present',
  'phase_1_to_6_contracts_pass',
  'release_1_contract_pass',
  'production_build_pass',
  'live_schema_ready',
  'expanded_cohort_approved',
  'observation_window_complete',
  'minimum_settings_traffic_observed',
  'save_success_rate_healthy',
  'critical_metrics_within_limits',
])

function finiteNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function nonNegativeInteger(value) {
  const number = finiteNumber(value)
  return number === null ? null : Math.max(0, Math.trunc(number))
}

function limit(config, key, fallback) {
  const value = finiteNumber(config?.limits?.[key])
  return value === null ? fallback : value
}

function blocker(code, detail) {
  return { code, detail }
}

export function buildSettingsRelease2Readiness({ config = {}, evidence = {} } = {}) {
  const blockers = []
  const warnings = []
  const organisationIds = [...new Set(Array.isArray(config.organisationIds) ? config.organisationIds.filter(Boolean) : [])]
  const workspaceTypes = [...new Set(Array.isArray(config.workspaceTypes) ? config.workspaceTypes.filter(Boolean) : [])]
  const schema = evidence.schema || {}
  const metrics = evidence.metrics || {}
  const minOrganisations = Math.max(1, Math.trunc(limit(config, 'minOrganisations', 6)))
  const maxOrganisations = Math.max(minOrganisations, Math.trunc(limit(config, 'maxOrganisations', 25)))
  const minWorkspaceTypes = Math.max(1, Math.trunc(limit(config, 'minWorkspaceTypes', 2)))
  const minObservationHours = Math.max(1, limit(config, 'minObservationHours', 72))
  const minSettingsWrites = Math.max(1, Math.trunc(limit(config, 'minSettingsWrites', 20)))
  const minSaveSuccessPercent = Math.min(100, Math.max(0, limit(config, 'minSaveSuccessPercent', 99.5)))

  if (config.version !== SETTINGS_RELEASE_2_VERSION) blockers.push(blocker('RELEASE_VERSION_INVALID', 'Release 2 configuration version is missing or unsupported.'))
  if (config?.release1?.status !== 'completed' || !config?.release1?.completedAt || !config?.release1?.evidenceReference) {
    blockers.push(blocker('RELEASE_1_NOT_COMPLETED', 'Release 1 must be completed with a timestamp and retained evidence reference before expansion.'))
  }
  if (!evidence.release1PromotionVerified) blockers.push(blocker('RELEASE_1_EVIDENCE_NOT_VERIFIED', 'Attach the retained GO report from Release 1 before expanding the cohort.'))
  if (!evidence.release1GatePass) blockers.push(blocker('RELEASE_1_GATE_NOT_VERIFIED', 'The Release 1 gate contract must pass for this release candidate.'))
  if (!evidence.uniqueMigrationVersions) blockers.push(blocker('MIGRATION_VERSION_COLLISION', 'Supabase migration version prefixes must remain globally unique.'))
  if (!evidence.requiredMigrationsPresent) blockers.push(blocker('SETTINGS_MIGRATIONS_MISSING', 'All Settings governance migrations must be present.'))
  if (!evidence.phaseContractsPass) blockers.push(blocker('SETTINGS_CONTRACTS_FAILED', 'The complete Phase 1–6 settings contract suite must pass.'))
  if (!evidence.productionBuildPass) blockers.push(blocker('PRODUCTION_BUILD_FAILED', 'A production frontend build must pass for the Release 2 candidate.'))

  if (!schema.jobTitleColumn || !schema.jobTitleRpc || !schema.roleGovernanceRpc || !schema.ownershipTransferRpc) {
    blockers.push(blocker('GOVERNANCE_SCHEMA_NOT_READY', 'Job-title, role and ownership governance must be verified in the target project.'))
  }
  if (!schema.securityAuditEvents || !schema.organizationEvents || !schema.billingEvents) {
    blockers.push(blocker('ACTIVITY_SOURCES_NOT_READY', 'All Settings Activity sources must be readable in the target project.'))
  }

  if (!config.enabled) blockers.push(blocker('RELEASE_DISABLED', 'Release 2 remains deliberately disabled.'))
  if (organisationIds.length < minOrganisations) blockers.push(blocker('EXPANSION_COHORT_TOO_SMALL', `Release 2 requires at least ${minOrganisations} unique organisations.`))
  if (organisationIds.length > maxOrganisations) blockers.push(blocker('EXPANSION_COHORT_TOO_LARGE', `Release 2 supports at most ${maxOrganisations} organisations.`))
  if (workspaceTypes.length < minWorkspaceTypes) blockers.push(blocker('WORKSPACE_COVERAGE_INSUFFICIENT', `Release 2 requires at least ${minWorkspaceTypes} workspace types.`))
  if (config?.approval?.status !== 'approved' || !config?.approval?.approvedBy || !config?.approval?.approvedAt) {
    blockers.push(blocker('RELEASE_APPROVAL_MISSING', 'A named Release 2 approval and timestamp are required.'))
  }

  const observationHours = finiteNumber(evidence.observationHours)
  if (observationHours === null || observationHours < minObservationHours) {
    blockers.push(blocker('OBSERVATION_WINDOW_INCOMPLETE', `At least ${minObservationHours} hours of production observation evidence are required.`))
  }

  const requiredMetricKeys = ['settingsWrites', 'failedSettingsWrites', 'settingsErrors', 'ownershipTransferFailures', 'criticalSupportIncidents']
  const parsedMetrics = Object.fromEntries(requiredMetricKeys.map((key) => [key, nonNegativeInteger(metrics[key])]))
  const missingMetricKeys = requiredMetricKeys.filter((key) => parsedMetrics[key] === null)
  if (missingMetricKeys.length) {
    blockers.push(blocker('MONITORING_EVIDENCE_INCOMPLETE', `Supply these Release 2 observation metrics: ${missingMetricKeys.join(', ')}.`))
  }
  const { settingsWrites, failedSettingsWrites, settingsErrors, ownershipTransferFailures, criticalSupportIncidents } = parsedMetrics

  if (settingsWrites !== null && settingsWrites < minSettingsWrites) {
    blockers.push(blocker('SETTINGS_TRAFFIC_INSUFFICIENT', `Observed ${settingsWrites} settings writes; at least ${minSettingsWrites} are required before expansion.`))
  }
  const successfulWrites = settingsWrites === null || failedSettingsWrites === null ? null : Math.max(0, settingsWrites - failedSettingsWrites)
  const saveSuccessPercent = settingsWrites ? (successfulWrites / settingsWrites) * 100 : null
  if (saveSuccessPercent !== null && saveSuccessPercent < minSaveSuccessPercent) {
    blockers.push(blocker('SAVE_SUCCESS_RATE_BELOW_LIMIT', `Settings save success is ${saveSuccessPercent.toFixed(2)}%; Release 2 requires ${minSaveSuccessPercent}%.`))
  }
  const criticalChecks = [
    ['SETTINGS_ERRORS_ABOVE_LIMIT', settingsErrors, limit(config, 'maxSettingsErrors', 0)],
    ['OWNERSHIP_FAILURES_ABOVE_LIMIT', ownershipTransferFailures, limit(config, 'maxOwnershipTransferFailures', 0)],
    ['CRITICAL_SUPPORT_INCIDENTS_ABOVE_LIMIT', criticalSupportIncidents, limit(config, 'maxCriticalSupportIncidents', 0)],
  ]
  for (const [code, actual, maximum] of criticalChecks) {
    if (actual !== null && actual > maximum) blockers.push(blocker(code, `Observed ${actual}; Release 2 limit is ${maximum}.`))
  }

  if (!evidence.liveSchemaChecked) warnings.push({ code: 'LIVE_SCHEMA_EVIDENCE_REQUIRED', detail: 'Attach a fresh target-project schema snapshot for Release 2.' })
  if (!evidence.monitoringSource) warnings.push({ code: 'MONITORING_SOURCE_REQUIRED', detail: 'Identify the dashboard or query used for the observation metrics.' })

  const uniqueBlockers = [...new Map(blockers.map((item) => [item.code, item])).values()]
  const status = uniqueBlockers.length ? 'NO_GO' : 'GO'
  return {
    version: SETTINGS_RELEASE_2_VERSION,
    phase: 7,
    release: 2,
    environment: config.environment || 'production',
    status,
    releaseRecommended: status === 'GO',
    blockerCount: uniqueBlockers.length,
    warningCount: warnings.length,
    blockers: uniqueBlockers,
    warnings,
    cohort: { organisationIds, size: organisationIds.length, minOrganisations, maxOrganisations, workspaceTypes, minWorkspaceTypes },
    observation: { hours: observationHours, minimumHours: minObservationHours, settingsWrites, minimumSettingsWrites: minSettingsWrites, saveSuccessPercent, minimumSaveSuccessPercent: minSaveSuccessPercent },
    requiredMigrations: [...SETTINGS_RELEASE_2_REQUIRED_MIGRATIONS],
    requiredChecks: [...SETTINGS_RELEASE_2_REQUIRED_CHECKS],
    rollback: config.rollback || {},
    checkedAt: evidence.checkedAt || new Date().toISOString(),
    mutatedData: false,
  }
}
