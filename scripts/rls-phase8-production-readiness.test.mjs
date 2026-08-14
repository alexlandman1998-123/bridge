import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const expectedTables = [
  'bond_rls_cutover_exclusions',
  'matter_number_sequences',
  'transaction_commissions',
  'transaction_document_requirements',
  'transaction_lifecycle_workflows',
  'transaction_rollup_validation',
  'workspace_regions',
  'workspace_units',
]

async function read(relPath) {
  return readFile(new URL(`../${relPath}`, import.meta.url), 'utf8')
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right))
}

const [packageJson, phase7, stagingEvidence, phase8, productionEvidence, report] = await Promise.all([
  read('package.json').then(JSON.parse),
  read('docs/supabase-rls-phase-7-staging-execution.json').then(JSON.parse),
  read('docs/staging-evidence/supabase-rls-phase-7-staging-execution.json').then(JSON.parse),
  read('docs/supabase-rls-phase-8-production-readiness.json').then(JSON.parse),
  read('docs/production-evidence/supabase-rls-phase-8-production-readiness.json').then(JSON.parse),
  read('docs/supabase-rls-phase-8-production-readiness-report.md'),
])

assert.equal(
  packageJson.scripts?.['test:rls-phase8-production-readiness'],
  'node scripts/rls-phase8-production-readiness.test.mjs',
  'package.json must expose the Phase 8 production readiness contract',
)

assert.equal(phase8.status, 'PRODUCTION_READY_STAGING_EVIDENCE_COMPLETE')
assert.equal(phase8.databaseMutation, 'none')
assert.equal(phase8.stagingProjectRef, 'vaszuxjeoajeuhlcnzzf')
assert.equal(phase8.productionProjectRef, 'isdowlnollckzvltkasn')
assert.equal(phase8.sourcePhase7Manifest, 'docs/supabase-rls-phase-7-staging-execution.json')
assert.equal(phase8.sourceStagingEvidence, 'docs/staging-evidence/supabase-rls-phase-7-staging-execution.json')
assert.equal(phase8.targetPolicy?.allowedTarget, 'production_after_explicit_apply_confirmation')
assert.equal(phase8.targetPolicy?.productionAllowed, true)
assert.equal(phase8.targetPolicy?.linkedProductionProjectIsValidTarget, false)
assert.equal(phase8.remoteApplyStatus?.staging, 'staging_execution_complete')
assert.equal(phase8.remoteApplyStatus?.production, 'ready_not_applied')

assert.equal(phase7.status, 'STAGING_EXECUTION_COMPLETE')
assert.equal(stagingEvidence.status, 'STAGING_EXECUTION_COMPLETE')
assert.equal(stagingEvidence.promotionDecision?.readyForProduction, true)
assert.equal(stagingEvidence.globalEvidence?.phase6CloseoutPassed, true)
assert.equal(stagingEvidence.globalEvidence?.targetVerifiedAsStaging, true)
assert.equal(stagingEvidence.globalEvidence?.productionTargetRejected, true)
assert.equal(stagingEvidence.globalEvidence?.advisorBeforeAttached, true)
assert.equal(stagingEvidence.globalEvidence?.advisorAfterAttached, true)
assert.equal(stagingEvidence.globalEvidence?.applicationSmokeAttached, true)

const phase8Tables = phase8.rlsPhaseMigrations.flatMap((spec) => spec.tables)
assert.deepEqual(sorted(phase8Tables), sorted(expectedTables), 'Phase 8 must cover all eight Phase 0 tables')
assert.deepEqual(
  phase8.rlsPhaseMigrations.map((spec) => spec.migration),
  phase7.rlsPhaseMigrations.map((spec) => spec.migration),
  'Phase 8 must preserve the Phase 7 migration order',
)

for (const [index, stagingItem] of stagingEvidence.phaseEvidence.entries()) {
  const phase8Item = phase8.rlsPhaseMigrations[index]
  assert.equal(stagingItem.phase, phase8Item.phase)
  assert.equal(stagingItem.migration, phase8Item.migration)
  assert.deepEqual(stagingItem.tables, phase8Item.tables)
  assert.equal(stagingItem.stagingSqlApplied, true)
  assert.equal(stagingItem.rlsEnabledVerified, true)
  assert.equal(stagingItem.negativeBrowserWriteProbe, 'passed')
  assert.equal(stagingItem.requiredWorkflowSmoke, 'passed')
}

assert.equal(productionEvidence.status, 'READY_PENDING_PRODUCTION_APPLY')
assert.equal(productionEvidence.databaseMutation, 'none')
assert.equal(productionEvidence.stagingProjectRef, phase8.stagingProjectRef)
assert.equal(productionEvidence.targetProjectRef, phase8.productionProjectRef)
assert.equal(productionEvidence.productionSqlApplied, false)
assert.equal(productionEvidence.rollbackPlanAttached, false)
assert.equal(productionEvidence.preApplyAdvisorAttached, false)
assert.equal(productionEvidence.postApplyAdvisorAttached, false)
assert.equal(productionEvidence.postApplySmokeAttached, false)
assert.equal(productionEvidence.phase7StagingEvidenceApproved, true)
assert.equal(productionEvidence.promotionDecision?.productionReady, true)
assert.equal(productionEvidence.phaseEvidence.length, phase8.rlsPhaseMigrations.length)

for (const [index, productionItem] of productionEvidence.phaseEvidence.entries()) {
  const phase8Item = phase8.rlsPhaseMigrations[index]
  assert.equal(productionItem.phase, phase8Item.phase)
  assert.equal(productionItem.migration, phase8Item.migration)
  assert.deepEqual(productionItem.tables, phase8Item.tables)
  assert.equal(productionItem.productionSqlApplied, false)
  assert.equal(productionItem.rlsEnabledVerified, false)
  assert.equal(productionItem.negativeBrowserWriteProbe, 'pending')
  assert.equal(productionItem.requiredWorkflowSmoke, 'pending')
}

assert.match(report, /Phase 8 is production-ready/i)
assert.match(report, /Production: ready and not applied/i)
assert.match(report, /Do not run against production/i)
assert.match(report, /vaszuxjeoajeuhlcnzzf/)
assert.match(report, /isdowlnollckzvltkasn/)
assert.doesNotMatch(report, /supabase db push --linked/i, 'Phase 8 report must not encourage linked DB apply')

const manifestText = JSON.stringify(phase8)
const evidenceText = JSON.stringify(productionEvidence)
assert.doesNotMatch(manifestText, /supabase db push --linked/i, 'Phase 8 manifest must not encourage linked DB apply')
assert.doesNotMatch(evidenceText, /supabase db push --linked/i, 'Phase 8 evidence must not encourage linked DB apply')

const phase7Result = spawnSync(process.execPath, ['scripts/rls-phase7-staging-execution.test.mjs'], {
  cwd: new URL('../', import.meta.url),
  encoding: 'utf8',
})
assert.equal(
  phase7Result.status,
  0,
  `Phase 8 requires Phase 7 staging contract to pass\nstdout:\n${phase7Result.stdout}\nstderr:\n${phase7Result.stderr}`,
)

console.log('RLS Phase 8 production readiness gate contract passed.')
