import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/202608050005_external_partner_referrals.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /transaction_commission_allocations_external_referral_unique_idx/)
assert.match(migration, /create or replace function public\.bridge_has_accepted_partner_relationship/)
assert.match(migration, /from public\.organisation_partners relationship/)
assert.match(migration, /from public\.partner_connections connection/)
assert.match(migration, /create or replace function public\.bridge_enforce_external_partner_referral/)
assert.match(migration, /External Arch9 referrals can only be accepted or converted between connected partner organisations/)
assert.match(migration, /create trigger trg_lead_referrals_external_partner_guard/)
assert.match(migration, /create or replace function public\.bridge_sync_external_partner_referral_accounting/)
assert.match(migration, /referral_row\.recipient_scope <> 'external_arch9'/)
assert.match(migration, /tx_row\.organisation_id <> referral_row\.target_organisation_id/)
assert.match(migration, /allocation_type = 'external_referral'/)
assert.match(migration, /participant_role = 'external_partner'/)
assert.match(migration, /scope = 'partner'/)
assert.match(migration, /requires_approval[\s\S]*true/)
assert.match(migration, /insert into public\.transaction_referral_links/)
assert.match(migration, /create trigger trg_lead_referrals_external_partner_accounting/)
assert.match(migration, /pg_trigger_depth\(\) > 1[\s\S]*return new/)
assert.match(migration, /create trigger trg_transaction_commissions_external_partner_accounting/)
assert.match(migration, /create trigger trg_transactions_external_partner_referral_accounting/)
assert.match(migration, /referral\.target_organisation_id = new\.organisation_id/)
assert.match(migration, /create or replace view public\.external_partner_referral_commission_accounting_v1/)
assert.match(migration, /grant execute on function public\.bridge_sync_external_partner_referral_accounting/)

console.log('External partner referrals migration contract passed.')
