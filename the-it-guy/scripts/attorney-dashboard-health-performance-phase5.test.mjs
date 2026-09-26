import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(new URL('../../supabase/migrations/20260926111138_attorney_dashboard_health_performance_phase5.sql', import.meta.url), 'utf8')
const dashboardService = readFileSync(new URL('../src/services/attorneyDashboard.js', import.meta.url), 'utf8')
const healthPerformanceService = readFileSync(new URL('../src/services/attorneyDashboardHealthPerformance.js', import.meta.url), 'utf8')
const dashboardPage = readFileSync(new URL('../src/pages/AttorneyDashboardPage.jsx', import.meta.url), 'utf8')
const mattersPage = readFileSync(new URL('../src/pages/AttorneyMattersPage.jsx', import.meta.url), 'utf8')

const db = new PGlite()
await db.exec(`
create role anon;
create role authenticated;
create schema auth;
create table auth.test_actor(id uuid primary key);
insert into auth.test_actor values ('00000000-0000-4000-8000-000000000001');
create function auth.uid() returns uuid language sql stable as $$ select id from auth.test_actor limit 1 $$;

create table public.attorney_firms(id uuid primary key);
create table public.attorney_firm_members(firm_id uuid,user_id uuid,status text,role text);
create table public.transactions(
  id uuid primary key,is_active boolean,lifecycle_state text,stage text,current_main_stage text,next_action text,
  risk_status text,operational_state text,target_registration_date date,registration_date date,registered_at timestamptz,
  cancelled_at timestamptz,instructed_at timestamptz,instruction_at timestamptz,instruction_date date,
  last_meaningful_activity_at timestamptz,updated_at timestamptz,created_at timestamptz
);
create table public.transaction_attorney_assignments(
  transaction_id uuid,attorney_firm_id uuid,firm_id uuid,attorney_role text,assignment_type text,
  assignment_status text,status text,is_primary boolean,instruction_accepted_at timestamptz,
  firm_accepted_at timestamptz,assigned_at timestamptz
);
create table public.attorney_workflow_blockers(
  id uuid primary key default gen_random_uuid(),transaction_id uuid,resolved_at timestamptz,due_date date
);
create table public.transaction_subprocesses(id uuid primary key,transaction_id uuid,due_date date);
create table public.transaction_subprocess_steps(
  id uuid primary key default gen_random_uuid(),subprocess_id uuid,status text,due_date date,step_metadata jsonb default '{}'
);
create table public.document_requests(
  id uuid primary key default gen_random_uuid(),transaction_id uuid,requested_from text,assigned_to_role text,
  status text,completed_at timestamptz,created_at timestamptz
);
create table public.transaction_refresh_signals(
  transaction_id uuid primary key,version bigint not null default 0,command_receipt_id uuid,
  canonical_event_id uuid,changed_at timestamptz
);
`)
await db.exec(migration)

const actor = '00000000-0000-4000-8000-000000000001'
const firm = '10000000-0000-4000-8000-000000000001'
const active = Array.from({ length: 5 }, (_, index) => `20000000-0000-4000-8000-00000000000${index + 1}`)
const registeredOne = '20000000-0000-4000-8000-000000000006'
const registeredTwo = '20000000-0000-4000-8000-000000000007'
const cancelled = '20000000-0000-4000-8000-000000000008'

await db.query(`insert into public.attorney_firms values($1)`, [firm])
await db.query(`insert into public.attorney_firm_members values($1,$2,'active','firm_admin')`, [firm, actor])

await db.query(`insert into public.transactions values
  ($1,true,'active','active','active','', 'critical','', date_trunc('week',current_date)::date + 6,null,null,null,null,null,null,current_date-2,current_date-2,current_date-30),
  ($2,true,'active','active','active','', '','', date_trunc('week',current_date)::date + 8,null,null,null,null,null,null,current_date-2,current_date-2,current_date-30),
  ($3,true,'active','active','active','', '','', date_trunc('month',current_date)::date + 2,null,null,null,null,null,null,current_date-30,current_date-30,current_date-40),
  ($4,true,'active','active','active','', '','', null,null,null,null,null,null,null,current_date-24,current_date-24,current_date-40),
  ($5,true,'active','active','active','', '','', null,null,null,null,null,null,null,current_date-5,current_date-5,current_date-30),
  ($6,false,'registered','registered','registered','', '','', null,current_date-10,current_date-10,null,null,null,null,current_date-10,current_date-10,current_date-40),
  ($7,false,'registered','registered','registered','', '','', null,current_date-5,current_date-5,null,null,null,null,current_date-5,current_date-5,current_date-30),
  ($8,false,'cancelled','cancelled','cancelled','', '','', null,null,null,current_date-3,null,null,null,current_date-3,current_date-3,current_date-30)
`, [...active, registeredOne, registeredTwo, cancelled])

