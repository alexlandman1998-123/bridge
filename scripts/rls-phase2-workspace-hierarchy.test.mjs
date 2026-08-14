import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20260814163832_rls_phase2_workspace_hierarchy.sql', import.meta.url),
  'utf8',
)
const lowered = migration.toLowerCase()

function assertHas(pattern, message) {
  assert.match(migration, pattern, message)
}

function assertNot(pattern, message) {
  assert.doesNotMatch(migration, pattern, message)
}

for (const table of ['workspace_regions', 'workspace_units']) {
  assertHas(
    new RegExp(`alter table if exists public\\.${table} enable row level security;`, 'i'),
    `${table} must enable RLS`,
  )
  assertHas(
    new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated;`, 'i'),
    `${table} must revoke broad browser/API grants first`,
  )
  assertHas(
    new RegExp(`grant select, insert, update on table public\\.${table} to authenticated;`, 'i'),
    `${table} must expose only reviewed authenticated verbs`,
  )
  assertHas(
    new RegExp(`grant all on table public\\.${table} to service_role;`, 'i'),
    `${table} must preserve service role access`,
  )
  assertNot(
    new RegExp(`create policy\\s+\\w+[\\s\\S]*on public\\.${table}[\\s\\S]*for delete`, 'i'),
    `${table} must not add a delete policy`,
  )
}

assertHas(
  /create or replace function public\.bridge_can_manage_workspace_hierarchy\(\s*target_workspace_id uuid\s*\)[\s\S]*security definer[\s\S]*public\.bridge_phase5_can_manage_hierarchy\(target_workspace_id\)[\s\S]*public\.bridge_has_workspace_permission\(target_workspace_id, 'manage_branches'\)[\s\S]*public\.bridge_is_org_admin\(target_workspace_id\)/i,
  'workspace hierarchy writes must use existing hierarchy/admin helpers',
)
assertHas(
  /revoke all on function public\.bridge_can_manage_workspace_hierarchy\(uuid\)[\s\S]*from public, anon;/i,
  'workspace hierarchy management helper must not be public/anon callable',
)
assertHas(
  /grant execute on function public\.bridge_can_manage_workspace_hierarchy\(uuid\)[\s\S]*to authenticated, service_role;/i,
  'workspace hierarchy management helper must be callable by authenticated/service_role',
)

assertHas(
  /create policy workspace_regions_member_select[\s\S]*for select[\s\S]*to authenticated[\s\S]*using \(public\.bridge_is_active_member\(workspace_id\)\)/i,
  'workspace_regions select must be scoped to active workspace members',
)
assertHas(
  /create policy workspace_regions_manager_insert[\s\S]*for insert[\s\S]*to authenticated[\s\S]*with check \(public\.bridge_can_manage_workspace_hierarchy\(workspace_id\)\)/i,
  'workspace_regions insert must be manager-scoped',
)
assertHas(
  /create policy workspace_regions_manager_update[\s\S]*for update[\s\S]*to authenticated[\s\S]*using \(public\.bridge_can_manage_workspace_hierarchy\(workspace_id\)\)[\s\S]*with check \(public\.bridge_can_manage_workspace_hierarchy\(workspace_id\)\)/i,
  'workspace_regions update must use both USING and WITH CHECK',
)

assertHas(
  /create or replace function public\.bridge_workspace_unit_hierarchy_shape_is_valid\(\s*target_workspace_id uuid,\s*target_region_id uuid,\s*target_parent_unit_id uuid\s*\)[\s\S]*security definer[\s\S]*from public\.workspace_regions wr[\s\S]*wr\.workspace_id = target_workspace_id[\s\S]*from public\.workspace_units wu[\s\S]*wu\.workspace_id = target_workspace_id/i,
  'workspace_units must validate region and parent unit stay in the same workspace',
)
assertHas(
  /revoke all on function public\.bridge_workspace_unit_hierarchy_shape_is_valid\(uuid, uuid, uuid\)[\s\S]*from public, anon;/i,
  'workspace unit shape helper must not be public/anon callable',
)
assertHas(
  /create policy workspace_units_member_select[\s\S]*for select[\s\S]*to authenticated[\s\S]*using \(public\.bridge_is_active_member\(workspace_id\)\)/i,
  'workspace_units select must be scoped to active workspace members',
)
assertHas(
  /create policy workspace_units_manager_insert[\s\S]*for insert[\s\S]*to authenticated[\s\S]*with check \([\s\S]*public\.bridge_can_manage_workspace_hierarchy\(workspace_id\)[\s\S]*public\.bridge_workspace_unit_hierarchy_shape_is_valid\(workspace_id, region_id, parent_unit_id\)[\s\S]*\)/i,
  'workspace_units insert must be manager-scoped and validate hierarchy shape',
)
assertHas(
  /create policy workspace_units_manager_update[\s\S]*for update[\s\S]*to authenticated[\s\S]*using \(public\.bridge_can_manage_workspace_hierarchy\(workspace_id\)\)[\s\S]*with check \([\s\S]*public\.bridge_can_manage_workspace_hierarchy\(workspace_id\)[\s\S]*public\.bridge_workspace_unit_hierarchy_shape_is_valid\(workspace_id, region_id, parent_unit_id\)[\s\S]*\)/i,
  'workspace_units update must use both USING and WITH CHECK plus shape validation',
)

assert.ok(!lowered.includes('auth.role()'), 'migration must not use deprecated auth.role() predicates')
assertNot(/to authenticated\s+using\s*\(\s*true\s*\)/i, 'migration must not use broad authenticated policies')
assertNot(/to anon/i, 'migration must not add anon policies')

console.log('RLS Phase 2 workspace hierarchy migration contract passed.')
