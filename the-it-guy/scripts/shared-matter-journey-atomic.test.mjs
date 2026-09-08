import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { commitSharedJourneyTask } from '../src/services/attorneyWorkflow/sharedJourneyCommandService.js'
import { getAttorneyStageDefinitionsForLane } from '../src/constants/attorneyWorkflowStages.js'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const actor = '00000000-0000-0000-0000-000000000001'
const matter = '00000000-0000-0000-0000-000000000002'
const lane = '00000000-0000-0000-0000-000000000003'
const step = '00000000-0000-0000-0000-000000000004'
const migration = name => readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8')
// Reuse the established isolated schema fixture, not credentials or a hosted database.
const fixture = readFileSync(new URL('./attorney-mvp-task-discretion-sql.test.mjs', import.meta.url), 'utf8')
  .match(/await db.exec\(`([\s\S]*?)`\)/)[1]
  .replaceAll('${actor}', actor).replaceAll('${matter}', matter).replaceAll('${lane}', lane).replaceAll('${step}', step)
await db.exec(fixture)
await db.exec(`
create table auth.users(id uuid primary key);
insert into auth.users values ('${actor}');
alter table transactions add column next_action text, add column waiting_on_role text, add column last_meaningful_activity_at timestamptz;
alter table transaction_subprocess_steps add column transaction_id uuid;
update transaction_subprocess_steps set transaction_id = '${matter}';
create table transaction_refresh_signals(transaction_id uuid primary key,version bigint not null,changed_at timestamptz,command_receipt_id uuid,canonical_event_id uuid);
create function bridge_can_access_transaction_spine(uuid) returns boolean language sql as $$select true$$;
`)
await db.exec(migration('20260908073924_attorney_mvp_task_discretion.sql'))
await db.exec(migration('20260908091504_attorney_event_visibility_contract.sql'))
const legacy = migration('202607190002_transaction_shared_progress_phase2.sql')
await db.exec(legacy.slice(legacy.indexOf('create table'), legacy.indexOf('create index')))
await db.exec(legacy.slice(legacy.indexOf('create or replace function public.bridge_publish'), legacy.indexOf('-- Reconcile the duplicated')))
const refresh = migration('20260908121455_transaction_attorney_refresh_contract_repair.sql')
await db.exec(refresh.slice(refresh.indexOf('create or replace function'), refresh.indexOf('-- A changed routing')))
await db.exec(migration('20260908144636_shared_matter_journey_atomic_commands.sql'))
for (const key of ['transfer','bond','cancellation']) {
  const rows = (await db.query('select step_key,definition from journey_private.task_catalog where lane_key=$1 order by step_key',[key])).rows
  assert.deepEqual(rows, getAttorneyStageDefinitionsForLane(key).map(t=>({step_key:t.key,definition:t.sharedProgress})).sort((a,b)=>a.step_key.localeCompare(b.step_key)))
}
const update = async (status, command = randomUUID(), expected = undefined, note = '') => {
  if (expected === undefined) expected = (await db.query('select updated_at from transaction_subprocess_steps where id=$1',[step])).rows[0].updated_at
  return (await db.query('select bridge_update_attorney_workflow_step_v4($1,$2,$3,$4,$5,$6,$7,$8) result',
    [matter,'transfer',step,status,command,expected,note,'internal'])).rows[0].result
}
const id = randomUUID()
let result = await update('completed',id,null,'Private note')
assert.equal(result.completionPercent,50)
assert.deepEqual(result.committedSnapshot.legalProgress,{applicableCount:2,completedCount:1,notApplicableCount:0,percent:50})
assert.equal(result.committedSnapshot.laneSnapshots.transfer.steps[0].status,'completed')
assert.ok(result.revision > 0)
assert.doesNotMatch(JSON.stringify(result),/Private note/)
assert.equal((await update('completed',id,null,'Private note')).replayed,true)
await assert.rejects(update('blocked',id,null,'Private note'),/already used/)
await assert.rejects(update('blocked',randomUUID(),null),/changed/)
assert.equal((await db.query('select count(*)::int n from journey_private.task_events')).rows[0].n,1)
assert.equal((await db.query('select status from transaction_shared_progress')).rows[0].status,'completed')
result = await update('not_started')
assert.equal(result.matterStage,'instruction')
assert.equal(result.completionPercent,0)
for (const status of ['in_progress','waiting','blocked','completed_externally','not_applicable']) {
  const next = await update(status,randomUUID(),undefined,'Reason')
  assert.equal(next.stepStatus,status)
  assert.ok(next.revision > result.revision)
  result = next
}
await assert.rejects(update('not_applicable'),/reason/)
await db.query("update transactions set routing_profile_json = jsonb_set(routing_profile_json,'{workflowPlan,lanes,0,stepKeys}','[\"instruction_received\"]') where id=$1",[matter])
result = await update('not_applicable',randomUUID(),undefined,'Not relevant')
assert.equal(result.completionPercent,null)
assert.equal(result.committedSnapshot.legalProgress.percent,null)
assert.equal(result.committedSnapshot.legalProgress.applicableCount,0)
await db.query("update transactions set routing_profile_json = jsonb_set(routing_profile_json,'{workflowPlan,lanes,0,stepKeys}','[\"instruction_received\",\"matter_opened\"]') where id=$1",[matter])
const before = (await db.query('select * from transaction_refresh_signals')).rows
await db.exec("create function reject_publication() returns trigger language plpgsql as $$begin raise exception 'publication failed'; end$$; create trigger reject_publication before update on transaction_shared_progress for each row execute function reject_publication();")
await assert.rejects(update('completed'),/publication failed/)
assert.equal((await db.query('select status from transaction_subprocess_steps')).rows[0].status,'not_applicable')
assert.deepEqual((await db.query('select * from transaction_refresh_signals')).rows,before)
await db.exec('drop trigger reject_publication on transaction_shared_progress')
await db.exec("create function reject_receipt() returns trigger language plpgsql as $$begin raise exception 'receipt failed'; end$$; create trigger reject_receipt before insert on journey_private.command_receipts for each row execute function reject_receipt();")
await assert.rejects(update('completed'),/receipt failed/)
assert.equal((await db.query('select status from transaction_subprocess_steps')).rows[0].status,'not_applicable')
assert.deepEqual((await db.query('select * from transaction_refresh_signals')).rows,before)
await db.exec('drop trigger reject_receipt on journey_private.command_receipts')
const privileges = (await db.query(`select
has_function_privilege('anon','bridge_update_attorney_workflow_step_v4(uuid,text,uuid,text,uuid,timestamptz,text,text,jsonb)','execute') anonymous,
has_function_privilege('authenticated','bridge_update_attorney_workflow_step_v3(uuid,text,uuid,text,text,text,jsonb)','execute') legacy,
has_schema_privilege('authenticated','journey_private','usage') private_access`)).rows[0]
assert.deepEqual(privileges,{anonymous:false,legacy:false,private_access:false})
await db.exec('delete from transaction_attorney_assignments')
await assert.rejects(update('completed'),/permission/)
await assert.rejects(update('completed',id,null,'Private note'),/permission/, 'replays must recheck authority')
await db.close()
let calls = []
const payload = {p_command_id:randomUUID()}
const response = await commitSharedJourneyTask({rpc:async(name,args)=>{
  calls.push({name,args})
  return calls.length === 1 ? {error:{message:'Failed to fetch'}} : {data:{replayed:true}}
}},payload)
assert.equal(response.data.replayed,true)
assert.equal(calls.length,2)
assert.strictEqual(calls[0].args,calls[1].args)
calls=[]
await commitSharedJourneyTask({rpc:async()=>{calls.push(1);return {error:{code:'40001'}}}},payload)
assert.equal(calls.length,1)
console.log('Shared journey atomic: PostgreSQL commit, publication/receipt rollback, seven outcomes, revisions, replay, stale edits, ACL and transport retry PASS')