const acceptedOffsets = [20, 20, 20, 20, 20, 30, 15, 20]
for (const [index, transactionId] of [...active, registeredOne, registeredTwo, cancelled].entries()) {
  const role = index === 0 || index === 4 ? 'bond_attorney' : index === 2 ? 'cancellation_attorney' : 'transfer_attorney'
  await db.query(`insert into public.transaction_attorney_assignments values($1,$2,$2,$3,$4,$5,$5,true,current_date-$6::integer,null,current_date-$6::integer)`, [
    transactionId,
    firm,
    role,
    role === 'bond_attorney' ? 'bond' : role === 'cancellation_attorney' ? 'cancellation' : 'transfer',
    index < 5 ? 'active' : 'completed',
    acceptedOffsets[index],
  ])
}
await db.query(`insert into public.transaction_attorney_assignments values($1,$2,$2,'transfer_attorney','transfer','active','active',false,current_date-20,null,current_date-20)`, [active[0], firm])

await db.query(`insert into public.attorney_workflow_blockers(transaction_id,resolved_at,due_date) values($1,null,current_date+7),($2,null,current_date-1)`, [active[1], active[3]])
const futureWaitLane = '30000000-0000-4000-8000-000000000001'
const dueSoonLane = '30000000-0000-4000-8000-000000000002'
const overdueBlockedLane = '30000000-0000-4000-8000-000000000003'
await db.query(`insert into public.transaction_subprocesses values($1,$2,current_date+10),($3,$4,current_date+2),($5,$6,current_date-1)`, [futureWaitLane, active[2], dueSoonLane, active[4], overdueBlockedLane, active[3]])
await db.query(`insert into public.transaction_subprocess_steps(subprocess_id,status,due_date) values($1,'waiting',current_date+10),($2,'in_progress',current_date+2),($3,'blocked',current_date-1)`, [futureWaitLane, dueSoonLane, overdueBlockedLane])

await db.query(`insert into public.document_requests(transaction_id,requested_from,assigned_to_role,status,completed_at,created_at) values
  ($1,'client','client','completed',current_date-4,current_date-8),
  ($2,'seller','seller','approved',current_date-3,current_date-9)`, [registeredOne, registeredTwo])

const result = await db.query(`select public.get_attorney_dashboard_health_performance_snapshot($1,'all',null,null) as snapshot`, [firm])
const snapshot = result.rows[0].snapshot
assert.equal(snapshot.sourceStatus, 'available')
assert.equal(Number(snapshot.matterHealth.total), 5)
assert.equal(Number(snapshot.matterHealth.critical.count), 2)
assert.equal(Number(snapshot.matterHealth.attention.count), 2)
assert.equal(Number(snapshot.matterHealth.onTrack.count), 1)
assert.equal(
  snapshot.matterHealth.critical.matterIds.length + snapshot.matterHealth.attention.matterIds.length + snapshot.matterHealth.onTrack.matterIds.length,
  5,
  'health buckets must be mutually exclusive and exhaustive',
)
assert.deepEqual(snapshot.matterHealth.onTrack.matterIds, [active[2]], 'a future external wait must not be classified as stale')

assert.equal(Number(snapshot.conveyancingPerformance.averageDaysToRegistration), 15)
assert.equal(Number(snapshot.conveyancingPerformance.registrationSampleSize), 2)
assert.deepEqual(snapshot.conveyancingPerformance.registrationMatterIds, [registeredOne, registeredTwo])
assert.equal(Number(snapshot.conveyancingPerformance.registrationSuccessRate), 66.7)
assert.equal(Number(snapshot.conveyancingPerformance.registrationOutcomeSampleSize), 3)
assert.deepEqual(snapshot.conveyancingPerformance.registrationOutcomeMatterIds, [cancelled, registeredOne, registeredTwo].sort())
assert.equal(Number(snapshot.conveyancingPerformance.averageDocumentTurnaroundDays), 5)
assert.equal(Number(snapshot.conveyancingPerformance.documentTurnaroundSampleSize), 2)
assert.deepEqual(snapshot.conveyancingPerformance.documentTurnaroundMatterIds, [registeredOne, registeredTwo])
assert.equal(Number(snapshot.conveyancingPerformance.registrationForecast.thisWeek), 1)
assert.equal(Number(snapshot.conveyancingPerformance.registrationForecast.nextWeek), 1)

const distribution = Object.fromEntries(snapshot.conveyancingPerformance.matterDistribution.map((row) => [row.label, Number(row.count)]))
assert.deepEqual(distribution, { Transfer: 2, Bond: 2, Cancellation: 1 })
assert.equal(Object.values(distribution).reduce((sum, count) => sum + count, 0), 5, 'shared assignments must not inflate distribution')

assert.match(dashboardService, /get_attorney_dashboard_health_performance_snapshot/)
assert.match(dashboardService, /sourceStatus: 'unavailable'/)
assert.match(healthPerformanceService, /get_attorney_dashboard_health_performance_snapshot/)
assert.match(dashboardPage, /health=\$\{item\.key\}/)
assert.match(dashboardPage, /No zero values are being inferred/)
assert.match(mattersPage, /healthSnapshotKey \? 'health' : 'performance'/)
assert.match(mattersPage, /getAttorneyDashboardMetricPage/)

console.log('Attorney dashboard health and performance Phase 5 passed.')
