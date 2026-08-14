import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const STAGING_PROJECT_REF = 'vaszuxjeoajeuhlcnzzf'
const PRODUCTION_PROJECT_REF = 'isdowlnollckzvltkasn'
const PROBE_USER_ID = '00000000-0000-4000-8000-000000000001'
const TARGET_TABLES = [
  'bond_rls_cutover_exclusions',
  'matter_number_sequences',
  'transaction_commissions',
  'transaction_document_requirements',
  'transaction_lifecycle_workflows',
  'transaction_rollup_validation',
  'workspace_regions',
  'workspace_units',
]

function runSupabase(args, options = {}) {
  return spawnSync('supabase', args, {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  })
}

function query(sql) {
  return runSupabase(['db', 'query', '--linked', '--project-ref', STAGING_PROJECT_REF, sql])
}

function queryJson(sql) {
  const result = query(sql)
  assert.equal(result.status, 0, `SQL query failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  return JSON.parse(result.stdout)
}

function expectFailure(name, sql, patterns) {
  const result = query(sql)
  const output = `${result.stdout}\n${result.stderr}`
  assert.notEqual(result.status, 0, `${name} unexpectedly succeeded`)
  assert.ok(
    patterns.some((pattern) => pattern.test(output)),
    `${name} failed for an unexpected reason\n${output}`,
  )
  return {
    name,
    passed: true,
    reason: patterns.find((pattern) => pattern.test(output))?.source || 'expected_denial',
  }
}

function expectSuccess(name, sql) {
  const result = query(sql)
  assert.equal(result.status, 0, `${name} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  return { name, passed: true }
}

function asAuthenticated(sql) {
  return `
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${PROBE_USER_ID}', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"${PROBE_USER_ID}","email":"rls-probe@example.test","app_metadata":{}}',
  true
);
${sql}
rollback;`
}

function asServiceRole(sql) {
  return `
begin;
set local role service_role;
${sql}
rollback;`
}

const linkedRef = (await readFile(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8')).trim()
assert.equal(linkedRef, STAGING_PROJECT_REF, `Supabase CLI must be linked to staging ${STAGING_PROJECT_REF}`)
assert.notEqual(linkedRef, PRODUCTION_PROJECT_REF, 'Refusing to run staging smoke against production')

const projects = JSON.parse(runSupabase(['projects', 'list', '--output', 'json']).stdout)
const linkedProjects = projects.filter((project) => project.linked)
assert.equal(linkedProjects.length, 1, 'Exactly one Supabase project should be linked')
assert.equal(linkedProjects[0].ref, STAGING_PROJECT_REF, 'Linked project must be Arch9 Staging')

const fixture = queryJson(`
select
  t.id::text as transaction_id,
  t.organisation_id::text as organisation_id
from public.transactions t
where t.organisation_id is not null
limit 1;`).rows[0]
assert.ok(fixture?.transaction_id, 'A staging transaction fixture is required for rollback smoke')
assert.ok(fixture?.organisation_id, 'A staging organisation fixture is required for rollback smoke')

const rlsRows = queryJson(`
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (${TARGET_TABLES.map((table) => `'${table}'`).join(', ')})
order by c.relname;`).rows
assert.deepEqual(rlsRows.map((row) => row.table_name), [...TARGET_TABLES].sort())
assert.ok(rlsRows.every((row) => row.rls_enabled === true), 'Every target table must have RLS enabled')

const advisor = runSupabase([
  'db',
  'advisors',
  '--linked',
  '--project-ref',
  STAGING_PROJECT_REF,
  '--type',
  'security',
  '--level',
  'warn',
  '--fail-on',
  'none',
])
assert.equal(advisor.status, 0, `Security advisor failed\nstdout:\n${advisor.stdout}\nstderr:\n${advisor.stderr}`)
const advisorResults = JSON.parse(advisor.stdout).results || []
const targetRlsDisabled = advisorResults.filter((item) => (
  item.name === 'rls_disabled_in_public'
  && TARGET_TABLES.includes(item.metadata?.name)
))
assert.deepEqual(targetRlsDisabled, [], 'Advisor must not report target tables as RLS-disabled')

const denialPatterns = [
  /violates row-level security policy/i,
  /permission denied for table/i,
  /new row violates row-level security policy/i,
]

const tx = fixture.transaction_id
const org = fixture.organisation_id
const negativeBrowserWriteProbes = [
  expectFailure(
    'phase1_matter_number_sequences_authenticated_insert_denied',
    asAuthenticated("insert into public.matter_number_sequences(matter_year, last_value) values (2899, 1);"),
    denialPatterns,
  ),
  expectFailure(
    'phase1_bond_rls_cutover_exclusions_broad_insert_denied',
    asAuthenticated(`insert into public.bond_rls_cutover_exclusions(transaction_id, exclusion_type, reason) values ('${tx}', 'rls_smoke', 'probe');`),
    denialPatterns,
  ),
  expectFailure(
    'phase2_workspace_regions_broad_insert_denied',
    asAuthenticated(`insert into public.workspace_regions(workspace_id, name) values ('${org}', 'RLS Smoke Region');`),
    denialPatterns,
  ),
  expectFailure(
    'phase2_workspace_units_broad_insert_denied',
    asAuthenticated(`insert into public.workspace_units(workspace_id, unit_type, name) values ('${org}', 'branch', 'RLS Smoke Unit');`),
    denialPatterns,
  ),
  expectFailure(
    'phase3_transaction_document_requirements_broad_insert_denied',
    asAuthenticated(`insert into public.transaction_document_requirements(transaction_id, rule_id, document_key, document_name, owning_workflow, visible_section, source) values ('${tx}', 'rls_smoke_rule', 'rls_smoke_doc', 'RLS Smoke Document', 'transfer', 'internal', 'rls_smoke');`),
    denialPatterns,
  ),
  expectFailure(
    'phase3_transaction_lifecycle_workflows_broad_insert_denied',
    asAuthenticated(`insert into public.transaction_lifecycle_workflows(transaction_id, current_stage) values ('${tx}', 'instruction');`),
    denialPatterns,
  ),
  expectFailure(
    'phase4_transaction_commissions_authenticated_insert_denied',
    asAuthenticated("insert into public.transaction_commissions(status) values ('draft');"),
    denialPatterns,
  ),
  expectFailure(
    'phase5_transaction_rollup_validation_authenticated_insert_denied',
    asAuthenticated("insert into public.transaction_rollup_validation(transaction_id, comparison_status) values ('rls-smoke', 'match');"),
    denialPatterns,
  ),
]

const requiredWorkflowSmokes = [
  expectSuccess(
    'phase1_service_role_control_table_write_rollback',
    asServiceRole(`
insert into public.matter_number_sequences(matter_year, last_value) values (2899, 1);
insert into public.bond_rls_cutover_exclusions(transaction_id, exclusion_type, reason) values ('${tx}', 'rls_smoke', 'probe');`),
  ),
  expectSuccess(
    'phase2_service_role_workspace_hierarchy_write_rollback',
    asServiceRole(`
insert into public.workspace_regions(workspace_id, name) values ('${org}', 'RLS Smoke Region');
insert into public.workspace_units(workspace_id, unit_type, name) values ('${org}', 'branch', 'RLS Smoke Unit');`),
  ),
  expectSuccess(
    'phase3_service_role_transaction_read_model_write_rollback',
    asServiceRole(`
insert into public.transaction_document_requirements(transaction_id, rule_id, document_key, document_name, owning_workflow, visible_section, source) values ('${tx}', 'rls_smoke_rule', 'rls_smoke_doc', 'RLS Smoke Document', 'transfer', 'internal', 'rls_smoke');
update public.transaction_lifecycle_workflows set updated_at = updated_at where transaction_id = '${tx}';`),
  ),
  expectSuccess(
    'phase4_service_role_transaction_commission_write_rollback',
    asServiceRole(`insert into public.transaction_commissions(organisation_id, transaction_id, status) values ('${org}', '${tx}', 'draft');`),
  ),
  expectSuccess(
    'phase5_service_role_rollup_validation_write_rollback',
    asServiceRole(`insert into public.transaction_rollup_validation(transaction_id, comparison_status) values ('rls-smoke', 'match');`),
  ),
]

console.log(JSON.stringify({
  status: 'STAGING_SMOKE_PASSED',
  projectRef: STAGING_PROJECT_REF,
  fixture,
  rlsEnabledTables: rlsRows.map((row) => row.table_name),
  advisor: {
    checked: true,
    issueCount: advisorResults.length,
    targetRlsDisabledCount: targetRlsDisabled.length,
  },
  negativeBrowserWriteProbes,
  requiredWorkflowSmokes,
}, null, 2))
