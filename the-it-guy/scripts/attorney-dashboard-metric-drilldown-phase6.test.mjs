import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { auditAttorneyDashboardMetricSnapshots } from '../src/services/attorneyDashboardAssurance.js'

const migration = readFileSync(new URL('../../supabase/migrations/20260926143001_attorney_dashboard_metric_drilldown_phase6.sql', import.meta.url), 'utf8')
const page = readFileSync(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8')
const service = readFileSync(new URL('../src/services/attorneyDashboardMetricPage.js', import.meta.url), 'utf8')
const db = new PGlite()

await db.exec(`
create schema auth;
create table auth.test_actor(id uuid primary key);
insert into auth.test_actor values ('00000000-0000-4000-8000-000000000001');
create function auth.uid() returns uuid language sql stable as $$ select id from auth.test_actor limit 1 $$;
create role authenticated;
create role anon;
create table public.attorney_firm_members(firm_id uuid, user_id uuid, status text, role text);
create table public.buyers(id uuid primary key, name text);
create table public.transactions(
  id uuid primary key, buyer_id uuid, matter_number text, transaction_reference text,
  stage text, current_main_stage text, current_sub_stage_summary text, attorney_stage text,
  next_action text, next_action_due_at timestamptz, target_registration_date date,
  risk_status text, operational_state text, lifecycle_state text, registration_date date,
  updated_at timestamptz, property_description text, property_address_line_1 text,
  suburb text, city text, sales_price numeric, purchase_price numeric
);
create table public.transaction_attorney_assignments(
  id uuid primary key, transaction_id uuid, attorney_firm_id uuid, firm_id uuid,
  attorney_role text, assignment_type text, assignment_status text, status text,
  is_primary boolean, assigned_at timestamptz
);
create table public.metric_fixture(firm_id uuid, metric_group text, metric_key text, transaction_id uuid);
create function public.fixture_snapshot(p_firm_id uuid, p_group text, p_role_view text)
returns jsonb language plpgsql stable as $$
declare v_role text; v_ids jsonb;
begin
  select role into v_role from public.attorney_firm_members
    where firm_id = p_firm_id and user_id = auth.uid() and status = 'active' limit 1;
  if v_role not in ('firm_admin','director_partner') then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(transaction_id order by transaction_id),'[]'::jsonb) into v_ids
    from public.metric_fixture where firm_id = p_firm_id and metric_group = p_group;
  return jsonb_build_object('sourceStatus','available','ids',v_ids);
end $$;
create function public.get_attorney_dashboard_attention_snapshot(uuid,text)
returns jsonb language sql stable as $$
  select jsonb_build_object('sourceStatus','available','signatures',jsonb_build_object('matterIds',fixture->'ids'))
  from (select public.fixture_snapshot($1,'attention',$2) fixture) source
$$;
create function public.get_attorney_dashboard_snapshot(uuid,text,integer)
returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create function public.get_attorney_dashboard_partner_revenue_snapshot(uuid,text)
returns jsonb language sql stable as $$
  select jsonb_build_object('sourceStatus','available','revenuePipeline',jsonb_build_object('matterIds',fixture->'ids'))
  from (select public.fixture_snapshot($1,'revenue',$2) fixture) source
$$;
create function public.get_attorney_dashboard_health_performance_snapshot(uuid,text,date,date)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'sourceStatus','available',
    'matterHealth',jsonb_build_object('critical',jsonb_build_object('matterIds',fixture->'ids')),
    'conveyancingPerformance',jsonb_build_object('registrationOutcomeMatterIds',fixture->'ids')
  ) from (select public.fixture_snapshot($1,'performance',$2) fixture) source
$$;
`)
await db.exec(migration)

const actor = '00000000-0000-4000-8000-000000000001'
const firm = '10000000-0000-4000-8000-000000000001'
const otherFirm = '10000000-0000-4000-8000-000000000002'
await db.query("insert into public.attorney_firm_members values($1,$2,'active','firm_admin')", [firm, actor])
await db.exec(`
insert into public.transactions
select ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  null, 'MAT-' || n, null, 'registered', 'registered', null, null, '', null, null,
  '', '', case when n % 2 = 0 then 'registered' else 'cancelled' end,
  case when n % 2 = 0 then current_date else null end,
  now() - n * interval '1 minute', 'Property ' || n, null, '', '', null, 500000
from generate_series(1, 2000) n;
insert into public.transaction_attorney_assignments
select ('30000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  '10000000-0000-4000-8000-000000000001'::uuid, null,
  'transfer_attorney', 'transfer', 'completed', 'completed', true, now()
from generate_series(1, 2000) n;
insert into public.metric_fixture
select '10000000-0000-4000-8000-000000000001'::uuid, 'performance', 'terminal_outcome_in_period',
  ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
from generate_series(1, 2000) n;
insert into public.metric_fixture values
('10000000-0000-4000-8000-000000000001','attention','signatures','20000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000001','revenue','revenue_pipeline','20000000-0000-4000-8000-000000000002');
`)
await db.exec('set role authenticated')

async function getPage(pageNumber, pageSize = 20, search = '') {
  const result = await db.query(
    `select public.get_attorney_dashboard_metric_matter_page($1,'performance','terminal_outcome_in_period','all',$2,$3,$4) as page`,
    [firm, pageNumber, pageSize, search],
  )
  return result.rows[0].page
}

const first = await getPage(1)
assert.equal(first.pagination.totalRows, 2000)
assert.equal(first.rows.length, 20)
assert(JSON.stringify(first).length < 20_000, 'the API payload must remain bounded to the requested page')
assert.equal(new Set(first.rows.map((row) => row.transactionId)).size, 20)
assert(first.rows.every((row) => ['registered', 'cancelled'].includes(row.lifecycleState)))
const last = await getPage(100)
assert.equal(last.pagination.totalRows, 2000, 'pagination must not change the reconciled total')
assert.equal(last.rows.length, 20)
assert.equal(new Set([...first.rows, ...last.rows].map((row) => row.transactionId)).size, 40)
assert.equal((await getPage(1, 20, 'MAT-17')).pagination.totalRows, 111)
const attentionPage = await db.query(`select public.get_attorney_dashboard_metric_matter_page($1,'attention','signatures') as page`, [firm])
assert.equal(attentionPage.rows[0].page.pagination.totalRows, 1)
const revenuePage = await db.query(`select public.get_attorney_dashboard_metric_matter_page($1,'revenue','revenue_pipeline') as page`, [firm])
assert.equal(revenuePage.rows[0].page.pagination.totalRows, 1)

const denied = await db.query(`select public.get_attorney_dashboard_metric_matter_page($1,'performance','terminal_outcome_in_period')`, [otherFirm]).then(() => null, (error) => error)
assert.equal(denied?.code, '42501', 'a different firm must not expose its metric population')
const invalid = await db.query(`select public.get_attorney_dashboard_metric_matter_page($1,'performance','arbitrary')`, [firm]).then(() => null, (error) => error)
assert.equal(invalid?.code, '22023')
const uncheckedEntryPoint = await db.query(`select public.get_attorney_dashboard_health_performance_snapshot_unchecked($1,'all',null,null)`, [firm]).then(() => null, (error) => error)
assert.equal(uncheckedEntryPoint?.code, '42501', 'nullable-role legacy implementations must not remain callable')
const guardedEntryPoint = await db.query(`select public.get_attorney_dashboard_health_performance_snapshot($1,'all',null,null)`, [otherFirm]).then(() => null, (error) => error)
assert.equal(guardedEntryPoint?.code, '42501', 'existing dashboard API must deny a different firm')

assert.deepEqual(auditAttorneyDashboardMetricSnapshots({
  attention: { sourceStatus: 'available', signatures: { count: 2, matterIds: ['a'] } },
  revenue: { sourceStatus: 'available', revenuePipeline: { pricedMatterCount: 1, matterIds: ['a', 'b'] } },
  healthPerformance: { sourceStatus: 'available', matterHealth: {
    total: 2,
    onTrack: { count: 1, matterIds: ['a'] },
    attention: { count: 0, matterIds: [] },
    critical: { count: 0, matterIds: [] },
  }, conveyancingPerformance: { registrationForecast: {
    thisWeek: 0, thisWeekMatterIds: [], nextWeek: 0, nextWeekMatterIds: [], thisMonth: 0, thisMonthMatterIds: [],
  }, matterDistribution: [] } },
}), ['attention.signatures', 'attention.guarantees', 'attention.clearance', 'attention.clientDocuments', 'attention.invoices', 'attention.stalled', 'revenue.pricedMatters', 'health.total'])

assert.match(page, /getAttorneyDashboardMetricPage/)
assert.match(page, /hasDashboardMetricDrilldown && !usesIncomingQueue/)
assert.match(service, /get_attorney_dashboard_metric_matter_page/)
console.log('Attorney dashboard Phase 6 paged drill-down, terminal parity and firm isolation passed (2,000 matters).')
await db.close()
