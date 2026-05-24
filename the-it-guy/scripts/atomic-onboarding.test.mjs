import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const migrationPath = resolve(root, 'supabase/migrations/202605240010_atomic_workspace_onboarding.sql')
const auditColumnsMigrationPath = resolve(root, 'supabase/migrations/202605240014_organisation_users_onboarding_audit_columns.sql')
const settingsApiPath = resolve(root, 'the-it-guy/src/lib/settingsApi.js')
const workspaceServicePath = resolve(root, 'the-it-guy/src/services/workspaceService.js')

const migration = readFileSync(migrationPath, 'utf8')
const auditColumnsMigration = readFileSync(auditColumnsMigrationPath, 'utf8')
const settingsApi = readFileSync(settingsApiPath, 'utf8')
const workspaceService = readFileSync(workspaceServicePath, 'utf8')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertIncludes(source, token, label = token) {
  assert(source.includes(token), `Expected ${label}`)
}

const requiredTables = [
  'public.organisations',
  'public.organisation_branches',
  'public.organisation_users',
  'public.organisation_settings',
  'public.onboarding_states',
  'public.onboarding_events',
  'public.user_workspace_preferences',
  'public.profiles',
  'public.workspace_invites',
  'public.workspace_onboarding_completions',
]

assertIncludes(migration, 'bridge_complete_workspace_onboarding(payload jsonb)', 'atomic completion RPC')
assertIncludes(migration, 'security definer', 'security definer RPC')
assertIncludes(migration, 'exception', 'structured exception handling')
assertIncludes(migration, 'workspace_onboarding_completions_user_key_idx', 'idempotency unique index')
assertIncludes(migration, 'workspace_onboarding_completed', 'completion onboarding event')
assertIncludes(migration, 'bridge_repair_workspace_onboarding', 'legacy repair RPC')
assertIncludes(migration, 'v_resume_duplicate_workspace', 'same-user duplicate workspace resume path')
assertIncludes(migration, 'resumed_duplicate_workspace', 'duplicate resume result marker')
assertIncludes(migration, 'recoverable', 'unrelated duplicate remains a structured non-recoverable error')
assertIncludes(migration, "workspace_role = excluded.workspace_role", 'canonical workspace role write')
assertIncludes(migration, 'is_primary_owner = true', 'primary owner membership flag')
assertIncludes(migration, 'invited_by_user_id uuid', 'organisation_users invite audit column bootstrap')
assertIncludes(migration, 'permissions_json jsonb', 'organisation_users permissions json bootstrap')
assertIncludes(migration, 'is_default', 'real default branch flag')
assertIncludes(migration, "onboarding_completed = true", 'profile completion flag')
assertIncludes(auditColumnsMigration, 'invited_by_user_id uuid', 'forward migration for existing databases')
assertIncludes(auditColumnsMigration, 'last_active_at timestamptz', 'last active audit forward migration')
assertIncludes(auditColumnsMigration, 'permissions_json jsonb', 'permissions json forward migration')

for (const table of requiredTables) {
  assertIncludes(migration, table, `write or reference to ${table}`)
}

const structuredErrorCodes = [
  'missing_profile',
  'invalid_signup_intent',
  'intent_already_consumed',
  'invalid_workspace_type',
  'duplicate_organisation_detected',
  'membership_conflict',
  'branch_creation_failed',
  'settings_creation_failed',
  'onboarding_state_failed',
  'permission_denied',
]

for (const code of structuredErrorCodes) {
  assertIncludes(migration, code, `structured error code ${code}`)
}

const completionFunctionMatch = settingsApi.match(/export async function completeAgencyOnboarding[\s\S]*?\n}\n\nexport async function updateOrganisationSettings/)
assert(completionFunctionMatch, 'Expected completeAgencyOnboarding function in settingsApi.js')
const completionFunction = completionFunctionMatch[0]

assertIncludes(completionFunction, "client.rpc('bridge_complete_workspace_onboarding'", 'client completion calls RPC')
assertIncludes(completionFunction, 'resolveCurrentWorkspace(user.id', 'post-completion workspace resolution')
assert(!completionFunction.includes(".from('organisations')"), 'completeAgencyOnboarding must not write organisations client-side')
assert(!completionFunction.includes(".from('organisation_users')"), 'completeAgencyOnboarding must not write memberships client-side')
assert(!completionFunction.includes(".from('organisation_settings')"), 'completeAgencyOnboarding must not write settings client-side')
assert(!completionFunction.includes('completeOnboarding({'), 'completeAgencyOnboarding must not mark onboarding complete client-side')

assertIncludes(settingsApi, 'buildAtomicAgencyOnboardingPayload', 'atomic payload builder')
assertIncludes(workspaceService, "client.rpc('bridge_repair_workspace_onboarding'", 'workspace repair calls repair RPC')
assertIncludes(workspaceService, 'resolveCurrentWorkspace(userId', 'repair verifies workspace resolution')
assertIncludes(workspaceService, 'buildAtomicWorkspaceOnboardingPayload', 'generic atomic workspace payload builder')
assertIncludes(workspaceService, "client.rpc('bridge_complete_workspace_onboarding'", 'generic organisation setup calls atomic RPC')

const createOrganisationMatch = workspaceService.match(/async function createOrganisationWorkspaceFromIntent[\s\S]*?\n}\n\nexport async function validateWorkspaceCompletion/)
assert(createOrganisationMatch, 'Expected createOrganisationWorkspaceFromIntent in workspaceService.js')
const createOrganisationFunction = createOrganisationMatch[0]
assert(!createOrganisationFunction.includes(".from('organisations')"), 'createOrganisationWorkspaceFromIntent must not insert organisations client-side')
assert(!createOrganisationFunction.includes('createMembership('), 'createOrganisationWorkspaceFromIntent must not create memberships client-side')
assert(!createOrganisationFunction.includes('createDefaultBranchOrTeam('), 'createOrganisationWorkspaceFromIntent must not create branches client-side')
assert(!createOrganisationFunction.includes('upsertOrganisationSettings('), 'createOrganisationWorkspaceFromIntent must not create settings client-side')

console.log('atomic onboarding contract tests passed')
