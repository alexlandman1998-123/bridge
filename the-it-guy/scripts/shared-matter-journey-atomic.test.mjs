import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { commitSharedJourneyTask } from '../src/services/attorneyWorkflow/sharedJourneyCommandService.js'
import { getAttorneyStageDefinitionsForLane } from '../src/constants/attorneyWorkflowStages.js'
import { projectSharedMatterJourneyRead, sharedJourneyHeaderPhases, sharedJourneyLaneTasks } from '../src/services/sharedMatterJourneyReader.js'
import { buildTransferWorkspaceViewModel } from '../src/services/attorneyWorkflow/transferWorkspaceViewModel.js'
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
// Load the real reader as well as its phase schema so command results can be
// checked against a fresh read, the workspace and the top journey.
const reader = migration('20260908150256_shared_matter_journey_reader.sql')
await db.exec(`
alter table transactions add column finance_type text;
create table transaction_workflow_instances(id uuid primary key,transaction_id uuid,workflow_key text);
create table transaction_workflow_steps(workflow_instance_id uuid,transaction_id uuid,workflow_key text,step_key text,status text);
create function bridge_has_client_portal_token_transaction_access(uuid) returns boolean language sql as $$select false$$;
create function bridge_has_onboarding_token_transaction_access(uuid) returns boolean language sql as $$select false$$;
`)
await db.exec(reader)
await db.exec(migration('20260910094209_transfer_tax_cross_role_safe_reader_phase7.sql'))
await db.exec(migration('20260910153517_reconcile_shared_journey_reader_contract.sql'))
const laneSecurity = migration('202607230008_attorney_three_lane_transaction_spine.sql')
await db.exec(laneSecurity.slice(laneSecurity.indexOf('create or replace function public.bridge_attorney_lane_role'), laneSecurity.indexOf('create or replace function public.bridge_can_mutate_attorney_lane')))
await db.exec(migration('20260909144454_attorney_task_confirmation_state.sql'))
// The historical catalogue insert omitted required phase columns. Use the
// forward replacement, which covers every current transfer definition, rather
// than rewriting the already-applied migration to make this fixture pass.
await db.exec(migration('20260910080705_transfer_tax_conditional_workflow_phase3.sql'))
await db.exec(migration('20260910092527_shared_journey_safe_tax_milestones.sql'))
await db.exec(migration('20260910153146_reconcile_attorney_journey_catalogue.sql'))
// A replay must preserve saved outcomes and leave the catalogue unchanged.
await db.exec(migration('20260910153146_reconcile_attorney_journey_catalogue.sql'))
// Later workflow phases add catalogue entries independently of the atomic
// command migration. Replay their catalogue statements in this isolated
// fixture so the final comparison checks the current database contract.
for (const name of [
  '20260926135022_attorney_phase2_party_capacity.sql',
  '20260926140934_attorney_phase3_funding_handoffs.sql',
  '20260926142602_attorney_phase4_tax_clearance_conditions.sql',
  '20260926145234_attorney_phase5_specialist_routes.sql',
]) {
  const sql = migration(name)
  const start = sql.indexOf('insert into journey_private.task_catalog')
  const end = sql.indexOf(';', start)
  assert.ok(start >= 0 && end > start, `${name} contains a catalogue statement`)
  await db.exec(sql.slice(start, end + 1))
}
const closureSql = migration('20260926191847_attorney_stage6_closure_audience_gates.sql')
const firstClosureUpdate = closureSql.indexOf('update journey_private.task_catalog')
const closureTrigger = closureSql.indexOf('create function journey_private.enforce_stage_six_closure')
assert.ok(firstClosureUpdate >= 0 && closureTrigger > firstClosureUpdate)
await db.exec(closureSql.slice(firstClosureUpdate, closureTrigger))
await db.exec(migration('20260926194845_reconcile_attorney_workbench_catalogue.sql'))
await db.exec(migration('20260926194845_reconcile_attorney_workbench_catalogue.sql'))
const savedBeforeReconciliation = {
  steps: (await db.query('select * from transaction_subprocess_steps order by id')).rows,
  plans: (await db.query('select id,routing_profile_json from transactions order by id')).rows,
  visibility: (await db.query("select lane_key,step_key,definition->'client' client,definition->'clientVisibleAllowed' allowed from journey_private.task_catalog order by lane_key,step_key")).rows,
}
await db.exec(migration('20261002081358_reconcile_municipal_clearance_journey_copy.sql'))
await db.exec(migration('20261002081358_reconcile_municipal_clearance_journey_copy.sql'))
await db.exec(migration('20261002081455_reconcile_attorney_journey_task_order.sql'))
await db.exec(migration('20261002081455_reconcile_attorney_journey_task_order.sql'))
assert.deepEqual({
  steps: (await db.query('select * from transaction_subprocess_steps order by id')).rows,
  plans: (await db.query('select id,routing_profile_json from transactions order by id')).rows,
  visibility: (await db.query("select lane_key,step_key,definition->'client' client,definition->'clientVisibleAllowed' allowed from journey_private.task_catalog order by lane_key,step_key")).rows,
}, savedBeforeReconciliation, 'reconciliation must preserve saved tasks, active plans, historical keys and client visibility')
const catalogueComparisons = []
for (const key of ['transfer','bond','cancellation']) {
  const rows = (await db.query('select step_key,definition from journey_private.task_catalog where lane_key=$1 order by step_key',[key])).rows
  const expected = getAttorneyStageDefinitionsForLane(key).map(t=>({step_key:t.key,definition:t.sharedProgress})).sort((a,b)=>a.step_key.localeCompare(b.step_key))
  // Transfer retains old catalogue keys for open historical matters; the active
  // plan itself must still exactly match the current workbench definitions.
  const activeRows = rows.filter((row) => expected.some((item) => item.step_key === row.step_key))
  catalogueComparisons.push({ lane: key, activeRows, expected })
}
const update = async (status, command = randomUUID(), expected = undefined, note = '', packet = null, targetStep = step) => {
  if (expected === undefined) expected = (await db.query('select updated_at from transaction_subprocess_steps where id=$1',[targetStep])).rows[0].updated_at
  return (await db.query('select bridge_update_attorney_workflow_step_v4($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
    [matter,'transfer',targetStep,status,command,expected,note,'internal',packet])).rows[0].result
}
const verifySavedJourney = async (saved, taskKey = 'instruction_received') => {
  const source = (await db.query('select bridge_read_professional_matter_journey($1) result', [matter])).rows[0].result
  assert.equal(source.revision, saved.revision, 'fresh journey read must observe the committed revision')
  const journey = { status: 'ready', snapshot: projectSharedMatterJourneyRead(source, { audience: 'attorney' }) }
  const header = sharedJourneyHeaderPhases(journey, 'transfer')
  const work = buildTransferWorkspaceViewModel({ sharedJourneyTasks: sharedJourneyLaneTasks(journey, 'transfer'),
    workflow: { lane: { currentStage: 'instruction_received', steps: [] } } })
  const summary = phase => ({ key: phase.key, completed: phase.completed, total: phase.total, status: phase.status,
    current: phase.currentTask?.key || null, hasCurrentTask: phase.hasCurrentTask })
  // The isolated plan contains only its instruction phase; the workspace also
  // includes the other empty phases as navigation destinations.
  assert.deepEqual(work.phases.filter(phase => header.some(item => item.key === phase.key)).map(summary), header.map(summary))
  assert.equal(work.tasks.find(task => task.key === taskKey).status, saved.stepStatus)
  return header
}
const id = randomUUID()
let result = await update('completed',id,null,'Private note')
assert.equal((await verifySavedJourney(result))[0].currentTask.key, 'matter_opened')
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
assert.equal((await verifySavedJourney(result))[0].currentTask.key, 'instruction_received')
assert.equal(result.matterStage,'instruction')
assert.equal(result.completionPercent,0)
for (const status of ['in_progress','waiting','blocked','completed_externally','not_applicable']) {
  const next = await update(status,randomUUID(),undefined,'Reason')
  assert.equal(next.stepStatus,status)
  const reloaded = (await db.query('select status, comment from transaction_subprocess_steps where id=$1', [step])).rows[0]
  assert.equal(reloaded.status, status, 'a fresh database read must retain the saved outcome')
  assert.equal(reloaded.comment, 'Reason', 'the outcome reason must survive a fresh read')
  assert.ok(next.revision > result.revision)
  await verifySavedJourney(next)
  result = next
}
// Complete a whole phase through the real save RPC, refresh its persisted
// journey, then reopen it. A stale lane pointer must not keep the header back.
await db.exec('begin')
const openedStep = randomUUID(), ficaStep = randomUUID()
await db.query("update transactions set routing_profile_json=jsonb_set(routing_profile_json,'{workflowPlan,lanes,0,stepKeys}','[\"instruction_received\",\"matter_opened\",\"buyer_fica_review\"]') where id=$1", [matter])
await db.query("insert into transaction_subprocess_steps(id,subprocess_id,transaction_id,step_key,status,sort_order) values($1,$3,$4,'matter_opened','not_started',1),($2,$3,$4,'buyer_fica_review','not_started',2)", [openedStep, ficaStep, lane, matter])
await update('completed')
const phaseDone = await update('completed', randomUUID(), undefined, '', null, openedStep)
const advanced = await verifySavedJourney(phaseDone, 'matter_opened')
assert.equal(advanced[0].status, 'completed')
assert.equal(advanced[0].hasCurrentTask, false)
assert.equal(advanced[1].currentTask.key, 'buyer_fica_review')
assert.equal(advanced[1].hasCurrentTask, true)
assert.equal((await verifySavedJourney(await update('not_started')))[0].hasCurrentTask, true)
await db.exec('rollback')
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
const confirmations = { 'evidence:instruction_received:0': { answer: 'yes', note: 'Reviewed locally' } }
await update('not_started', randomUUID(), undefined, '', { taskConfirmations: confirmations })
assert.equal((await db.query('select status from transaction_subprocess_steps where id=$1',[step])).rows[0].status, 'not_started',
  'saving answers must not implicitly mark the task in progress')
