#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appRoot, '..')
const migration = await readFile(
  path.join(repoRoot, 'supabase/migrations/20260907155750_organisation_ownership_health_phase5.sql'),
  'utf8',
)
const settingsApi = await readFile(path.join(appRoot, 'src/lib/settingsApi.js'), 'utf8')
const usersPage = await readFile(path.join(appRoot, 'src/pages/settings/SettingsUsersPage.jsx'), 'utf8')

assert.match(migration, /create or replace function public\.bridge_organisation_ownership_health\(/)
assert.match(migration, /security definer/)
assert.match(migration, /set search_path = public/)
assert.match(migration, /Authentication is required/i)
assert.match(migration, /An active organisation membership is required to inspect ownership health/i)
assert.match(migration, /no_active_owner/)
assert.match(migration, /primary_owner_is_not_active/)
assert.match(migration, /multiple_primary_owners/)
assert.match(migration, /primary_owner_role_mismatch/)
assert.match(migration, /server_authoritative_phase5/)
assert.match(migration, /revoke all on function public\.bridge_organisation_ownership_health\(uuid\) from public/i)
assert.match(migration, /grant execute on function public\.bridge_organisation_ownership_health\(uuid\) to authenticated/i)

assert.match(settingsApi, /export async function getOrganisationOwnershipHealthReport/)
assert.match(settingsApi, /bridge_organisation_ownership_health/)
assert.match(usersPage, /getOrganisationOwnershipHealthReport/)
assert.match(usersPage, /serverOwnershipHealth \|\| getOrganisationOwnershipHealth\(users\)/)

console.log('organisation ownership health phase 5 server: passed')
