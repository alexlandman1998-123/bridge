import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/202607140018_legacy_demo_rls_scoped_replacement.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /bridge_has_legacy_firm_membership/, 'legacy firm recursion-safe helper is required')
assert.match(migration, /policy document_request_groups_select_scoped/i)
assert.match(migration, /policy document_requirements_select_scoped/i)
assert.match(migration, /policy firm_memberships_select_scoped/i)
assert.match(migration, /policy transaction_issue_overrides_select_scoped/i)
assert.match(migration, /bridge_can_view_internal_transaction_content\(transaction_id\)/)
assert.match(migration, /bridge_has_request_transaction_token_access\(transaction_id\)/)
assert.match(migration, /policyname like '%!_demo!_all'/)
assert.match(migration, /Allow all write documents/)
assert.doesNotMatch(migration, /revoke\s+all\s+privileges\s+on\s+table/i)
assert.doesNotMatch(migration, /grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete[^;]+\bto\s+anon/i)

console.log('legacy demo RLS hardening contract passed')
