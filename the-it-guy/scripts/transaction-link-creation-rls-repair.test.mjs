import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../../supabase/migrations/202608130012_transaction_link_creation_rls_repair.sql', import.meta.url),
  'utf8',
)

assert.match(
  migration,
  /create policy transaction_status_links_insert_transaction_spine_scope[\s\S]+with check \([\s\S]+bridge_can_access_transaction_spine\(transaction_id\)/,
  'status link inserts should be scoped to transaction spine access.',
)
assert.match(
  migration,
  /create policy transaction_status_links_update_transaction_spine_scope[\s\S]+using \(public\.bridge_can_access_transaction_spine\(transaction_id\)\)[\s\S]+with check \(public\.bridge_can_access_transaction_spine\(transaction_id\)\)/,
  'status link updates should stay inside transaction spine access.',
)
assert.match(
  migration,
  /create policy transaction_onboarding_insert_transaction_spine_scope[\s\S]+with check \([\s\S]+bridge_can_access_transaction_spine\(transaction_id\)/,
  'buyer onboarding link inserts should be scoped to transaction spine access.',
)
assert.match(
  migration,
  /create policy transaction_onboarding_update_transaction_spine_scope[\s\S]+using \(public\.bridge_can_access_transaction_spine\(transaction_id\)\)[\s\S]+with check \(public\.bridge_can_access_transaction_spine\(transaction_id\)\)/,
  'buyer onboarding updates should stay inside transaction spine access.',
)
assert.match(
  migration,
  /grant insert, update on public\.transaction_status_links to authenticated;/,
  'authenticated users need table privileges to create status links.',
)
assert.match(
  migration,
  /grant insert, update on public\.transaction_onboarding to authenticated;/,
  'authenticated users need table privileges to create buyer onboarding links.',
)

console.log('transaction link creation RLS repair tests passed')
