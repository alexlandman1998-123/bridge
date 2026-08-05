import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/202608050003_commission_structures_rule_engine.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /create table if not exists public\.organisation_commission_structures/)
assert.match(migration, /create table if not exists public\.organisation_user_commission_profiles/)
assert.match(migration, /alter table if exists public\.transaction_commissions[\s\S]*commission_structure_id/)
assert.match(migration, /create or replace view public\.commission_structure_validation_v1/)
assert.match(migration, /create or replace function public\.bridge_validate_commission_structure/)
assert.match(migration, /pool_percentage_exceeded/)
assert.match(migration, /create or replace function public\.bridge_activate_commission_structure/)
assert.match(migration, /create or replace function public\.bridge_enforce_commission_structure_activation/)
assert.match(migration, /create trigger trg_commission_structures_activation_guard/)
assert.match(migration, /create or replace function public\.bridge_sync_legacy_commission_structure/)
assert.match(migration, /phase_3_legacy_structure_sync/)
assert.match(migration, /create trigger trg_legacy_commission_structure_canonical_sync/)
assert.match(migration, /create or replace function public\.bridge_resolve_commission_structure/)
assert.match(migration, /profile\.commission_structure_id/)
assert.match(migration, /pg_trigger_depth\(\) = 0[\s\S]*not public\.bridge_is_active_member\(p_organisation_id\)/)
assert.match(migration, /create or replace function public\.bridge_apply_commission_structure_to_transaction/)
assert.match(migration, /phase_3_commission_structure_apply/)
assert.match(migration, /pg_trigger_depth\(\) = 0[\s\S]*not public\.bridge_is_org_admin\(tx_row\.organisation_id\)/)
assert.match(migration, /create trigger trg_transaction_commissions_apply_structure/)
assert.match(migration, /create or replace view public\.transaction_commission_structure_allocations_v1/)
assert.match(migration, /allocation_type not in \('internal_referral', 'external_referral'\)/)
assert.match(migration, /grant execute on function public\.bridge_apply_commission_structure_to_transaction/)

console.log('Commission structures rule engine migration contract passed.')
