import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/20260831150358_modernize_deprecated_rls_policies.sql', import.meta.url),
  'utf8',
)

const executableMigration = migration.replace(/--.*$/gm, '').replace(/'([^']|'')*'/g, "''")
assert.doesNotMatch(executableMigration, /auth\.role\s*\(/i, 'modernized policies must not call deprecated auth.role()')
assert.match(migration, /deprecated_policy_count <> 38/i)
assert.match(migration, /modernized_portal <> 17/i)
assert.match(migration, /modernized_service < 21/i)
assert.match(migration, /to anon, authenticated/gi)
assert.match(migration, /to service_role using \(true\) with check \(true\)/i)
assert.match(migration, /notify pgrst, 'reload schema'/i)

const portalPolicies = [
  'bond_applications_client_portal_read',
  'bond_applications_client_portal_write',
  'bond_application_participants_client_portal_read',
  'bond_application_participants_client_portal_write',
  'bond_application_sections_client_portal_read',
  'bond_application_sections_client_portal_write',
  'bond_application_document_requirements_client_portal_read',
  'bond_application_document_requirements_client_portal_write',
  'bond_application_participant_invites_client_portal_read',
  'bond_application_participant_invites_client_portal_write',
  'bond_application_change_requests_read',
  'bond_application_change_request_items_read',
  'bond_submission_documents_read',
  'transaction_bond_application_submissions_select_client_portal',
  'transaction_bond_application_submissions_insert_client_portal',
  'transaction_bond_application_submissions_update_lifecycle_clien',
  'bond_originator_formal_integrations_authorized_read',
]

for (const policy of portalPolicies) {
  assert.match(migration, new RegExp(`alter policy ${policy}\\b`, 'i'), `migration must modernize ${policy}`)
}

for (const helper of [
  'bridge_has_client_portal_token_transaction_access',
  'bridge_has_bond_application_participant_token_access',
  'bridge_can_access_transaction_spine',
]) {
  assert.match(migration, new RegExp(helper, 'i'), `migration must preserve ${helper}`)
}

assert.doesNotMatch(migration, /drop policy/i, 'ALTER POLICY avoids an access gap during deployment')
assert.doesNotMatch(migration, /create policy/i, 'policy identities and command types must remain unchanged')

console.log('deprecated RLS policy modernization test passed')

