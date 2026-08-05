import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/202608050008_commission_reporting.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /create table if not exists public\.commission_report_snapshots/)
assert.match(migration, /commission_finance_snapshot[\s\S]*commission_export[\s\S]*commission_closeout_snapshot/)
assert.match(migration, /transaction_commission_allocations_reporting_period_idx/)
assert.match(migration, /transaction_commission_allocations_reporting_participant_idx/)
assert.match(migration, /create or replace view public\.commission_allocation_reporting_base_v1/)
assert.match(migration, /reporting_bucket/)
assert.match(migration, /aging_bucket/)
assert.match(migration, /payable_due[\s\S]*approved_unpaid[\s\S]*needs_review/)
assert.match(migration, /create or replace view public\.commission_finance_summary_v1/)
assert.match(migration, /pending_review_count[\s\S]*approved_unpaid_count[\s\S]*due_count[\s\S]*disputed_count/)
assert.match(migration, /create or replace view public\.commission_participant_earnings_v1/)
assert.match(migration, /listing_allocation_count[\s\S]*selling_allocation_count[\s\S]*referral_allocation_count/)
assert.match(migration, /create or replace view public\.commission_referral_reporting_v1/)
assert.match(migration, /allocation_type in \('internal_referral', 'external_referral'\)/)
assert.match(migration, /create or replace view public\.commission_closeout_reporting_v1/)
assert.match(migration, /public\.transaction_commission_closeout_readiness_v1/)
assert.match(migration, /latest_closeout_action/)
assert.match(migration, /create or replace function public\.bridge_commission_reporting_snapshot/)
assert.match(migration, /invalid_date_range/)
assert.match(migration, /invalid_report_type/)
assert.match(migration, /public\.bridge_is_org_admin\(p_organisation_id\)/)
assert.match(migration, /status_totals/)
assert.match(migration, /allocation_type_totals/)
assert.match(migration, /aging_totals/)
assert.match(migration, /insert into public\.commission_report_snapshots/)
assert.match(migration, /commission_reporting_snapshot_created/)
assert.match(migration, /alter table public\.commission_report_snapshots enable row level security/)
assert.match(migration, /commission_report_snapshots_member_select/)
assert.match(migration, /grant select on public\.commission_allocation_reporting_base_v1/)
assert.match(migration, /grant execute on function public\.bridge_commission_reporting_snapshot/)

console.log('Commission reporting migration contract passed.')
