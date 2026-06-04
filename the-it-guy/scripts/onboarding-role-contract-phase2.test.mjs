import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const migration = readFileSync(
  resolve(root, 'supabase/migrations/202606040001_onboarding_role_contract_phase2.sql'),
  'utf8',
)
const signupIntentSource = readFileSync(
  resolve(root, 'the-it-guy/src/lib/signupIntent.js'),
  'utf8',
)

function assertIncludes(source, token, label = token) {
  assert(source.includes(token), `Expected ${label}`)
}

assertIncludes(migration, 'add column if not exists system_role text', 'signup_intents system_role column')
assertIncludes(migration, 'add column if not exists workspace_kind text', 'signup_intents workspace_kind column')
assertIncludes(migration, 'add column if not exists role_contract_key text', 'signup_intents role_contract_key column')
assertIncludes(migration, 'rename to bridge_complete_workspace_onboarding_legacy_20260524', 'legacy onboarding RPC rename')
assertIncludes(migration, 'create or replace function public.bridge_complete_workspace_onboarding(payload jsonb)', 'phase 2 onboarding wrapper')
assertIncludes(migration, 'bridge_complete_workspace_onboarding_legacy_20260524(v_legacy_payload)', 'wrapper delegates to legacy RPC')
assertIncludes(migration, "'personal_originator'", 'personal originator workspace kind support')
assertIncludes(migration, "'bond_company'", 'bond company workspace kind support')
assertIncludes(migration, 'role_contract', 'role contract payload support')
assertIncludes(migration, 'scope_level = v_scope_level', 'membership scope level persistence')
assertIncludes(migration, 'scope_metadata = coalesce(scope_metadata', 'membership scope metadata persistence')
assertIncludes(migration, 'active_workspace_selected_at = v_now', 'active workspace selected timestamp persistence')
assertIncludes(migration, 'system_role = v_system_role', 'profile system role persistence')
assertIncludes(migration, 'workspace_kind = v_workspace_kind', 'organisation workspace kind persistence')
assertIncludes(migration, 'rename to bridge_repair_workspace_onboarding_legacy_20260524', 'legacy repair RPC rename')
assertIncludes(migration, 'create or replace function public.bridge_repair_workspace_onboarding', 'phase 2 repair wrapper')

assertIncludes(signupIntentSource, 'system_role: normalized.system_role', 'signup intent persists system role')
assertIncludes(signupIntentSource, 'workspace_kind: normalized.workspace_kind', 'signup intent persists workspace kind')
assertIncludes(signupIntentSource, 'role_contract_key: normalized.role_contract_key', 'signup intent persists role contract key')
assertIncludes(signupIntentSource, 'LEGACY_SIGNUP_INTENT_SELECT', 'signup intent legacy fallback select')
assertIncludes(signupIntentSource, 'isMissingSignupIntentContractColumn', 'signup intent missing-column fallback')

console.log('onboarding role contract phase 2 tests passed')

