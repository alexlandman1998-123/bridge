#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appRoot, '..')
const migration = await readFile(
  path.join(repoRoot, 'supabase/migrations/20260907155543_organisation_primary_owner_control_phase4.sql'),
  'utf8',
)
const onboardingMigration = await readFile(
  path.join(repoRoot, 'supabase/migrations/20260907155220_onboarding_primary_owner_source_phase3.sql'),
  'utf8',
)
const settingsApi = await readFile(path.join(appRoot, 'src/lib/settingsApi.js'), 'utf8')
const usersPage = await readFile(path.join(appRoot, 'src/pages/settings/SettingsUsersPage.jsx'), 'utf8')

assert.match(migration, /bridge_guard_primary_organisation_owner_change/)
assert.match(migration, /before update of is_primary_owner on public\.organisation_users/i)
assert.match(migration, /Primary owner changes must use the organisation ownership controls/i)
assert.match(migration, /current_setting\('bridge\.ownership_transfer', true\) = 'on'/)
assert.match(migration, /auth\.uid\(\) is null/)
assert.doesNotMatch(migration, /grant execute on function public\.bridge_guard_primary_organisation_owner_change/i)

assert.match(onboardingMigration, /set_config\('bridge\.ownership_transfer', 'on', true\)/)
assert.match(settingsApi, /bridge_grant_organisation_owner/)
assert.match(settingsApi, /bridge_transfer_organisation_ownership/)
assert.match(usersPage, /Grant owner/)
assert.match(usersPage, /Make primary owner/)

console.log('organisation primary-owner control phase 4: passed')
