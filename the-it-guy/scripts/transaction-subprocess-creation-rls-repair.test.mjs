import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../../supabase/migrations/202608130007_transaction_subprocess_creation_rls_repair.sql', import.meta.url),
  'utf8',
)

assert.match(
  migration,
  /create policy transaction_subprocesses_insert_transaction_spine_scope[\s\S]+with check \([\s\S]+bridge_can_access_transaction_spine\(transaction_id\)/,
  'subprocess shell inserts should be scoped to the transaction spine.',
)
assert.match(
  migration,
  /create policy transaction_subprocess_steps_insert_transaction_spine_scope[\s\S]+from public\.transaction_subprocesses lane[\s\S]+bridge_can_access_transaction_spine\(lane\.transaction_id\)/,
  'subprocess step inserts should inherit scope from the parent subprocess lane.',
)
assert.match(
  migration,
  /grant select, insert, update on public\.transaction_subprocesses to authenticated;/,
  'authenticated users need table privileges for subprocess shell bootstrapping.',
)
assert.match(
  migration,
  /grant select, insert, update on public\.transaction_subprocess_steps to authenticated;/,
  'authenticated users need table privileges for subprocess step bootstrapping.',
)

const apiSource = readFileSync(new URL('../src/lib/api.js', import.meta.url), 'utf8')
assert.match(
  apiSource,
  /message\.includes\('row-level security'\)/,
  'api permission classification should recognize row-level security message text.',
)
assert.match(
  apiSource,
  /details\.includes\('row-level security'\)/,
  'api permission classification should recognize row-level security detail text.',
)

console.log('transaction subprocess creation RLS repair tests passed')
