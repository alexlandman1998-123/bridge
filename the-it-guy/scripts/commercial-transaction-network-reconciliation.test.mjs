import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/202607140023_phase6_commercial_transaction_security_reconciliation.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /created_by = auth\.uid\(\)[\s\S]*bridge_is_org_admin\(sender_organisation_id\)/i)
assert.match(migration, /coalesce\(status, 'pending'\) <> 'accepted'/i)
assert.match(migration, /bridge_can_operate_canonical_invites[\s\S]*bridge_is_platform_admin\(\)/i)
assert.doesNotMatch(migration, /create or replace function public\.bridge_membership_role/i)
assert.doesNotMatch(migration, /create or replace function public\.bridge_is_org_admin/i)
assert.match(migration, /revoke all on function public\.bridge_activate_partner_portal_onboarding\(text, jsonb\) from public, anon, authenticated, service_role/i)
assert.match(migration, /grant execute on function public\.bridge_activate_partner_portal_onboarding\(text, jsonb\) to authenticated/i)
assert.doesNotMatch(migration, /grant execute on function public\.bridge_activate_partner_portal_onboarding\(text, jsonb\) to anon/i)
assert.match(migration, /revoke all on table public\.transaction_partner_assignments from public, anon/i)
assert.match(migration, /grant select, insert, update, delete on table public\.transaction_partner_assignments to authenticated/i)
assert.match(migration, /bridge_repair_partner_invitation_acceptance\(uuid\)[\s\S]*to service_role/i)

console.log('Commercial and transaction network reconciliation checks passed.')
