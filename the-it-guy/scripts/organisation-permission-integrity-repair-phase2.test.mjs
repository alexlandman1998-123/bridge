#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appRoot, '..')
const migration = await readFile(
  path.join(repoRoot, 'supabase/migrations/20260907154858_organisation_permission_integrity_repair_phase2.sql'),
  'utf8',
)
const settingsApi = await readFile(path.join(appRoot, 'src/lib/settingsApi.js'), 'utf8')
const settingsUsersPage = await readFile(path.join(appRoot, 'src/pages/settings/SettingsUsersPage.jsx'), 'utf8')

assert.match(migration, /bridge_canonicalize_organisation_membership_role/)
assert.match(migration, /before insert or update of role, workspace_role, organisation_role, organization_role/i)
assert.match(migration, /new\.role := v_role/)
assert.match(migration, /new\.workspace_role := v_role/)
assert.match(migration, /new\.organisation_role := v_role/)
assert.match(migration, /new\.organization_role := v_role/)
assert.match(migration, /bridge_apply_safe_organisation_permission_integrity_repair/)
assert.match(migration, /Only platform administrators can repair organisation permission integrity/i)
assert.match(migration, /p_apply boolean default false/)
assert.match(migration, /populated_role_field_count < 4/)
assert.match(migration, /distinct_role_value_count = 1/)
assert.match(migration, /not is_primary_owner or effective_role = 'owner'/)
assert.match(migration, /organisation_permission_integrity_repaired_phase2/)
assert.match(migration, /revoke all on function public\.bridge_apply_safe_organisation_permission_integrity_repair\(uuid, boolean\) from public/i)
assert.match(migration, /grant execute on function public\.bridge_apply_safe_organisation_permission_integrity_repair\(uuid, boolean\) to authenticated/i)

assert.match(settingsApi, /export async function applySafeOrganisationPermissionIntegrityRepair/)
assert.match(settingsUsersPage, /Apply safe role repair/)
assert.match(settingsUsersPage, /will not change a member's effective role/)

console.log('organisation permission-integrity repair phase 2: passed')
