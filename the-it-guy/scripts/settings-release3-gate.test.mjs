import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import {
  SETTINGS_RELEASE_3_REQUIRED_MIGRATIONS,
  SETTINGS_RELEASE_3_SUPPORTED_WORKSPACE_TYPES,
  SETTINGS_RELEASE_3_VERSION,
  buildSettingsRelease3Readiness,
} from '../src/lib/settingsRelease3.js'

const approvedConfig = {
  version: SETTINGS_RELEASE_3_VERSION,
  enabled: true,
  environment: 'production',
  rollout: { mode: 'all_supported_organisations', percentage: 100, workspaceTypes: [...SETTINGS_RELEASE_3_SUPPORTED_WORKSPACE_TYPES] },
  release2: { status: 'completed', completedAt: '2026-07-25T08:00:00.000Z', evidenceReference: 'evidence/release2-go.json' },
  operations: {
    releaseManager: 'release-owner',
    engineeringOwner: 'engineering-owner',
    supportOwner: 'support-owner',
    supportRunbookReference: 'docs/settings-support.md',
    releaseNotesReference: 'releases/settings-ga.md',
    communicationsStatus: 'ready',
  },
  approval: { status: 'approved', approvedBy: 'product-owner', approvedAt: '2026-08-01T09:00:00.000Z' },
  limits: { minObservationHours: 168, minSettingsWrites: 100, minSaveSuccessPercent: 99.9, minActivityCoveragePercent: 100, maxSettingsErrors: 0, maxOwnershipTransferFailures: 0, maxCriticalSupportIncidents: 0, maxOpenSettingsIncidents: 0 },
  rollback: { strategy: 'return_to_release_2_cohort_and_redeploy_previous_frontend', databaseMigrationsAreForwardOnly: true },
}
const healthyEvidence = {
  uniqueMigrationVersions: true,
  requiredMigrationsPresent: true,
  phaseContractsPass: true,
  priorReleaseContractsPass: true,
  release2PromotionVerified: true,
  productionBuildPass: true,
  liveSchemaChecked: true,
  monitoringSource: 'production-settings-dashboard',
  observationHours: 168,
  workspaceTypesObserved: [...SETTINGS_RELEASE_3_SUPPORTED_WORKSPACE_TYPES],
  schema: { jobTitleColumn: true, jobTitleRpc: true, roleGovernanceRpc: true, ownershipTransferRpc: true, securityAuditEvents: true, organizationEvents: true, billingEvents: true },
  metrics: { settingsWrites: 1000, failedSettingsWrites: 1, auditedSettingsWrites: 1000, settingsErrors: 0, ownershipTransferFailures: 0, criticalSupportIncidents: 0, openSettingsIncidents: 0 },
  checkedAt: '2026-08-01T09:30:00.000Z',
}

const healthy = buildSettingsRelease3Readiness({ config: approvedConfig, evidence: healthyEvidence })
assert.equal(healthy.status, 'GO')
assert.equal(healthy.releaseRecommended, true)
assert.equal(healthy.observation.saveSuccessPercent, 99.9)
assert.equal(healthy.observation.activityCoveragePercent, 100)
assert.equal(healthy.mutatedData, false)

const blocked = buildSettingsRelease3Readiness({
  config: { ...approvedConfig, enabled: false, rollout: { mode: 'cohort', percentage: 50, workspaceTypes: ['agency'] }, release2: { status: 'pending' }, operations: {}, approval: { status: 'pending' } },
  evidence: { ...healthyEvidence, release2PromotionVerified: false, priorReleaseContractsPass: false, observationHours: 24, workspaceTypesObserved: ['agency'], schema: {}, metrics: {} },
})
assert.equal(blocked.status, 'NO_GO')
for (const code of [
  'RELEASE_2_NOT_COMPLETED',
  'RELEASE_2_EVIDENCE_NOT_VERIFIED',
  'PRIOR_RELEASE_CONTRACTS_FAILED',
  'GOVERNANCE_SCHEMA_NOT_READY',
  'ACTIVITY_SOURCES_NOT_READY',
  'RELEASE_DISABLED',
  'GENERAL_AVAILABILITY_SCOPE_INVALID',
  'WORKSPACE_SCOPE_INCOMPLETE',
  'WORKSPACE_EVIDENCE_INCOMPLETE',
  'RELEASE_APPROVAL_MISSING',
  'OPERATIONAL_OWNERS_MISSING',
  'SUPPORT_RUNBOOK_MISSING',
  'RELEASE_COMMUNICATIONS_NOT_READY',
  'OBSERVATION_WINDOW_INCOMPLETE',
  'MONITORING_EVIDENCE_INCOMPLETE',
]) assert.ok(blocked.blockers.some((item) => item.code === code), `blocked release should report ${code}`)

const degraded = buildSettingsRelease3Readiness({
  config: approvedConfig,
  evidence: { ...healthyEvidence, metrics: { settingsWrites: 100, failedSettingsWrites: 1, auditedSettingsWrites: 99, settingsErrors: 1, ownershipTransferFailures: 1, criticalSupportIncidents: 1, openSettingsIncidents: 1 } },
})
for (const code of ['SAVE_SUCCESS_RATE_BELOW_LIMIT', 'ACTIVITY_COVERAGE_BELOW_LIMIT', 'SETTINGS_ERRORS_ABOVE_LIMIT', 'OWNERSHIP_FAILURES_ABOVE_LIMIT', 'CRITICAL_SUPPORT_INCIDENTS_ABOVE_LIMIT', 'OPEN_SETTINGS_INCIDENTS_ABOVE_LIMIT']) {
  assert.ok(degraded.blockers.some((item) => item.code === code), `degraded release should report ${code}`)
}

const invalidActivity = buildSettingsRelease3Readiness({
  config: approvedConfig,
  evidence: { ...healthyEvidence, metrics: { ...healthyEvidence.metrics, auditedSettingsWrites: 1001 } },
})
assert.ok(invalidActivity.blockers.some((item) => item.code === 'ACTIVITY_EVIDENCE_INVALID'))

const migrationFiles = (await readdir(new URL('../../supabase/migrations/', import.meta.url))).filter((file) => file.endsWith('.sql'))
const versions = migrationFiles.map((file) => file.split('_')[0])
assert.equal(new Set(versions).size, versions.length, 'Supabase migration version prefixes must remain globally unique')
for (const migration of SETTINGS_RELEASE_3_REQUIRED_MIGRATIONS) assert.ok(migrationFiles.includes(migration), `${migration} must exist`)

const gate = await readFile(new URL('./settings-release3-gate.mjs', import.meta.url), 'utf8')
assert.match(gate, /SETTINGS_RELEASE3_EVIDENCE/)
assert.match(gate, /release2PromotionVerified/)
assert.match(gate, /priorReleaseContracts\.every/)
assert.match(gate, /npm', \['run', 'build'\]/)
assert.match(gate, /if \(!report\.releaseRecommended\) process\.exitCode = 1/)

console.log('settings Phase 7 Release 3 gate checks passed')
