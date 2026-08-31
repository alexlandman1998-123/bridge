import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/20260831153322_staging_rls_warning_view_hardening.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /relation\.relkind = 'v'/)
assert.match(migration, /alter view %I\.%I set \(security_invoker = true\)/)
assert.match(migration, /revoke select on %I\.%I from public, anon/)
assert.match(migration, /grant select on %I\.%I to authenticated/)
assert.match(migration, /grant select on %I\.%I to service_role/)
assert.match(migration, /revoke select on %I\.%I from authenticated/)
assert.match(migration, /has_table_privilege\('anon', relation\.oid, 'select'\)/)
assert.match(migration, /has_table_privilege\('authenticated', relation\.oid, 'select'\)/)
assert.doesNotMatch(migration, /security\s+definer/i)
assert.doesNotMatch(migration, /grant\s+all/i)

console.log('staging RLS warning view hardening test passed')
