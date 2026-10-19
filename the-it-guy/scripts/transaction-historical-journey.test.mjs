import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { buildSharedHighLevelJourney } from '../src/core/transactions/highLevelJourneyAdapter.js'
import { projectSharedMatterJourneyRead } from '../src/services/sharedMatterJourneyReader.js'
import { normaliseHistoricalMilestones } from '../src/core/transactions/historicalJourney.js'

const db = new PGlite()
const actor = '00000000-0000-4000-8000-000000000001'
const transaction = '00000000-0000-4000-8000-000000000002'
const org = '00000000-0000-4000-8000-000000000003'
const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8')
try {
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
    create function bridge_is_active_member(uuid) returns boolean language sql as $$select auth.uid()='${actor}'::uuid$$;
    insert into auth.users values ('${actor}');
    create table transactions(id uuid primary key,organisation_id uuid,finance_type text,routing_profile_json jsonb,
      onboarding_status text default 'awaiting_client_onboarding');
    insert into transactions(id,organisation_id,finance_type,routing_profile_json) values('${transaction}','${org}','cash','{}');
    create table transaction_refresh_signals(transaction_id uuid primary key,version bigint,changed_at timestamptz,command_receipt_id uuid,canonical_event_id uuid);
    create table transaction_subprocesses(id uuid,transaction_id uuid,process_type text);
    create table transaction_subprocess_steps(subprocess_id uuid,step_key text,status text);
    create table transaction_workflow_instances(id uuid,transaction_id uuid,workflow_key text);
    create table transaction_workflow_steps(workflow_instance_id uuid,transaction_id uuid,workflow_key text,step_key text,status text);
    create schema journey_private;
    create table journey_private.task_catalog(lane_key text,step_key text,phase_key text,phase_label text,phase_order integer,task_order integer,definition jsonb);
    grant usage on schema public,auth to authenticated;
    grant select,update on transactions to authenticated;
    select set_config('test.actor','${actor}',false);
  `)
  const refresh = migration('20260908121455_transaction_attorney_refresh_contract_repair.sql')
  await db.exec(refresh.slice(refresh.indexOf('create or replace function'), refresh.indexOf('drop trigger')))
  await db.exec(migration('20261019183254_transaction_historical_journey.sql'))
  await db.exec('set role authenticated')
  const save = async (milestones, revision = 0) => (await db.query(
    'select bridge_save_transaction_historical_journey($1,$2,$3) result', [transaction, JSON.stringify(milestones), revision],
  )).rows[0].result
  const milestones = { otp_signed: { completedOn: '2026-01-05' }, lodgement: { completedOn: null } }
  assert.equal((await save(milestones)).recordRevision, 1)
  await assert.rejects(save({}, 0), /changed/)
  await assert.rejects(save({ finance: { completedOn: '2026-02-30' } }, 1), /Invalid/)
  await assert.rejects(save({ finance: { completedOn: '2999-01-01' } }, 1), /future/)
  await assert.rejects(save({ unknown: { completedOn: null } }, 1), /Invalid/)
  await assert.rejects(save({ finance: { completedOn: null, secret: 'PRIVATE' } }, 1), /Invalid/)
  await assert.rejects(db.query('delete from transaction_historical_journey'), /permission denied/)
  await db.exec('reset role')
  const raw = (await db.query('select journey_private.read_matter_journey($1) result', [transaction])).rows[0].result
  assert.equal(raw.revision, 1, 'save publishes the shared refresh signal')
  assert.equal(raw.historicalJourney.recordRevision, 1)
  for (const audience of ['agent', 'developer', 'attorney', 'buyer', 'seller']) {
    const source = projectSharedMatterJourneyRead(raw, { audience })
    assert.doesNotMatch(JSON.stringify(source), /recorded_by|recorded_at/)
    const journey = buildSharedHighLevelJourney({ transactionId: transaction, legalJourney: { status: 'ready', snapshot: source } })
    assert.deepEqual(journey.milestones.map(item => item.status), ['complete', 'unknown', 'unknown', 'complete', 'unknown'])
    assert.equal(journey.milestones[0].completedOn, '2026-01-05')
    assert.equal(journey.milestones[3].completedOn, null)
    assert.equal(journey.milestones[2].isComplete, false, 'lodgement does not infer transfer or finance')
  }
  const stale = structuredClone(raw)
  stale.historicalJourney.revision = 0
  assert.equal(projectSharedMatterJourneyRead(stale).historicalJourney, null, 'history must match the read revision')
  const wrongMatter = buildSharedHighLevelJourney({ transactionId: 'another-matter', legalJourney: {
    status: 'ready', snapshot: projectSharedMatterJourneyRead(raw),
  } })
  assert.ok(wrongMatter.milestones.every(item => !item.isComplete), 'history from another matter cannot prove progress')
  await db.exec(`insert into transaction_workflow_instances values ('${actor}','${transaction}','finance_cash');
    insert into transaction_workflow_steps values ('${actor}','${transaction}','finance_cash','proof_of_funds_reviewed','complete'),
      ('${actor}','${transaction}','finance_cash','cash_confirmation_approved','complete');`)
  const live = (await db.query('select journey_private.read_matter_journey($1) result', [transaction])).rows[0].result
  const liveJourney = buildSharedHighLevelJourney({ transactionId: transaction, legalJourney: {
    status: 'ready', snapshot: projectSharedMatterJourneyRead(live),
  } })
  assert.equal(liveJourney.milestones[1].isComplete, true, 'unconfirmed history does not erase actual workflow completion')
  await db.exec('delete from transaction_workflow_steps; delete from transaction_workflow_instances;')
  assert.equal((await db.query('select onboarding_status from transactions')).rows[0].onboarding_status, 'awaiting_client_onboarding')
  assert.equal((await db.query('select count(*) count from transaction_workflow_steps')).rows[0].count, 0)
  await db.exec('set role authenticated')
  await save({}, 1)
  await db.exec('reset role')
  const cleared = (await db.query('select journey_private.read_matter_journey($1) result', [transaction])).rows[0].result
  assert.deepEqual(cleared.historicalJourney.milestones, {})
  assert.equal(cleared.revision, 2)
  assert.equal((await db.query('select count(*) count from transaction_historical_journey')).rows[0].count, 2, 'previous confirmation remains auditable')
  await db.exec("select set_config('test.actor','00000000-0000-4000-8000-000000000099',false); set role authenticated")
  await assert.rejects(save({}, 2), /Only the transaction team/)
  assert.equal((await db.query('select count(*) count from transaction_historical_journey')).rows[0].count, 0, 'non-members cannot read the audit records')
  await db.exec('reset role; set role anon')
  await assert.rejects(save({}, 2), /permission denied/)
  assert.throws(() => normaliseHistoricalMilestones({ finance: { completedOn: '2026-02-30' } }), /valid/)
  console.log('Historical journey: SQL save/read, dates, five-audience parity, unknowns, removal, audit, stale edits, RLS, refresh and onboarding isolation PASS')
} finally { await db.close() }
