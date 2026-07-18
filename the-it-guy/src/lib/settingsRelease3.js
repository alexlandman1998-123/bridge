import { SETTINGS_RELEASE_2_REQUIRED_MIGRATIONS } from './settingsRelease2.js'

export const SETTINGS_RELEASE_3_VERSION = 'settings_phase7_release3_v1'

export const SETTINGS_RELEASE_3_SUPPORTED_WORKSPACE_TYPES = Object.freeze([
  'agency',
  'developer_company',
  'attorney_firm',
  'bond_originator',
])

export const SETTINGS_RELEASE_3_REQUIRED_MIGRATIONS = Object.freeze([
  ...SETTINGS_RELEASE_2_REQUIRED_MIGRATIONS,
])

export const SETTINGS_RELEASE_3_REQUIRED_CHECKS = Object.freeze([
  'release_2_completed',
  'release_2_evidence_verified',
  'prior_release_contracts_pass',
  'unique_migration_versions',
  'required_migrations_present',
  'phase_1_to_6_contracts_pass',
  'production_build_pass',
  'live_schema_ready',
  'all_workspace_types_observed',
  'general_availability_approved',
  'operational_owners_assigned',
  'support_and_communications_ready',
  'observation_window_complete',
  'minimum_settings_traffic_observed',
  'save_success_rate_healthy',
  'activity_coverage_complete',
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

function uniqueValues(values) {
  return [...new Set(Array.isArray(values) ? values.filter(Boolean) : [])]
}

export function buildSettingsRelease3Readiness({ config = {}, evidence = {} } = {}) {
  const blockers = []
  const warnings = []
  const schema = evidence.schema || {}
  const metrics = evidence.metrics || {}
  const configuredWorkspaceTypes = uniqueValues(config?.rollout?.workspaceTypes)
  const observedWorkspaceTypes = uniqueValues(evidence.workspaceTypesObserved)
  const missingConfiguredTypes = SETTINGS_RELEASE_3_SUPPORTED_WORKSPACE_TYPES.filter((type) => !configuredWorkspaceTypes.includes(type))
  const missingObservedTypes = SETTINGS_RELEASE_3_SUPPORTED_WORKSPACE_TYPES.filter((type) => !observedWorkspaceTypes.includes(type))
  const minObservationHours = Math.max(1, limit(config, 'minObservationHours', 168))
  const minSettingsWrites = Math.max(1, Math.trunc(limit(config, 'minSettingsWrites', 100)))
  const minSaveSuccessPercent = Math.min(100, Math.max(0, limit(config, 'minSaveSuccessPercent', 99.9)))
  const minActivityCoveragePercent = Math.min(100, Math.max(0, limit(config, 'minActivityCoveragePercent', 100)))

  if (config.version !== SETTINGS_RELEASE_3_VERSION) blockers.push(blocker('RELEASE_VERSION_INVALID', 'Release 3 configuration version is missing or unsupported.'))
  if (config?.release2?.status !== 'completed' || !config?.release2?.completedAt || !config?.release2?.evidenceReference) {
    blockers.push(blocker('RELEASE_2_NOT_COMPLETED', 'Release 2 must be completed with a timestamp and retained evidence reference before general availability.'))
  }
  if (!evidence.release2PromotionVerified) blockers.push(blocker('RELEASE_2_EVIDENCE_NOT_VERIFIED', 'Attach the retained GO report from Release 2 before general availability.'))
  if (!evidence.priorReleaseContractsPass) blockers.push(blocker('PRIOR_RELEASE_CONTRACTS_FAILED', 'Release 1 and Release 2 gate contracts must pass.'))
  if (!evidence.uniqueMigrationVersions) blockers.push(blocker('MIGRATION_VERSION_COLLISION', 'Supabase migration version prefixes must remain globally unique.'))
  if (!evidence.requiredMigrationsPresent) blockers.push(blocker('SETTINGS_MIGRATIONS_MISSING', 'All Settings governance migrations must remain present.'))
  if (!evidence.phaseContractsPass) blockers.push(blocker('SETTINGS_CONTRACTS_FAILED', 'The complete Phase 1–6 settings contract suite must pass.'))
  if (!evidence.productionBuildPass) blockers.push(blocker('PRODUCTION_BUILD_FAILED', 'A production frontend build must pass for the Release 3 candidate.'))

  if (!schema.jobTitleColumn || !schema.jobTitleRpc || !schema.roleGovernanceRpc || !schema.ownershipTransferRpc) {
    blockers.push(blocker('GOVERNANCE_SCHEMA_NOT_READY', 'Job-title, role and ownership governance must be verified in the target project.'))
  }
  if (!schema.securityAuditEvents || !schema.organizationEvents || !schema.billingEvents) {
    blockers.push(blocker('ACTIVITY_SOURCES_NOT_READY', 'All Settings Activity sources must be readable in the target project.'))
  }

  if (!config.enabled) blockers.push(blocker('RELEASE_DISABLED', 'Release 3 remains deliberately disabled.'))
  if (config?.rollout?.mode !== 'all_supported_organisations' || finiteNumber(config?.rollout?.percentage) !== 100) {
    blockers.push(blocker('GENERAL_AVAILABILITY_SCOPE_INVALID', 'Release 3 must explicitly target 100% of supported organisations.'))
  }
  if (missingConfiguredTypes.length) blockers.push(blocker('WORKSPACE_SCOPE_INCOMPLETE', `Configure every supported workspace type: ${missingConfiguredTypes.join(', ')}.`))
  if (missingObservedTypes.length) blockers.push(blocker('WORKSPACE_EVIDENCE_INCOMPLETE', `Production evidence is required for: ${missingObservedTypes.join(', ')}.`))
  if (config?.approval?.status !== 'approved' || !config?.approval?.approvedBy || !config?.approval?.approvedAt) {
    blockers.push(blocker('RELEASE_APPROVAL_MISSING', 'A named Release 3 approval and timestamp are required.'))
  }

  const operations = config.operations || {}
  const missingOwners = ['releaseManager', 'engineeringOwner', 'supportOwner'].filter((key) => !operations[key])
  if (missingOwners.length) blockers.push(blocker('OPERATIONAL_OWNERS_MISSING', `Assign these Release 3 owners: ${missingOwners.join(', ')}.`))
  if (!operations.supportRunbookReference) blockers.push(blocker('SUPPORT_RUNBOOK_MISSING', 'A support runbook reference is required for general availability.'))
  if (!operations.releaseNotesReference || operations.communicationsStatus !== 'ready') {
    blockers.push(blocker('RELEASE_COMMUNICATIONS_NOT_READY', 'Release notes and ready communications status are required.'))
  }

  const observationHours = finiteNumber(evidence.observationHours)
  if (observationHours === null || observationHours < minObservationHours) {
    blockers.push(blocker('OBSERVATION_WINDOW_INCOMPLETE', `At least ${minObservationHours} hours of clean Release 2 production evidence are required.`))
  }

  const requiredMetricKeys = [
    'settingsWrites',
    'failedSettingsWrites',
    'auditedSettingsWrites',
    'settingsErrors',
    'ownershipTransferFailures',
    'criticalSupportIncidents',
    'openSettingsIncidents',
  ]
  const parsedMetrics = Object.fromEntries(requiredMetricKeys.map((key) => [key, nonNegativeInteger(metrics[key])]))
  const missingMetricKeys = requiredMetricKeys.filter((key) => parsedMetrics[key] === null)
  if (missingMetricKeys.length) blockers.push(blocker('MONITORING_EVIDENCE_INCOMPLETE', `Supply these Release 3 observation metrics: ${missingMetricKeys.join(', ')}.`))

  const {
    settingsWrites,
    failedSettingsWrites,
    auditedSettingsWrites,
    settingsErrors,
    ownershipTransferFailures,
    criticalSupportIncidents,
    openSettingsIncidents,
  } = parsedMetrics
  if (settingsWrites !== null && settingsWrites < minSettingsWrites) {
    blockers.push(blocker('SETTINGS_TRAFFIC_INSUFFICIENT', `Observed ${settingsWrites} settings writes; at least ${minSettingsWrites} are required before general availability.`))
  }
  if (settingsWrites !== null && auditedSettingsWrites !== null && auditedSettingsWrites > settingsWrites) {
    blockers.push(blocker('ACTIVITY_EVIDENCE_INVALID', 'Audited settings writes cannot exceed observed settings writes.'))
  }
  const successfulWrites = settingsWrites === null || failedSettingsWrites === null ? null : Math.max(0, settingsWrites - failedSettingsWrites)
  const saveSuccessPercent = settingsWrites ? (successfulWrites / settingsWrites) * 100 : null
  const activityCoveragePercent = settingsWrites && auditedSettingsWrites !== null ? (auditedSettingsWrites / settingsWrites) * 100 : null
  if (saveSuccessPercent !== null && saveSuccessPercent < minSaveSuccessPercent) {
    blockers.push(blocker('SAVE_SUCCESS_RATE_BELOW_LIMIT', `Settings save success is ${saveSuccessPercent.toFixed(2)}%; Release 3 requires ${minSaveSuccessPercent}%.`))
  }
  if (activityCoveragePercent !== null && activityCoveragePercent < minActivityCoveragePercent) {
    blockers.push(blocker('ACTIVITY_COVERAGE_BELOW_LIMIT', `Settings activity coverage is ${activityCoveragePercent.toFixed(2)}%; Release 3 requires ${minActivityCoveragePercent}%.`))
  }

  const criticalChecks = [
    ['SETTINGS_ERRORS_ABOVE_LIMIT', settingsErrors, limit(config, 'maxSettingsErrors', 0)],
    ['OWNERSHIP_FAILURES_ABOVE_LIMIT', ownershipTransferFailures, limit(config, 'maxOwnershipTransferFailures', 0)],
    ['CRITICAL_SUPPORT_INCIDENTS_ABOVE_LIMIT', criticalSupportIncidents, limit(config, 'maxCriticalSupportIncidents', 0)],
    ['OPEN_SETTINGS_INCIDENTS_ABOVE_LIMIT', openSettingsIncidents, limit(config, 'maxOpenSettingsIncidents', 0)],
  ]
  for (const [code, actual, maximum] of criticalChecks) {
    if (actual !== null && actual > maximum) blockers.push(blocker(code, `Observed ${actual}; Release 3 limit is ${maximum}.`))
  }

  if (!evidence.liveSchemaChecked) warnings.push({ code: 'LIVE_SCHEMA_EVIDENCE_REQUIRED', detail: 'Attach a fresh target-project schema snapshot for Release 3.' })
  if (!evidence.monitoringSource) warnings.push({ code: 'MONITORING_SOURCE_REQUIRED', detail: 'Identify the dashboard or query used for the observation metrics.' })

  const uniqueBlockers = [...new Map(blockers.map((item) => [item.code, item])).values()]
  const status = uniqueBlockers.length ? 'NO_GO' : 'GO'
  return {
    version: SETTINGS_RELEASE_3_VERSION,
    phase: 7,
    release: 3,
    environment: config.environment || 'production',
    status,
    releaseRecommended: status === 'GO',
    blockerCount: uniqueBlockers.length,
    warningCount: warnings.length,
    blockers: uniqueBlockers,
    warnings,
    rollout: { mode: config?.rollout?.mode || null, percentage: finiteNumber(config?.rollout?.percentage), configuredWorkspaceTypes, observedWorkspaceTypes },
    observation: { hours: observationHours, minimumHours: minObservationHours, settingsWrites, minimumSettingsWrites: minSettingsWrites, saveSuccessPercent, minimumSaveSuccessPercent: minSaveSuccessPercent, activityCoveragePercent, minimumActivityCoveragePercent: minActivityCoveragePercent },
    requiredMigrations: [...SETTINGS_RELEASE_3_REQUIRED_MIGRATIONS],
    requiredChecks: [...SETTINGS_RELEASE_3_REQUIRED_CHECKS],
    rollback: config.rollback || {},
    checkedAt: evidence.checkedAt || new Date().toISOString(),
    mutatedData: false,
  }
}
