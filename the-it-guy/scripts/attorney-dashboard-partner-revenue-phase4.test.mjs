import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(new URL('../../supabase/migrations/20260926110347_attorney_dashboard_partner_revenue_phase4.sql', import.meta.url), 'utf8')
const dashboardService = readFileSync(new URL('../src/services/attorneyDashboard.js', import.meta.url), 'utf8')
const dashboardPage = readFileSync(new URL('../src/pages/AttorneyDashboardPage.jsx', import.meta.url), 'utf8')
const partnerRevenueService = readFileSync(new URL('../src/services/attorneyDashboardPartnerRevenue.js', import.meta.url), 'utf8')
const mattersPage = readFileSync(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8')

const db = new PGlite()
await db.exec(`
create role anon;
create role authenticated;
create schema auth;
create table auth.test_actor(id uuid primary key);
insert into auth.test_actor values ('00000000-0000-4000-8000-000000000001');
create function auth.uid() returns uuid language sql stable as $$ select id from auth.test_actor limit 1 $$;

create table public.organisations(id uuid primary key,name text,display_name text,type text,logo_url text);
create table public.attorney_firms(id uuid primary key,organisation_id uuid);
create table public.attorney_firm_members(firm_id uuid,user_id uuid,status text,role text);
create table public.transactions(
  id uuid primary key,is_active boolean,lifecycle_state text,stage text,current_main_stage text,next_action text,
  originating_partner_organisation_id uuid,referral_source_organisation_id uuid,
  instructed_at timestamptz,instruction_at timestamptz,instruction_date date
);
create table public.transaction_attorney_assignments(
  transaction_id uuid,attorney_firm_id uuid,firm_id uuid,attorney_role text,assignment_type text,
  assignment_status text,status text,instruction_accepted_at timestamptz,firm_accepted_at timestamptz,assigned_at timestamptz
);
create table public.matter_financial_entries(
  transaction_id uuid,entry_status text,entry_type text,amount numeric,metadata_json jsonb default '{}'
);
create table public.attorney_lead_conversions(
  attorney_firm_id uuid,transaction_id uuid,organisation_id uuid,lead_id uuid,conversion_status text
);
create table public.attorney_lead_quotes(
  organisation_id uuid,lead_id uuid,status text,professional_fee numeric
);
create table public.transaction_refresh_signals(
  transaction_id uuid primary key,version bigint not null default 0,command_receipt_id uuid,
  canonical_event_id uuid,changed_at timestamptz
);
`)
await db.exec(migration)

const actor = '00000000-0000-4000-8000-000000000001'
const firm = '10000000-0000-4000-8000-000000000001'
const firmOrg = '11000000-0000-4000-8000-000000000001'
const partnerOne = '12000000-0000-4000-8000-000000000001'
const partnerTwo = '12000000-0000-4000-8000-000000000002'
const matters = Array.from({ length: 4 }, (_, index) => `20000000-0000-4000-8000-00000000000${index + 1}`)

await db.query(`insert into public.organisations values
  ($1,'Firm Org','Firm Org','attorney_firm',null),
  ($2,'Alpha Realty','Alpha Realty','agency',null),
  ($3,'Beta Developers','Beta Developers','developer',null)`, [firmOrg, partnerOne, partnerTwo])
await db.query(`insert into public.attorney_firms values($1,$2)`, [firm, firmOrg])
await db.query(`insert into public.attorney_firm_members values($1,$2,'active','firm_admin')`, [firm, actor])

for (const [index, transactionId] of matters.entries()) {
  const partnerId = index < 2 ? partnerOne : index === 2 ? partnerTwo : null
  const acceptedAt = index === 1 ? '2026-08-15T10:00:00+02:00' : '2026-09-10T10:00:00+02:00'
  await db.query(`insert into public.transactions values($1,true,'active','active','active','',$2,null,null,null,null)`, [transactionId, partnerId])
  await db.query(`insert into public.transaction_attorney_assignments values($1,$2,$2,'transfer_attorney','transfer','active','active',$3,null,$3)`, [transactionId, firm, acceptedAt])
}

await db.query(`insert into public.attorney_lead_quotes values($1,$2,'accepted',10000),($1,$3,'accepted',15000),($1,$4,'accepted',5000)`, [firmOrg, '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004'])
await db.query(`insert into public.attorney_lead_conversions values
  ($1,$2,$3,$4,'completed'),($1,$5,$3,$6,'completed'),($1,$7,$3,$8,'completed')`, [
  firm, matters[0], firmOrg, '30000000-0000-4000-8000-000000000001',
  matters[1], '30000000-0000-4000-8000-000000000002',
  matters[3], '30000000-0000-4000-8000-000000000004',
])
await db.query(`insert into public.matter_financial_entries values($1,'posted','charge',20000,'{"feeCategory":"professional_fee"}')`, [matters[1]])

const result = await db.query(`select public.get_attorney_dashboard_partner_revenue_snapshot($1,'all') as snapshot`, [firm])
const snapshot = result.rows[0].snapshot
assert.equal(snapshot.sourceStatus, 'available')
assert.equal(Number(snapshot.revenuePipeline.amount), 35000, 'property value and quote totals must not inflate professional fees')
assert.equal(Number(snapshot.revenuePipeline.pricedMatterCount), 3)
assert.equal(Number(snapshot.revenuePipeline.unpricedMatterCount), 1)
assert.equal(Number(snapshot.revenuePipeline.postedEntryMatterCount), 1)
assert.equal(Number(snapshot.revenuePipeline.acceptedQuoteMatterCount), 2)
assert.equal(snapshot.revenuePipeline.matterIds.length, 3)

assert.equal(snapshot.partners.length, 2)
const alpha = snapshot.partners.find((row) => row.partnerId === partnerOne)
const beta = snapshot.partners.find((row) => row.partnerId === partnerTwo)
assert.equal(Number(alpha.activeMatters), 2)
assert.equal(Number(alpha.newThisMonth), 1)
assert.equal(Number(alpha.revenuePipeline), 30000)
assert.equal(Number(beta.activeMatters), 1)
assert.equal(Number(beta.revenuePipeline), 0)
assert.equal(snapshot.partners.some((row) => row.partnerId === firmOrg), false, 'the attorney firm must not be its own referring partner')

const refreshSignals = await db.query(`select transaction_id,version from public.transaction_refresh_signals`)
assert.ok(refreshSignals.rows.length >= 4)
assert.ok(refreshSignals.rows.every(({ version }) => Number(version) >= 1))

assert.match(dashboardService, /get_attorney_dashboard_partner_revenue_snapshot/)
assert.doesNotMatch(dashboardService, /helper: 'Transfer value'/)
assert.match(dashboardPage, /Professional fees/)
assert.match(partnerRevenueService, /get_attorney_dashboard_partner_revenue_snapshot/)
assert.match(mattersPage, /metricKey = attentionSnapshotKey \|\| \(hasRevenueDrilldown \? 'revenue_pipeline'/)

console.log('Attorney dashboard partner and professional-fee revenue Phase 4 passed.')
