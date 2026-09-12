import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { previewLegacyMatterReconciliation } from '../src/services/attorneyWorkflow/legacyMatterReconciliation.js'
import { getAttorneyStageDefinitionsForLane } from '../src/constants/attorneyWorkflowStages.js'
import { resolveMatterWorkflowPlan } from '../src/services/attorneyWorkflow/matterWorkflowPlanService.js'
const db = new PGlite()
const matter='00000000-0000-0000-0000-000000000001', lane='00000000-0000-0000-0000-000000000002'
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema journey_private;
create table journey_private.task_catalog(lane_key text,step_key text,definition jsonb);
create table transactions(id uuid primary key,routing_profile_json jsonb);
create table transaction_subprocesses(id uuid primary key,transaction_id uuid,process_type text);
create table transaction_subprocess_steps(subprocess_id uuid,step_key text,step_label text,status text,owner_type text,sort_order integer,unique(subprocess_id,step_key));
create table transaction_refresh_signals(transaction_id uuid primary key,version bigint,changed_at timestamptz);
insert into transactions values('${matter}','{}');
insert into transaction_subprocesses values('${lane}','${matter}','transfer');
insert into transaction_subprocess_steps values('${lane}','instruction_received','Instruction','completed','attorney',1),
('${lane}','buyer_fica_requested','Requested','completed','attorney',2);`)
for(const task of getAttorneyStageDefinitionsForLane('transfer')) await db.query(
  'insert into journey_private.task_catalog values ($1,$2,$3)', ['transfer',task.key,{professional:{title:task.label}}])
await db.exec(readFileSync(new URL('../../supabase/migrations/20260910160902_reconcile_legacy_matter_task_manifest.sql',import.meta.url),'utf8'))
const before=(await db.query('select * from transaction_subprocess_steps order by step_key')).rows
const preview=previewLegacyMatterReconciliation({},[{laneKey:'transfer',steps:before}])
assert.deepEqual(resolveMatterWorkflowPlan({workflowPlan:preview.plan,financeType:'bond'}),preview.plan,'Read must not silently replace a saved provisional manifest')
assert.equal(preview.review[0].sourceKey,'buyer_fica_requested')
assert.equal(preview.review[0].disposition,'retained_for_review')
const run=(profile,plan=preview.plan)=>db.query('select bridge_reconcile_legacy_task_manifest($1,$2,$3,$4) result',[matter,profile,plan,preview.review])
await assert.rejects(run({changed:true}),/profile changed/)
assert.equal((await run({})).rows[0].result.status,'applied')
for(const row of before) assert.deepEqual((await db.query('select * from transaction_subprocess_steps where step_key=$1',[row.step_key])).rows[0],row)
const newRows=(await db.query("select * from transaction_subprocess_steps where step_key not in ('instruction_received','buyer_fica_requested')")).rows
assert.ok(newRows.length)
assert.ok(newRows.every(row=>row.status==='not_started'))
assert.equal((await run({})).rows[0].result.status,'already_applied')
assert.equal((await db.query('select version from transaction_refresh_signals')).rows[0].version,1)
const profile=(await db.query('select routing_profile_json p from transactions')).rows[0].p
await assert.rejects(run(profile,{...preview.plan,lanes:[{laneKey:'transfer',stepKeys:['unknown']}]}),/Unknown/)
const acl=(await db.query("select has_function_privilege('anon','bridge_reconcile_legacy_task_manifest(uuid,jsonb,jsonb,jsonb)','execute') a,has_function_privilege('authenticated','bridge_reconcile_legacy_task_manifest(uuid,jsonb,jsonb,jsonb)','execute') b")).rows[0]
assert.deepEqual(acl,{a:false,b:false})
await db.close()
console.log('PASS: exact outcomes retained, ambiguous aliases not promoted, new tasks pending, retry idempotent, stale/invalid plans rejected, client execution denied')
