import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/202608050004_transaction_conversion_commission_hook.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /create or replace function public\.bridge_apply_transaction_conversion_commission_hook/)
assert.match(migration, /public\.bridge_resolve_commission_structure/)
assert.match(migration, /insert into public\.transaction_commissions/)
assert.match(migration, /commission_structure_name_snapshot/)
assert.match(migration, /public\.bridge_apply_commission_structure_to_transaction/)
assert.match(migration, /from public\.lead_referrals referral/)
assert.match(migration, /referral\.source_lead_id in \(tx_row\.originating_lead_id, tx_row\.originating_buyer_lead_id\)/)
assert.match(migration, /referral\.referral_type = 'listing_collaboration'/)
assert.match(migration, /insert into public\.transaction_referral_links/)
assert.match(migration, /public\.bridge_sync_internal_referral_accounting/)
assert.match(migration, /create trigger trg_transactions_conversion_commission_hook/)
assert.match(migration, /after insert or update of[\s\S]*originating_buyer_lead_id[\s\S]*gross_commission_amount[\s\S]*on public\.transactions/)
assert.match(migration, /create or replace view public\.transaction_conversion_commission_hook_v1/)
assert.match(migration, /grant execute on function public\.bridge_apply_transaction_conversion_commission_hook/)

console.log('Transaction conversion commission hook migration contract passed.')
