#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const migrationPath = path.join(repoRoot, 'supabase/migrations/20260907131142_organisation_multi_owner_contract_phase1.sql')
const migration = await readFile(migrationPath, 'utf8')

assert.match(migration, /create or replace function public\.bridge_guard_organisation_owner_contract\(\)/)
assert.match(migration, /create or replace function public\.bridge_canonicalize_onboarding_primary_owner\(\)/)
assert.match(migration, /bridge_complete_workspace_onboarding_phase2/)
assert.match(migration, /primary organisation owner must be an active member with the owner role/i)
assert.match(migration, /organisation can have only one active primary owner/i)
assert.match(migration, /active organisation must retain at least one owner/i)
assert.match(migration, /create or replace function public\.bridge_grant_organisation_owner\(/)
assert.match(migration, /p_make_primary boolean default false/)
assert.match(migration, /create or replace function public\.bridge_transfer_organisation_ownership/)
assert.match(migration, /organisation_primary_ownership_transferred/)
assert.doesNotMatch(migration, /set role = v_previous_owner_role/)

console.log('organisation ownership contract phase 1: passed')
