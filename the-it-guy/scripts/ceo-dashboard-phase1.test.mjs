import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../../supabase/migrations/202607150014_ceo_dashboard_phase1.sql', import.meta.url),
  'utf8',
)

assert.match(migration, /^begin;/, 'Phase 1 migration must be transactional')
assert.match(migration, /commit;\s*$/, 'Phase 1 migration must commit explicitly')

for (const field of [
  'assigned_to_user_id',
  'priority',
  'sales_stage',
  'next_action',
  'next_action_at',
  'converted_organisation_id',
  'internal_notes',
]) {
  assert.match(migration, new RegExp(`add column if not exists ${field}\\b`), `Lead workflow should add ${field}`)
}

for (const stage of [
  'new',
  'contacted',
  'qualified',
  'demo_scheduled',
  'proposal',
  'won',
  'lost',
  'spam',
]) {
  assert.match(migration, new RegExp(`'${stage}'`), `Lead workflow should support ${stage}`)
}

assert.match(migration, /create table if not exists public\.platform_revenue_targets/, 'Revenue targets must be canonical data')
assert.match(migration, /revoke insert, update, delete on public\.platform_revenue_targets from authenticated/, 'Revenue targets must not allow unaudited direct writes')
assert.match(migration, /arch9_admin_set_revenue_target_v1/, 'Revenue targets need an audited mutation RPC')

for (const eventTable of [
  'platform_revenue_events',
  'organisation_activity_events',
  'platform_integration_events',
  'platform_activity_events',
]) {
  assert.match(
    migration,
    new RegExp(`create table if not exists public\\.${eventTable}`),
    `Phase 1 should reconcile missing ${eventTable}`,
  )
}

assert.match(migration, /'billing_invoice'/, 'Paid Arch9 billing invoices should create recognised revenue events')
assert.doesNotMatch(
  migration,
  /bridge_sync_transaction_financial_revenue_event|source_type\s*=\s*'transaction_financial_record'/,
  'Matter-level financial records must not be treated as Arch9 platform revenue',
)

assert.match(migration, /platform_revenue_events_source_unique_idx/, 'Revenue synchronisation must be idempotent')
assert.match(migration, /on conflict \(source_type, source_id\)/, 'Revenue synchronisation must upsert by source identity')
assert.match(migration, /status in \('recognised', 'recognized'\)/, 'Dashboard revenue must use recognised events only')
assert.doesNotMatch(migration, /TRANSACTION_FEE_ESTIMATE|expectedRegistrations/, 'Dashboard revenue must not use estimates')

for (const source of [
  'organisation_users',
  'private_listings',
  'commercial_listings',
  'transactions',
  'commercial_transactions',
  'platform_revenue_events',
  'demo_enquiries',
]) {
  assert.match(migration, new RegExp(`public\\.${source}`), `CEO dashboard should read ${source}`)
}

for (const responseKey of [
  'activeAgents',
  'activeListings',
  'activeTransactions',
  'revenueMtd',
  'newBusinessIntake',
  'attention',
  'businessPulse',
  'topOrganisations',
  'warnings',
]) {
  assert.match(migration, new RegExp(`'${responseKey}'`), `Dashboard contract should return ${responseKey}`)
}

assert.match(migration, /limit 12/, 'Lead queue must be bounded')
assert.match(migration, /if not public\.bridge_is_platform_admin\(\)/g, 'CEO RPCs must enforce trusted platform access')
assert.doesNotMatch(migration, /user_metadata/, 'Phase 1 access must not trust user-editable metadata')

for (const rpc of [
  'arch9_admin_ceo_dashboard_v1',
  'arch9_admin_update_demo_enquiry_v1',
  'arch9_admin_set_revenue_target_v1',
]) {
  assert.match(migration, new RegExp(`revoke all on function public\\.${rpc}`), `${rpc} must revoke default execution`)
  assert.match(migration, new RegExp(`grant execute on function public\\.${rpc}`), `${rpc} must grant authenticated execution explicitly`)
}

assert.match(migration, /ceo_lead_updated/, 'Lead mutations must create an audit event')
assert.match(migration, /ceo_revenue_target_updated/, 'Revenue target mutations must create an audit event')
assert.doesNotMatch(migration, /'changedFields', p_patch/, 'Audit events must not copy internal note values into the summary')

console.log('CEO dashboard Phase 1 contract passed')
