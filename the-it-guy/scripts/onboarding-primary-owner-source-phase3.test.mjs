#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appRoot, '..')
const migration = await readFile(
  path.join(repoRoot, 'supabase/migrations/20260907155220_onboarding_primary_owner_source_phase3.sql'),
  'utf8',
)
const contracts = await readFile(path.join(appRoot, 'src/constants/roleContract.js'), 'utf8')
const workspaceService = await readFile(path.join(appRoot, 'src/services/workspaceService.js'), 'utf8')
const settingsApi = await readFile(path.join(appRoot, 'src/lib/settingsApi.js'), 'utf8')

assert.match(migration, /bridge_complete_workspace_onboarding_v3/)
assert.match(migration, /bridge_complete_workspace_onboarding\(v_payload\)/)
assert.match(migration, /'membership_role', 'owner'/)
assert.match(migration, /'workspace_role', 'owner'/)
assert.match(migration, /'organisation_role', 'owner'/)
assert.match(migration, /'is_primary_owner', true/)
assert.match(migration, /Authentication is required/i)
assert.match(migration, /revoke all on function public\.bridge_complete_workspace_onboarding_v3\(jsonb\) from public/i)
assert.match(migration, /grant execute on function public\.bridge_complete_workspace_onboarding_v3\(jsonb\) to authenticated/i)

assert.match(contracts, /\[ROLE_CONTRACT_KEYS\.agencyOwner\][\s\S]*?\.\.\.PROFESSIONAL_OWNER/)
assert.match(workspaceService, /if \(workspaceType === WORKSPACE_TYPES\.agency\) return ORG_ROLES\.owner/)
assert.match(workspaceService, /client\.rpc\('bridge_complete_workspace_onboarding_v3'/)
assert.match(settingsApi, /workspace_role: 'owner'/)
assert.match(settingsApi, /: 'bridge_complete_workspace_onboarding_v3'/)

console.log('onboarding primary-owner source phase 3: passed')
