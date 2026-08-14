import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const phase0 = JSON.parse(
  await readFile(new URL('../docs/supabase-rls-phase-0-policy-classification.json', import.meta.url), 'utf8'),
)
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

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

const phaseSpecs = [
  {
    phase: 1,
    script: 'test:rls-phase1-internal-controls',
    migration: 'supabase/migrations/20260814163310_rls_phase1_internal_controls.sql',
    test: 'scripts/rls-phase1-internal-controls.test.mjs',
    report: 'docs/supabase-rls-phase-1-internal-controls-report.md',
    tables: ['matter_number_sequences', 'bond_rls_cutover_exclusions'],
  },
  {
    phase: 2,
    script: 'test:rls-phase2-workspace-hierarchy',
    migration: 'supabase/migrations/20260814163832_rls_phase2_workspace_hierarchy.sql',
    test: 'scripts/rls-phase2-workspace-hierarchy.test.mjs',
    report: 'docs/supabase-rls-phase-2-workspace-hierarchy-report.md',
    tables: ['workspace_regions', 'workspace_units'],
  },
  {
    phase: 3,
    script: 'test:rls-phase3-transaction-read-models',
    migration: 'supabase/migrations/20260814164152_rls_phase3_transaction_read_models.sql',
    test: 'scripts/rls-phase3-transaction-read-models.test.mjs',
    report: 'docs/supabase-rls-phase-3-transaction-read-models-report.md',
    tables: ['transaction_document_requirements', 'transaction_lifecycle_workflows'],
  },
  {
    phase: 4,
    script: 'test:rls-phase4-transaction-commissions',
    migration: 'supabase/migrations/20260814164526_rls_phase4_transaction_commissions.sql',
    test: 'scripts/rls-phase4-transaction-commissions.test.mjs',
    report: 'docs/supabase-rls-phase-4-transaction-commissions-report.md',
    tables: ['transaction_commissions'],
  },
  {
    phase: 5,
    script: 'test:rls-phase5-rollup-validation-diagnostics',
    migration: 'supabase/migrations/20260814164904_rls_phase5_rollup_validation_diagnostics.sql',
    test: 'scripts/rls-phase5-rollup-validation-diagnostics.test.mjs',
    report: 'docs/supabase-rls-phase-5-rollup-validation-diagnostics-report.md',
    tables: ['transaction_rollup_validation'],
  },
]

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right))
}

async function read(relPath) {
  return readFile(new URL(`../${relPath}`, import.meta.url), 'utf8')
}

assert.deepEqual(
  sorted(phase0.scope.tables),
  sorted(expectedTables),
  'Phase 0 table scope must stay aligned with the original advisor list',
)

const coveredTables = phaseSpecs.flatMap((spec) => spec.tables)
assert.deepEqual(sorted(coveredTables), sorted(expectedTables), 'Phase specs must cover every Phase 0 table')
assert.equal(new Set(coveredTables).size, coveredTables.length, 'Each Phase 0 table must be assigned to exactly one phase')

for (const spec of phaseSpecs) {
  assert.equal(
    packageJson.scripts?.[spec.script],
    `node ${spec.test}`,
    `package.json must expose ${spec.script}`,
  )

  const [migration, test, report] = await Promise.all([
    read(spec.migration),
    read(spec.test),
    read(spec.report),
  ])
  const loweredMigration = migration.toLowerCase()

  assert.match(migration, /^begin;/i, `Phase ${spec.phase} migration should be transactional`)
  assert.match(migration, /notify pgrst, 'reload schema';/i, `Phase ${spec.phase} migration should reload PostgREST schema`)
  assert.match(migration, /commit;\s*$/i, `Phase ${spec.phase} migration should commit`)
  assert.match(report, /has not been applied to staging or production/i, `Phase ${spec.phase} report must state remote apply status`)
  assert.match(report, /Apply Gates/i, `Phase ${spec.phase} report must document staging apply gates`)
  assert.match(test, /auth\.role\(\)/, `Phase ${spec.phase} test must guard against deprecated auth.role predicates`)

  assert.ok(!loweredMigration.includes('auth.role()'), `Phase ${spec.phase} migration must not use auth.role()`)
  assert.doesNotMatch(migration, /to authenticated\s+using\s*\(\s*true\s*\)/i, `Phase ${spec.phase} migration must not use broad authenticated policies`)
  assert.doesNotMatch(migration, /to anon/i, `Phase ${spec.phase} migration must not create anon policies`)

  for (const table of spec.tables) {
    assert.match(
      migration,
      new RegExp(`alter table if exists public\\.${table} enable row level security;`, 'i'),
      `Phase ${spec.phase} migration must enable RLS on ${table}`,
    )
    assert.match(report, new RegExp(`public\\.${table}|${table}`, 'i'), `Phase ${spec.phase} report must mention ${table}`)
  }
}

for (const spec of phaseSpecs) {
  const result = spawnSync(process.execPath, [spec.test], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  })
  assert.equal(
    result.status,
    0,
    `${spec.script} must pass\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  )
}

console.log('RLS Phase 6 closeout package contract passed.')
