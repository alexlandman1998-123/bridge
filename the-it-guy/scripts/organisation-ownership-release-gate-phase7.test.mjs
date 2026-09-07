#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appRoot, '..')
const [migration, settingsApi, usersPage] = await Promise.all([
  readFile(path.join(repoRoot, 'supabase/migrations/20260907133425_organisation_ownership_release_gate_phase7.sql'), 'utf8'),
  readFile(path.join(appRoot, 'src/lib/settingsApi.js'), 'utf8'),
  readFile(path.join(appRoot, 'src/pages/settings/SettingsUsersPage.jsx'), 'utf8'),
])

assert.match(migration, /create or replace function public\.bridge_organisation_ownership_release_readiness\(\)/)
assert.match(migration, /Only platform administrators can inspect ownership release readiness/)
assert.match(migration, /ready_for_unique_primary_enforcement/)
assert.match(migration, /remediation_required/)
assert.match(migration, /multiple_active_primary_owners/)
assert.doesNotMatch(migration, /create unique index/i)
assert.match(settingsApi, /export async function getOrganisationOwnershipReleaseReadiness/)
assert.match(settingsApi, /bridge_organisation_ownership_release_readiness/)
assert.match(usersPage, /Release gate passed/)
assert.match(usersPage, /Release gate is blocked/)

console.log('organisation ownership release gate phase 7: passed')
