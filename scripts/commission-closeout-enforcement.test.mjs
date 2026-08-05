import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/202608050007_commission_closeout_enforcement.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /create table if not exists public\.commission_closeout_events/)
assert.match(migration, /blocked[\s\S]*closed_out[\s\S]*override_closed_out/)
assert.match(migration, /create or replace function public\.bridge_is_transaction_closeout_state/)
assert.match(migration, /registered[\s\S]*post_registration[\s\S]*completed[\s\S]*settled/)
assert.match(migration, /create or replace view public\.transaction_commission_closeout_readiness_v1/)
assert.match(migration, /active_allocation_count/)
assert.match(migration, /unresolved_allocation_count/)
assert.match(migration, /status not in \('paid', 'waived', 'cancelled'\)/)
assert.match(migration, /closeout_ready/)
assert.match(migration, /create or replace function public\.bridge_validate_transaction_commission_closeout/)
assert.match(migration, /commission_allocations_missing/)
assert.match(migration, /commission_closeout_blocked/)
assert.match(migration, /commission_closeout_override_allowed/)
assert.match(migration, /public\.bridge_is_org_admin\(tx_row\.organisation_id\)/)
assert.match(migration, /create or replace function public\.bridge_enforce_transaction_commission_closeout/)
assert.match(migration, /raise exception 'Transaction cannot be closed out until canonical commission allocations exist\.'/)
assert.match(migration, /raise exception 'Transaction cannot be closed out while commission allocations remain unresolved\.'/)
assert.match(migration, /drop trigger if exists trg_transactions_commission_closeout_enforcement/)
assert.match(migration, /before update of stage, current_main_stage, lifecycle_state on public\.transactions/)
assert.match(migration, /create or replace function public\.bridge_closeout_transaction_with_commission_check/)
assert.match(migration, /invalid_closeout_state/)
assert.match(migration, /override_reason_required/)
assert.match(migration, /set_config\('bridge\.commission_closeout_override_transaction_id'/)
assert.match(migration, /insert into public\.commission_closeout_events/)
assert.match(migration, /alter table public\.commission_closeout_events enable row level security/)
assert.match(migration, /commission_closeout_events_member_select/)
assert.match(migration, /grant execute on function public\.bridge_closeout_transaction_with_commission_check/)

console.log('Commission closeout enforcement migration contract passed.')
