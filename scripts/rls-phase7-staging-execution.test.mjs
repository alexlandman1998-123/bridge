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

const expectedMigrations = [
  'supabase/migrations/20260814163310_rls_phase1_internal_controls.sql',
  'supabase/migrations/20260814163832_rls_phase2_workspace_hierarchy.sql',
  'supabase/migrations/20260814164152_rls_phase3_transaction_read_models.sql',
  'supabase/migrations/20260814164526_rls_phase4_transaction_commissions.sql',
  'supabase/migrations/20260814164904_rls_phase5_rollup_validation_diagnostics.sql',
]

async function read(relPath) {
  return readFile(new URL(`../${relPath}`, import.meta.url), 'utf8')
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right))
}

const [packageJson, phase0, phase7, evidence, report] = await Promise.all([
  read('package.json').then(JSON.parse),
  read('docs/supabase-rls-phase-0-policy-classification.json').then(JSON.parse),
  read('docs/supabase-rls-phase-7-staging-execution.json').then(JSON.parse),
  read('docs/staging-evidence/supabase-rls-phase-7-staging-execution.json').then(JSON.parse),
  read('docs/supabase-rls-phase-7-staging-execution-report.md'),
])

assert.equal(
  packageJson.scripts?.['test:rls-phase7-staging-execution'],
  'node scripts/rls-phase7-staging-execution.test.mjs',
  'package.json must expose the Phase 7 staging execution contract',
)
assert.equal(
  packageJson.scripts?.['verify:rls-phase7-staging-smoke'],
  'node scripts/rls-phase7-staging-smoke.mjs',
  'package.json must expose the Phase 7 live staging smoke runner',
)

assert.deepEqual(sorted(phase0.scope.tables), sorted(expectedTables), 'Phase 7 must stay aligned to the Phase 0 table scope')
assert.equal(phase7.status, 'STAGING_EXECUTION_COMPLETE')
assert.equal(phase7.databaseMutation, 'none')
assert.equal(phase7.stagingProjectRef, 'vaszuxjeoajeuhlcnzzf')
assert.equal(phase7.productionProjectRef, 'isdowlnollckzvltkasn')
assert.notEqual(phase7.stagingProjectRef, phase7.productionProjectRef, 'Staging and production project refs must differ')
assert.equal(phase7.targetPolicy?.allowedTarget, 'staging')
assert.equal(phase7.targetPolicy?.productionAllowed, false)
assert.equal(phase7.targetPolicy?.linkedProductionProjectIsValidTarget, false)
assert.equal(phase7.remoteApplyStatus?.staging, 'staging_execution_complete')
assert.equal(phase7.remoteApplyStatus?.production, 'not_applied')

const phaseMigrations = phase7.rlsPhaseMigrations.map((spec) => spec.migration)
assert.deepEqual(phaseMigrations, expectedMigrations, 'Phase 7 must preserve RLS migration apply order')
assert.deepEqual(
  sorted(phase7.rlsPhaseMigrations.flatMap((spec) => spec.tables)),
  sorted(expectedTables),
  'Phase 7 must cover all eight Phase 0 tables',
)

for (const spec of phase7.rlsPhaseMigrations) {
  const migration = await read(spec.migration)

  assert.equal(packageJson.scripts?.[spec.testScript], `node scripts/rls-phase${spec.phase}-${spec.name.replaceAll('_', '-')}.test.mjs`)
  assert.match(migration, /^begin;/i, `Phase ${spec.phase} migration should be transactional`)
  assert.match(migration, /notify pgrst, 'reload schema';/i, `Phase ${spec.phase} migration should reload PostgREST schema`)
  assert.match(migration, /commit;\s*$/i, `Phase ${spec.phase} migration should commit`)

  for (const table of spec.tables) {
    assert.match(
      migration,
      new RegExp(`alter table if exists public\\.${table} enable row level security;`, 'i'),
      `Phase ${spec.phase} migration must enable RLS on ${table}`,
    )
  }
}

assert.equal(evidence.status, 'STAGING_EXECUTION_COMPLETE')
assert.equal(evidence.databaseMutation, 'staging_sql_applied')
assert.equal(evidence.targetProjectRef, phase7.stagingProjectRef)
assert.equal(evidence.productionProjectRef, phase7.productionProjectRef)
assert.equal(evidence.phaseEvidence.length, phase7.rlsPhaseMigrations.length)
assert.equal(evidence.promotionDecision?.readyForProduction, true)
assert.equal(evidence.globalEvidence?.phase6CloseoutPassed, true)
assert.equal(evidence.globalEvidence?.targetVerifiedAsStaging, true)
assert.equal(evidence.globalEvidence?.productionTargetRejected, true)
assert.equal(evidence.globalEvidence?.advisorBeforeAttached, true)
assert.equal(evidence.globalEvidence?.advisorAfterAttached, true)
assert.equal(evidence.globalEvidence?.applicationSmokeAttached, true)

for (const [index, item] of evidence.phaseEvidence.entries()) {
  const spec = phase7.rlsPhaseMigrations[index]
  assert.equal(item.phase, spec.phase)
  assert.equal(item.migration, spec.migration)
  assert.deepEqual(item.tables, spec.tables)
  assert.equal(item.stagingSqlApplied, true)
  assert.equal(item.rlsEnabledVerified, true)
  assert.equal(item.negativeBrowserWriteProbe, 'passed')
  assert.equal(item.requiredWorkflowSmoke, 'passed')
}

assert.match(report, /Phase 7 staging execution is complete/i)
assert.match(report, /has not been applied to production/i)
assert.match(report, /Do not run against production/i)
assert.match(report, /vaszuxjeoajeuhlcnzzf/)
assert.match(report, /isdowlnollckzvltkasn/)
assert.doesNotMatch(report, /supabase db push --linked/i, 'Phase 7 report must not encourage linked DB apply')

const phase7Text = JSON.stringify(phase7)
assert.doesNotMatch(phase7Text, /supabase db push --linked/i, 'Phase 7 manifest must not encourage linked DB apply')

const smoke = JSON.parse(await read('docs/supabase-rls-phase-7-staging-smoke-result.json'))
assert.equal(smoke.status, 'STAGING_SMOKE_PASSED')
assert.equal(smoke.projectRef, 'vaszuxjeoajeuhlcnzzf')
assert.equal(smoke.advisor?.targetRlsDisabledCount, 0)
assert.deepEqual(sorted(smoke.rlsEnabledTables), sorted(expectedTables))
assert.ok(smoke.negativeBrowserWriteProbes.every((probe) => probe.passed), 'All browser write probes should pass')
assert.ok(smoke.requiredWorkflowSmokes.every((probe) => probe.passed), 'All workflow smokes should pass')

const closeout = spawnSync(process.execPath, ['scripts/rls-phase6-closeout.test.mjs'], {
  cwd: new URL('../', import.meta.url),
  encoding: 'utf8',
})
assert.equal(
  closeout.status,
  0,
  `Phase 7 requires Phase 6 closeout to pass\nstdout:\n${closeout.stdout}\nstderr:\n${closeout.stderr}`,
)

console.log('RLS Phase 7 staging execution gate contract passed.')
