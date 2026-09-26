import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(new URL('../../supabase/migrations/20260926105105_attorney_dashboard_attention_metrics_phase3.sql', import.meta.url), 'utf8')
const service = readFileSync(new URL('../src/services/attorneyDashboard.js', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/pages/AttorneyDashboardPage.jsx', import.meta.url), 'utf8')
const mattersPage = readFileSync(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8')
const matterWorkspace = readFileSync(new URL('../src/services/attorneyMatterWorkspace.js', import.meta.url), 'utf8')
const attentionService = readFileSync(new URL('../src/services/attorneyDashboardAttention.js', import.meta.url), 'utf8')

assert.doesNotMatch(service.slice(service.indexOf('function buildAttentionMetrics'), service.indexOf('function toPercent')), /next_action|attorney_stage|isAwaitingClearance|isInvoiceOutstanding/)
assert.match(service, /get_attorney_dashboard_attention_snapshot/)
assert.match(service, /sourceStatus: 'unavailable'/)
assert.match(page, /formatMetricCount/)
assert.match(page, /attention=\$\{encodeURIComponent\(item\.filter \|\| item\.key\)\}&roleView=/)
assert.match(mattersPage, /getAttorneyDashboardMetricPage/)
assert.match(mattersPage, /metricGroup = attentionSnapshotKey \? 'attention'/)
assert.match(matterWorkspace, /Authoritative dashboard drill-downs/)
assert.match(attentionService, /get_attorney_dashboard_attention_snapshot/)

const db = new PGlite()
await db.exec(`
create role anon;
create role authenticated;
create schema auth;
create table auth.test_actor(id uuid primary key);
insert into auth.test_actor values ('00000000-0000-4000-8000-000000000001');
create function auth.uid() returns uuid language sql stable as $$ select id from auth.test_actor limit 1 $$;

create table public.attorney_firm_members(firm_id uuid,user_id uuid,status text,role text);
create table public.transaction_attorney_assignments(
  transaction_id uuid,attorney_firm_id uuid,firm_id uuid,attorney_role text,assignment_type text,
  assignment_status text,status text
);
create table public.transactions(
  id uuid primary key,is_active boolean,lifecycle_state text,stage text,current_main_stage text,next_action text,
  target_registration_date date,last_meaningful_activity_at timestamptz,updated_at timestamptz,created_at timestamptz
);
create table public.document_packets(id uuid primary key,transaction_id uuid,status text,current_version_number integer);
create table public.document_packet_versions(id uuid primary key,packet_id uuid,version_number integer);
create table public.document_signing_dispatches(packet_id uuid,packet_version_id uuid,status text);
create table public.document_packet_signers(packet_id uuid,packet_version_id uuid,status text);
create table public.transaction_subprocesses(id uuid primary key,transaction_id uuid,due_date date);
create table public.transaction_subprocess_steps(subprocess_id uuid,step_key text,status text,step_metadata jsonb default '{}');
create table public.document_requests(
  transaction_id uuid,status text,requested_from text,assigned_to_role text,due_date date,
  document_type text,review_status text
);
create table public.attorney_workflow_blockers(transaction_id uuid,resolved_at timestamptz,due_date date);
create table public.transaction_refresh_signals(
  transaction_id uuid primary key,version bigint not null default 0,command_receipt_id uuid,
  canonical_event_id uuid,changed_at timestamptz
);
create table public.matter_financial_documents(
  id uuid primary key,transaction_id uuid,attorney_firm_id uuid,document_status text,document_type text,
  due_on date,amount_due numeric,amount_total numeric
);
create table public.matter_financial_entries(transaction_id uuid,financial_document_id uuid,entry_status text,amount numeric);
`)
await db.exec(migration)

const firm = '10000000-0000-4000-8000-000000000001'
const actor = '00000000-0000-4000-8000-000000000001'
const ids = Array.from({ length: 6 }, (_, index) => `20000000-0000-4000-8000-00000000000${index + 1}`)
await db.query('insert into public.attorney_firm_members values($1,$2,$3,$4)', [firm, actor, 'active', 'firm_admin'])
for (const id of ids) {
  await db.query(`insert into public.transactions values($1,true,'active','active','active','',current_date + 30,now(),now(),now())`, [id])
  await db.query(`insert into public.transaction_attorney_assignments values($1,$2,$2,'transfer_attorney','transfer','active','active')`, [id, firm])
}

await db.query(`insert into public.document_packets values($1,$2,'sent',1)`, ['30000000-0000-4000-8000-000000000001', ids[0]])
await db.query(`insert into public.document_packet_versions values($1,$2,1)`, ['31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'])
await db.query(`insert into public.document_signing_dispatches values($1,$2,'delivered')`, ['30000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001'])
await db.query(`insert into public.document_packet_signers values($1,$2,'sent'),($1,$2,'viewed')`, ['30000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001'])

await db.query(`insert into public.transaction_subprocesses values($1,$2,current_date - 1)`, ['40000000-0000-4000-8000-000000000001', ids[1]])
await db.query(`insert into public.transaction_subprocess_steps values($1,'payment_security_review','blocked','{}')`, ['40000000-0000-4000-8000-000000000001'])

await db.query(`insert into public.transaction_subprocesses values($1,$2,null)`, ['40000000-0000-4000-8000-000000000002', ids[2]])
await db.query(`insert into public.transaction_subprocess_steps values($1,'municipal_rates_clearance_review','in_progress','{}')`, ['40000000-0000-4000-8000-000000000002'])

await db.query(`insert into public.document_requests values($1,'requested','buyer','buyer',current_date - 1,'identity','pending_review'),($1,'rejected','buyer','buyer',current_date - 1,'address','needs_correction')`, [ids[3]])

await db.query(`insert into public.matter_financial_documents values($1,$2,$3,'published','invoice',current_date - 1,100,100)`, ['50000000-0000-4000-8000-000000000001', ids[4], firm])
await db.query(`insert into public.matter_financial_entries values($1,$2,'posted',100),($1,$2,'posted',-20)`, [ids[4], '50000000-0000-4000-8000-000000000001'])

await db.query(`update public.transactions set last_meaningful_activity_at=current_date - interval '15 days' where id=$1`, [ids[5]])

const result = await db.query(`select public.get_attorney_dashboard_attention_snapshot($1,'all') as snapshot`, [firm])
const snapshot = result.rows[0].snapshot
for (const key of ['signatures', 'guarantees', 'clearance', 'clientDocuments', 'invoices', 'stalled']) {
  assert.equal(Number(snapshot[key].count), 1, `${key} should count one unique matter`)
  assert.equal(snapshot[key].matterIds.length, 1, `${key} drilldown IDs should remain unique`)
}

const refreshSignals = await db.query(`select transaction_id, version from public.transaction_refresh_signals order by transaction_id`)
assert.ok(refreshSignals.rows.length >= 4, 'attention source writes should emit dashboard refresh signals')
assert.ok(refreshSignals.rows.every(({ version }) => Number(version) >= 1), 'refresh signal versions should advance')

console.log('Attorney dashboard authoritative attention metrics Phase 3 passed.')
