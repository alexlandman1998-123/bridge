#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appRoot, '..')
const migration = await readFile(
  path.join(repoRoot, 'supabase/migrations/20260907154525_organisation_permission_integrity_audit_phase1.sql'),
  'utf8',
)
const settingsApi = await readFile(path.join(appRoot, 'src/lib/settingsApi.js'), 'utf8')
const settingsUsersPage = await readFile(path.join(appRoot, 'src/pages/settings/SettingsUsersPage.jsx'), 'utf8')

assert.match(migration, /create or replace function public\.bridge_organisation_permission_integrity_report\(/)
assert.match(migration, /security definer/)
assert.match(migration, /set search_path = public/)
assert.match(migration, /Only platform administrators can inspect the organisation permission-integrity audit/i)
assert.match(migration, /role_fields_incomplete/)
assert.match(migration, /role_fields_conflict/)
assert.match(migration, /primary_owner_role_mismatch/)
assert.match(migration, /duplicate_active_membership_group_count/)
assert.match(migration, /revoke all on function public\.bridge_organisation_permission_integrity_report\(uuid\) from public/i)
assert.match(migration, /grant execute on function public\.bridge_organisation_permission_integrity_report\(uuid\) to authenticated/i)
assert.doesNotMatch(migration, /\b(update|insert into|delete from)\s+public\.organisation_users\b/i)

assert.match(settingsApi, /export async function getOrganisationPermissionIntegrityReport/)
assert.match(settingsApi, /bridge_organisation_permission_integrity_report/)
assert.match(settingsUsersPage, /getOrganisationPermissionIntegrityReport/)
assert.match(settingsUsersPage, /Permission-integrity audit:/)

console.log('organisation permission-integrity audit phase 1: passed')
