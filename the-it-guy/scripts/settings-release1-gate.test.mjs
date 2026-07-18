import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import {
  SETTINGS_RELEASE_1_REQUIRED_MIGRATIONS,
  SETTINGS_RELEASE_1_VERSION,
  buildSettingsRelease1Readiness,
} from '../src/lib/settingsRelease1.js'

const approvedConfig = {
  version: SETTINGS_RELEASE_1_VERSION,
  enabled: true,
  environment: 'production',
  organisationIds: ['11111111-1111-4111-8111-111111111111'],
  workspaceTypes: ['agency'],
  approval: { status: 'approved', approvedBy: 'release-owner', approvedAt: '2026-07-17T20:00:00.000Z' },
  limits: { maxOrganisations: 5, maxSettingsErrors24h: 0, maxFailedSaves24h: 0, maxOwnershipTransferFailures24h: 0 },
  rollback: { strategy: 'disable_cohort_and_redeploy_previous_frontend', databaseMigrationsAreForwardOnly: true },
}
const healthyEvidence = {
  uniqueMigrationVersions: true,
  requiredMigrationsPresent: true,
  phaseContractsPass: true,
  productionBuildPass: true,
  liveSchemaChecked: true,
  schema: {
    jobTitleColumn: true,
    jobTitleRpc: true,
    roleGovernanceRpc: true,
    ownershipTransferRpc: true,
    securityAuditEvents: true,
    organizationEvents: true,
    billingEvents: true,
  },
  metrics: { settingsErrors24h: 0, failedSaves24h: 0, ownershipTransferFailures24h: 0 },
  checkedAt: '2026-07-17T20:30:00.000Z',
}

const healthy = buildSettingsRelease1Readiness({ config: approvedConfig, evidence: healthyEvidence })
assert.equal(healthy.status, 'GO')
assert.equal(healthy.releaseRecommended, true)
assert.equal(healthy.mutatedData, false)

const blocked = buildSettingsRelease1Readiness({
  config: { ...approvedConfig, enabled: false, organisationIds: [], approval: { status: 'pending' } },
  evidence: { ...healthyEvidence, uniqueMigrationVersions: false, schema: {} },
})
assert.equal(blocked.status, 'NO_GO')
for (const code of ['MIGRATION_VERSION_COLLISION', 'JOB_TITLE_SCHEMA_NOT_READY', 'ROLE_GOVERNANCE_NOT_READY', 'OWNERSHIP_TRANSFER_NOT_READY', 'ACTIVITY_SOURCES_NOT_READY', 'RELEASE_DISABLED', 'PILOT_COHORT_EMPTY', 'RELEASE_APPROVAL_MISSING']) {
  assert.ok(blocked.blockers.some((item) => item.code === code), `blocked release should report ${code}`)
}

const migrationFiles = (await readdir(new URL('../../supabase/migrations/', import.meta.url))).filter((file) => file.endsWith('.sql'))
const versions = migrationFiles.map((file) => file.split('_')[0])
assert.equal(new Set(versions).size, versions.length, 'Supabase migration version prefixes must be globally unique')
for (const migration of SETTINGS_RELEASE_1_REQUIRED_MIGRATIONS) assert.ok(migrationFiles.includes(migration), `${migration} must exist`)

const gate = await readFile(new URL('./settings-release1-gate.mjs', import.meta.url), 'utf8')
assert.match(gate, /SETTINGS_RELEASE1_SCHEMA_EVIDENCE/)
assert.match(gate, /testResults\.every/)
assert.match(gate, /npm', \['run', 'build'\]/)
assert.match(gate, /if \(!report\.releaseRecommended\) process\.exitCode = 1/)

console.log('settings Phase 7 Release 1 gate checks passed')
