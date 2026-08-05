import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/202608050001_commission_allocation_canonical_model.sql', import.meta.url),
  'utf8',
)

for (const table of [
  'commission_structures',
  'commission_structure_rules',
  'transaction_referral_links',
  'transaction_commission_allocations',
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`))
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
}

assert.match(migration, /create or replace view public\.commission_structure_rule_pool_totals/)
assert.match(migration, /create or replace view public\.referral_commission_allocation_mapping_v1/)
assert.match(migration, /create or replace function public\.bridge_create_default_commission_structure/)
assert.match(migration, /'listing_commission'[\s\S]*'selling_commission'[\s\S]*'internal_referral'[\s\S]*'external_referral'/)
assert.match(migration, /recipient_scope = 'external_arch9'[\s\S]*then 'partner'/)
assert.match(migration, /'projected'[\s\S]*'pending_approval'[\s\S]*'approved'[\s\S]*'due'[\s\S]*'paid'[\s\S]*'waived'[\s\S]*'disputed'/)
assert.match(migration, /references public\.lead_referrals\(id\)/)
assert.match(migration, /references public\.transactions\(id\)/)
assert.match(migration, /commission_structure_rules_percentage_check/)
assert.match(migration, /transaction_commission_allocations_percentage_check/)
assert.match(migration, /commission_structures_default_active_idx/)
assert.match(migration, /transaction_referral_links_unique_active_idx/)
assert.match(migration, /transaction_commission_allocations_admin_write/)

console.log('Commission canonical model migration contract passed.')
