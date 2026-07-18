export const SETTINGS_RELEASE_1_VERSION = 'settings_phase7_release1_v1'

export const SETTINGS_RELEASE_1_REQUIRED_MIGRATIONS = Object.freeze([
  '202607170026_settings_job_title_governance_phase3_1.sql',
  '202607170027_settings_role_permission_governance_phase3_2.sql',
  '202607170028_settings_ownership_transfer_phase3_3.sql',
])

export const SETTINGS_RELEASE_1_REQUIRED_CHECKS = Object.freeze([
  'unique_migration_versions',
  'required_migrations_present',
  'phase_1_to_6_contracts_pass',
  'production_build_pass',
  'job_title_schema_ready',
  'role_governance_rpc_ready',
  'ownership_transfer_rpc_ready',
  'activity_sources_ready',
  'pilot_cohort_approved',
])

function asCount(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0
}

function blocker(code, detail) {
  return { code, detail }
}

export function buildSettingsRelease1Readiness({ config = {}, evidence = {} } = {}) {
  const blockers = []
  const warnings = []
  const organisationIds = Array.isArray(config.organisationIds) ? config.organisationIds.filter(Boolean) : []
  const maxOrganisations = Math.max(1, asCount(config?.limits?.maxOrganisations) || 5)
  const schema = evidence.schema || {}
  const metrics = evidence.metrics || {}

  if (config.version !== SETTINGS_RELEASE_1_VERSION) blockers.push(blocker('RELEASE_VERSION_INVALID', 'Release configuration version is missing or unsupported.'))
  if (!evidence.uniqueMigrationVersions) blockers.push(blocker('MIGRATION_VERSION_COLLISION', 'Supabase migration version prefixes must be unique.'))
  if (!evidence.requiredMigrationsPresent) blockers.push(blocker('SETTINGS_MIGRATIONS_MISSING', 'All Release 1 settings migrations must be present in order.'))
  if (!evidence.phaseContractsPass) blockers.push(blocker('SETTINGS_CONTRACTS_FAILED', 'The complete Phase 1–6 settings contract suite must pass.'))
  if (!evidence.productionBuildPass) blockers.push(blocker('PRODUCTION_BUILD_FAILED', 'A production frontend build must pass for the release candidate.'))
  if (!schema.jobTitleColumn || !schema.jobTitleRpc) blockers.push(blocker('JOB_TITLE_SCHEMA_NOT_READY', 'The job-title column and governed RPC must be verified in the target project.'))
  if (!schema.roleGovernanceRpc) blockers.push(blocker('ROLE_GOVERNANCE_NOT_READY', 'The governed role RPC must be verified in the target project.'))
  if (!schema.ownershipTransferRpc) blockers.push(blocker('OWNERSHIP_TRANSFER_NOT_READY', 'The atomic ownership-transfer RPC must be verified in the target project.'))
  if (!schema.securityAuditEvents || !schema.organizationEvents || !schema.billingEvents) blockers.push(blocker('ACTIVITY_SOURCES_NOT_READY', 'All three Settings Activity sources must be readable in the target project.'))

  if (!config.enabled) blockers.push(blocker('RELEASE_DISABLED', 'Release 1 remains deliberately disabled.'))
  if (!organisationIds.length) blockers.push(blocker('PILOT_COHORT_EMPTY', 'Add explicitly approved organisation IDs before activation.'))
  if (organisationIds.length > maxOrganisations) blockers.push(blocker('PILOT_COHORT_TOO_LARGE', `Release 1 supports at most ${maxOrganisations} organisations.`))
  if (config?.approval?.status !== 'approved' || !config?.approval?.approvedBy || !config?.approval?.approvedAt) {
    blockers.push(blocker('RELEASE_APPROVAL_MISSING', 'Named release approval and an approval timestamp are required.'))
  }

  const metricChecks = [
    ['SETTINGS_ERRORS_ABOVE_LIMIT', 'settingsErrors24h', 'maxSettingsErrors24h'],
    ['FAILED_SAVES_ABOVE_LIMIT', 'failedSaves24h', 'maxFailedSaves24h'],
    ['OWNERSHIP_FAILURES_ABOVE_LIMIT', 'ownershipTransferFailures24h', 'maxOwnershipTransferFailures24h'],
  ]
  for (const [code, metricKey, limitKey] of metricChecks) {
    const actual = asCount(metrics[metricKey])
    const limit = asCount(config?.limits?.[limitKey])
    if (actual > limit) blockers.push(blocker(code, `${metricKey} is ${actual}; Release 1 limit is ${limit}.`))
  }

  if (!evidence.liveSchemaChecked) warnings.push({ code: 'LIVE_SCHEMA_EVIDENCE_REQUIRED', detail: 'Attach a target-project schema snapshot before approval.' })

  const uniqueBlockers = [...new Map(blockers.map((item) => [item.code, item])).values()]
  const status = uniqueBlockers.length ? 'NO_GO' : 'GO'
  return {
    version: SETTINGS_RELEASE_1_VERSION,
    phase: 7,
    release: 1,
    environment: config.environment || 'production',
    status,
    releaseRecommended: status === 'GO',
    blockerCount: uniqueBlockers.length,
    warningCount: warnings.length,
    blockers: uniqueBlockers,
    warnings,
    cohort: {
      organisationIds,
      size: organisationIds.length,
      maxOrganisations,
      workspaceTypes: Array.isArray(config.workspaceTypes) ? config.workspaceTypes : [],
    },
    requiredMigrations: [...SETTINGS_RELEASE_1_REQUIRED_MIGRATIONS],
    requiredChecks: [...SETTINGS_RELEASE_1_REQUIRED_CHECKS],
    rollback: config.rollback || {},
    checkedAt: evidence.checkedAt || new Date().toISOString(),
    mutatedData: false,
  }
}