assert.deepEqual((await db.query('select task_confirmations from attorney_task_confirmations where step_id=$1',[step])).rows[0].task_confirmations, confirmations)
await update('in_progress', randomUUID(), undefined, '', { taskConfirmations: confirmations })
assert.deepEqual((await db.query('select task_confirmations from attorney_task_confirmations where step_id=$1',[step])).rows[0].task_confirmations, confirmations)
await update('completed')
assert.deepEqual((await db.query('select task_confirmations from attorney_task_confirmations where step_id=$1',[step])).rows[0].task_confirmations, confirmations, 'completion must retain structured confirmations')
await assert.rejects(update('in_progress', randomUUID(), undefined, '', { taskConfirmations: { bad: { answer: 'invented' } } }), /Invalid task confirmation/)
assert.equal((await db.query('select status from transaction_subprocess_steps where id=$1',[step])).rows[0].status, 'completed', 'invalid confirmation must roll back the whole update')
const confirmationPrivileges = (await db.query(`select has_table_privilege('anon','attorney_task_confirmations','select') anonymous_read, has_table_privilege('authenticated','attorney_task_confirmations','insert') direct_write`)).rows[0]
assert.deepEqual(confirmationPrivileges, { anonymous_read: false, direct_write: false })
// Supply the established base-table read grants in this isolated fixture.
await db.exec('grant usage on schema auth to authenticated; grant select on transaction_subprocesses, transaction_attorney_assignments to authenticated; set role authenticated')
assert.equal((await db.query('select count(*)::int n from attorney_task_confirmations')).rows[0].n, 1)
await db.exec('reset role')
await db.exec('delete from transaction_attorney_assignments')
await db.exec('set role authenticated')
assert.equal((await db.query('select count(*)::int n from attorney_task_confirmations')).rows[0].n, 0, 'unassigned readers must not see private confirmation notes')
await db.exec('reset role')
await assert.rejects(update('completed'),/permission/)
await assert.rejects(update('completed',id,null,'Private note'),/permission/, 'replays must recheck authority')
await db.close()
console.log('Shared journey atomic: PostgreSQL commits, structured confirmations, reload, rollback, outcomes, revisions, ACL and transport retry PASS')
for (const { lane, activeRows, expected } of catalogueComparisons) {
  const actualByKey = new Map(activeRows.map((row) => [row.step_key, row.definition]))
  const differences = expected.flatMap(({ step_key, definition }) => {
    const actual = actualByKey.get(step_key)
    return isDeepStrictEqual(actual, definition) ? [] : [step_key]
  })
  assert.deepEqual(differences, [], `${lane}: SQL catalogue must match application definitions`)
}
const transferCatalogue = new Map(catalogueComparisons.find(({ lane }) => lane === 'transfer').activeRows
  .map(({ step_key, definition }) => [step_key, definition]))
for (const stepKey of [
  'post_registration_closeout_review', 'matter_closed',
  'non_resident_seller_applicability_review', 'non_resident_seller_directive_review',
  'non_resident_seller_withholding_payment_review',
]) {
  assert.equal(transferCatalogue.get(stepKey)?.clientVisibleAllowed, false,
    `${stepKey} must not publish task notes to the client portal`)
  assert.equal(transferCatalogue.get(stepKey)?.client, null,
    `${stepKey} must not carry a client-facing task description`)
}
