import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/202608050002_internal_referral_accounting.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /create unique index if not exists transaction_commission_allocations_internal_referral_unique_idx/)
assert.match(migration, /lead_referrals_internal_same_org_check[\s\S]*not valid/)
assert.match(migration, /where source_referral_id is not null[\s\S]*allocation_type = 'internal_referral'/)
assert.match(migration, /create or replace function public\.bridge_sync_internal_referral_accounting/)
assert.match(migration, /referral_row\.recipient_scope <> 'internal'/)
assert.match(migration, /internal_org_mismatch/)
assert.match(migration, /transaction_org_mismatch/)
assert.match(migration, /insert into public\.transaction_referral_links[\s\S]*'internal_referral'/)
assert.match(migration, /insert into public\.transaction_commission_allocations[\s\S]*'internal_referral'[\s\S]*'referring_agent'/)
assert.match(migration, /update public\.transaction_commission_allocations[\s\S]*calculated_amount = v_calculated_amount/)
assert.match(migration, /create trigger trg_lead_referrals_internal_accounting/)
assert.match(migration, /create trigger trg_transaction_commissions_internal_accounting/)
assert.match(migration, /create or replace view public\.internal_referral_commission_accounting_v1/)
assert.match(migration, /grant execute on function public\.bridge_sync_internal_referral_accounting/)
assert.match(migration, /grant select on public\.internal_referral_commission_accounting_v1/)

console.log('Internal referral accounting migration contract passed.')
