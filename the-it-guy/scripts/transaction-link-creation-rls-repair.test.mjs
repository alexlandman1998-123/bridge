import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../../supabase/migrations/202608130012_transaction_link_creation_rls_repair.sql', import.meta.url),
  'utf8',
)
const followupMigration = readFileSync(
  new URL('../../supabase/migrations/202608140006_transaction_link_portal_rls_followup.sql', import.meta.url),
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

assert.match(
  followupMigration,
  /create or replace function public\.bridge_can_access_transaction_org_member\(target_transaction_id uuid\)[\s\S]+public\.bridge_is_active_member\(tx\.organisation_id\)/,
  'developer and agent portal writes should be allowed for active members of the transaction organisation.',
)
assert.match(
  followupMigration,
  /create or replace function public\.bridge_has_status_token_transaction_access\(target_transaction_id uuid\)[\s\S]+from public\.transaction_status_links link[\s\S]+link\.token = public\.bridge_status_request_token\(\)/,
  'status-token access should resolve the linked transaction through active status links.',
)
assert.match(
  followupMigration,
  /create policy transactions_select_status_token_scope[\s\S]+to anon, authenticated[\s\S]+bridge_has_status_token_transaction_access\(id\)/,
  'status-token clients should be able to read only the linked transaction row.',
)
assert.match(
  followupMigration,
  /create policy transaction_status_links_select_token_scope[\s\S]+to anon, authenticated[\s\S]+token = public\.bridge_status_request_token\(\)/,
  'status link token reads should stay constrained to the exact request token.',
)
assert.match(
  followupMigration,
  /create policy transaction_status_links_select_portal_scope[\s\S]+to authenticated[\s\S]+bridge_can_access_transaction_spine\(transaction_id\)[\s\S]+bridge_can_access_transaction_org_member\(transaction_id\)/,
  'status link portal reads should support scoped authenticated portal access.',
)
assert.match(
  followupMigration,
  /create policy transaction_status_links_insert_transaction_spine_scope[\s\S]+with check \([\s\S]+bridge_can_access_transaction_spine\(transaction_id\)[\s\S]+or public\.bridge_can_access_transaction_org_member\(transaction_id\)/,
  'status link inserts should include the active organisation-member bootstrap path.',
)
assert.match(
  followupMigration,
  /create policy transaction_onboarding_select_token_scope[\s\S]+to anon, authenticated[\s\S]+token = public\.bridge_onboarding_request_token\(\)/,
  'onboarding token reads should stay constrained to the exact request token.',
)
assert.match(
  followupMigration,
  /create policy transaction_onboarding_select_portal_scope[\s\S]+to authenticated[\s\S]+bridge_can_access_transaction_spine\(transaction_id\)[\s\S]+bridge_can_access_transaction_org_member\(transaction_id\)/,
  'onboarding portal reads should support scoped authenticated portal access.',
)
assert.match(
  followupMigration,
  /create policy transaction_onboarding_insert_transaction_spine_scope[\s\S]+with check \([\s\S]+bridge_can_access_transaction_spine\(transaction_id\)[\s\S]+or public\.bridge_can_access_transaction_org_member\(transaction_id\)/,
  'onboarding inserts should include the active organisation-member bootstrap path.',
)
assert.match(followupMigration, /grant execute on function public\.bridge_has_status_token_transaction_access\(uuid\) to anon, authenticated;/)
assert.match(followupMigration, /grant select on public\.transactions to anon, authenticated;/)
assert.doesNotMatch(followupMigration, /with check \(true\)|using \(true\)/i)
assert.doesNotMatch(followupMigration, /for\s+(insert|update)\s+to\s+anon/i)

console.log('transaction link creation RLS repair tests passed')
