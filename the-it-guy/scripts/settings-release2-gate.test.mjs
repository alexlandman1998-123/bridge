import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import {
  SETTINGS_RELEASE_2_REQUIRED_MIGRATIONS,
  SETTINGS_RELEASE_2_VERSION,
  buildSettingsRelease2Readiness,
} from '../src/lib/settingsRelease2.js'

const organisationIds = Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)
const approvedConfig = {
  version: SETTINGS_RELEASE_2_VERSION,
  enabled: true,
  environment: 'production',
  organisationIds,
  workspaceTypes: ['agency', 'attorney_firm'],
  release1: { status: 'completed', completedAt: '2026-07-18T08:00:00.000Z', evidenceReference: 'evidence/release1-go.json' },
  approval: { status: 'approved', approvedBy: 'release-owner', approvedAt: '2026-07-21T09:00:00.000Z' },
  limits: {
    minOrganisations: 6,
    maxOrganisations: 25,
    minWorkspaceTypes: 2,
    minObservationHours: 72,
    minSettingsWrites: 20,
    minSaveSuccessPercent: 99.5,
    maxSettingsErrors: 0,
    maxOwnershipTransferFailures: 0,
    maxCriticalSupportIncidents: 0,
  },
  rollback: { strategy: 'return_to_release_1_cohort_and_redeploy_previous_frontend', databaseMigrationsAreForwardOnly: true },
}
const healthyEvidence = {
  uniqueMigrationVersions: true,
  requiredMigrationsPresent: true,
  phaseContractsPass: true,
  release1GatePass: true,
  release1PromotionVerified: true,
  productionBuildPass: true,
  liveSchemaChecked: true,
  monitoringSource: 'production-settings-dashboard',
  observationHours: 72,
  schema: {
    jobTitleColumn: true,
    jobTitleRpc: true,
    roleGovernanceRpc: true,
    ownershipTransferRpc: true,
    securityAuditEvents: true,
    organizationEvents: true,
    billingEvents: true,
  },
  metrics: { settingsWrites: 200, failedSettingsWrites: 1, settingsErrors: 0, ownershipTransferFailures: 0, criticalSupportIncidents: 0 },
  checkedAt: '2026-07-21T09:30:00.000Z',
}

const healthy = buildSettingsRelease2Readiness({ config: approvedConfig, evidence: healthyEvidence })
assert.equal(healthy.status, 'GO')
assert.equal(healthy.observation.saveSuccessPercent, 99.5)
assert.equal(healthy.mutatedData, false)

const blocked = buildSettingsRelease2Readiness({
  config: { ...approvedConfig, enabled: false, organisationIds: [organisationIds[0]], workspaceTypes: ['agency'], release1: { status: 'pending' }, approval: { status: 'pending' } },
  evidence: { ...healthyEvidence, release1PromotionVerified: false, observationHours: 24, schema: {}, metrics: {} },
})
assert.equal(blocked.status, 'NO_GO')
for (const code of [
  'RELEASE_1_NOT_COMPLETED',
  'RELEASE_1_EVIDENCE_NOT_VERIFIED',
  'GOVERNANCE_SCHEMA_NOT_READY',
  'ACTIVITY_SOURCES_NOT_READY',
  'RELEASE_DISABLED',
  'EXPANSION_COHORT_TOO_SMALL',
  'WORKSPACE_COVERAGE_INSUFFICIENT',
  'RELEASE_APPROVAL_MISSING',
  'OBSERVATION_WINDOW_INCOMPLETE',
  'MONITORING_EVIDENCE_INCOMPLETE',
]) assert.ok(blocked.blockers.some((item) => item.code === code), `blocked release should report ${code}`)

const degraded = buildSettingsRelease2Readiness({
  config: approvedConfig,
  evidence: { ...healthyEvidence, metrics: { settingsWrites: 100, failedSettingsWrites: 2, settingsErrors: 1, ownershipTransferFailures: 1, criticalSupportIncidents: 1 } },
})
for (const code of ['SAVE_SUCCESS_RATE_BELOW_LIMIT', 'SETTINGS_ERRORS_ABOVE_LIMIT', 'OWNERSHIP_FAILURES_ABOVE_LIMIT', 'CRITICAL_SUPPORT_INCIDENTS_ABOVE_LIMIT']) {
  assert.ok(degraded.blockers.some((item) => item.code === code), `degraded release should report ${code}`)
}

const migrationFiles = (await readdir(new URL('../../supabase/migrations/', import.meta.url))).filter((file) => file.endsWith('.sql'))
const versions = migrationFiles.map((file) => file.split('_')[0])
assert.equal(new Set(versions).size, versions.length, 'Supabase migration version prefixes must remain globally unique')
for (const migration of SETTINGS_RELEASE_2_REQUIRED_MIGRATIONS) assert.ok(migrationFiles.includes(migration), `${migration} must exist`)

const gate = await readFile(new URL('./settings-release2-gate.mjs', import.meta.url), 'utf8')
assert.match(gate, /SETTINGS_RELEASE2_EVIDENCE/)
assert.match(gate, /release1PromotionVerified/)
assert.match(gate, /testResults\.every/)
assert.match(gate, /npm', \['run', 'build'\]/)
assert.match(gate, /if \(!report\.releaseRecommended\) process\.exitCode = 1/)

console.log('settings Phase 7 Release 2 gate checks passed')
