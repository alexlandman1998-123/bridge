import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/202608050006_commission_review_approval.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /create table if not exists public\.commission_allocation_review_events/)
assert.match(migration, /submitted_for_review[\s\S]*approved[\s\S]*marked_due[\s\S]*marked_paid[\s\S]*waived[\s\S]*disputed[\s\S]*reopened/)
assert.match(migration, /transaction_commission_allocations_review_queue_idx/)
assert.match(migration, /create or replace function public\.bridge_sync_commission_allocation_review_sources/)
assert.match(migration, /update public\.lead_referrals[\s\S]*commission_status = coalesce\(v_referral_status, commission_status\)/)
assert.match(migration, /update public\.transaction_commissions commission[\s\S]*then 'disputed'[\s\S]*then 'paid'[\s\S]*then 'due'[\s\S]*then 'approved'/)
assert.match(migration, /create or replace function public\.bridge_review_commission_allocation/)
assert.match(migration, /public\.bridge_is_org_admin\(allocation_row\.organisation_id\)/)
assert.match(migration, /v_action not in \('dispute'\)/)
assert.match(migration, /reason_required/)
assert.match(migration, /amount_required/)
assert.match(migration, /allocation_cancelled/)
assert.match(migration, /allocation_locked/)
assert.match(migration, /insert into public\.commission_allocation_review_events/)
assert.match(migration, /perform public\.bridge_sync_commission_allocation_review_sources/)
assert.match(migration, /create or replace view public\.commission_allocation_review_queue_v1/)
assert.match(migration, /create or replace view public\.commission_allocation_review_summary_v1/)
assert.match(migration, /alter table public\.commission_allocation_review_events enable row level security/)
assert.match(migration, /commission_allocation_review_events_member_select/)
assert.match(migration, /grant execute on function public\.bridge_review_commission_allocation/)

console.log('Commission review approval migration contract passed.')
