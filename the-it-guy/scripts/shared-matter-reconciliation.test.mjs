import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const actor='00000000-0000-0000-0000-000000000001', matter='00000000-0000-0000-0000-000000000002', lane='00000000-0000-0000-0000-000000000003', step='00000000-0000-0000-0000-000000000004'
const fixture=readFileSync(new URL('./attorney-mvp-task-discretion-sql.test.mjs',import.meta.url),'utf8').match(/await db.exec\(`([\s\S]*?)`\)/)[1].replaceAll('${actor}',actor).replaceAll('${matter}',matter).replaceAll('${lane}',lane).replaceAll('${step}',step)
await db.exec(fixture)
await db.exec(`create table transaction_refresh_signals(transaction_id uuid primary key,version bigint,changed_at timestamptz);
create function bridge_can_access_transaction_spine(uuid) returns boolean language sql as $$select $1='${matter}'::uuid$$;`)
for(const name of ['20260908073924_attorney_mvp_task_discretion.sql','20260908144636_shared_matter_journey_atomic_commands.sql','20260908160229_shared_matter_journey_reconciliation.sql']) await db.exec(readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8'))
const profile={matterProfile:{status:'confirmed',revision:1,factFingerprint:'facts'},workflowPlan:{version:'attorney_matter_workflow_plan_v2',status:'active',provisional:false,matterProfileRevision:1,matterProfileFingerprint:'facts',laneKeys:['transfer'],lanes:[{laneKey:'transfer',stepKeys:['instruction_received']}]}}
await db.query('update transactions set routing_profile_json=$1 where id=$2',[profile,matter])
const audit=async()=> (await db.query('select bridge_audit_shared_matter_journey($1) r',[matter])).rows[0].r
const repair=async(report,id=randomUUID())=>(await db.query('select bridge_reconcile_shared_matter_journey($1,$2,$3,$4) r',[matter,report.fingerprint,id,'REBUILD_DERIVED_JOURNEY_ONLY'])).rows[0].r
const before=await db.query('select * from transaction_subprocess_steps order by id')
const report=await audit()
assert.equal(report.decision,'repairable',JSON.stringify(report))
const command=randomUUID(), result=await repair(report,command)
assert.equal(result.after.decision,'clean')
assert.deepEqual(await db.query('select * from transaction_subprocess_steps order by id'),before)
assert.equal((await repair(report,command)).replayed,true)
assert.equal((await audit()).revision,result.after.revision)
await assert.rejects(repair({...report,fingerprint:'changed'},command),/already used/)
await assert.rejects(repair(report),/changed since audit/)
await assert.rejects(repair(await audit()),/not eligible/)
for(const [change,code] of [
 ["routing_profile_json='{}'",'MISSING_ACTIVE_PLAN'],
 ["routing_profile_json=jsonb_set(routing_profile_json,'{matterProfile,revision}','2')",'PROFILE_PLAN_MISMATCH'],
 ["routing_profile_json=jsonb_set(routing_profile_json,'{workflowPlan,provisional}','true')",'PROFILE_CONFIRMATION_REQUIRED'],
 ["lifecycle_state='archived'",'TERMINAL_MATTER_REVIEW'],
]) {
 await db.exec('begin')
 await db.exec(`update transactions set ${change}`)
 const r=await audit(); assert.equal(r.decision,'manual_review'); assert.ok(r.issues.some(i=>i.code===code))
 await assert.rejects(repair(r),/not eligible/)
 await db.exec('rollback')
}
await db.exec('begin; delete from transaction_subprocess_steps')
assert.ok((await audit()).issues.some(i=>i.code==='MISSING_TASK_ROW'))
await db.exec('rollback')
for(const [sql,code] of [
 [`insert into transaction_subprocess_steps(id,subprocess_id,step_key,status) values('${randomUUID()}','${lane}','instruction_received','not_started')`,'DUPLICATE_TASK_ROWS'],
 [`insert into transaction_subprocesses(id,transaction_id,process_type) values('${randomUUID()}','${matter}','transfer')`,'DUPLICATE_SAVED_LANE'],
 ["alter table transaction_subprocess_steps drop constraint attorney_task_status_mvp_check; update transaction_subprocess_steps set status='unknown'",'UNKNOWN_TASK_OUTCOME'],
 [`insert into transaction_subprocess_steps(id,subprocess_id,step_key,status) values('${randomUUID()}','${lane}','matter_opened','completed')`,'EXCLUDED_WORKED_HISTORY'],
 [`insert into journey_private.task_events values('${matter}','${randomUUID()}',20,'transfer','instruction_received','not_started','completed',now())`,'EVENT_OUTCOME_CONFLICT'],
 ["update transactions set routing_profile_json=jsonb_set(routing_profile_json,'{workflowPlan,lanes,0,stepKeys}','[\"unknown\"]')",'UNKNOWN_TASK_MAPPING'],
]) {
 await db.exec('begin'); await db.exec(sql)
 const r=await audit(); assert.equal(r.decision,'manual_review'); assert.ok(r.issues.some(i=>i.code===code),code)
 await assert.rejects(repair(r),/not eligible/)
 await db.exec('rollback')
}
// A failed refresh rolls every projection change back, including the receipt.
await db.exec(`update transaction_subprocesses set current_stage='stale';
create function reject_repair_signal() returns trigger language plpgsql as $$begin raise exception 'signal failure'; end$$;
create trigger reject_repair_signal before insert or update on transaction_refresh_signals for each row execute function reject_repair_signal();`)
const stale=await audit()
await assert.rejects(repair(stale),/signal failure/)
assert.equal((await audit()).fingerprint,stale.fingerprint)
await db.exec('drop trigger reject_repair_signal on transaction_refresh_signals')
await repair(stale)
for(const status of ['not_started','in_progress','waiting','blocked','completed','completed_externally','not_applicable']) {
 await db.exec('begin')
 await db.query('update transaction_subprocess_steps set status=$1',[status])
 const r=await audit(), expected=r.expectedLanes[0]
 assert.equal(expected.completedCount,['completed','completed_externally'].includes(status)?1:0)
 assert.equal(expected.applicableCount,status==='not_applicable'?0:1)
 assert.equal(expected.percent,status==='not_applicable'?null:['completed','completed_externally'].includes(status)?100:0)
 if(r.decision==='repairable') assert.equal((await repair(r)).after.decision,'clean')
 assert.equal((await db.query('select status from transaction_subprocess_steps')).rows[0].status,status)
 await db.exec('rollback')
}
await db.exec('begin')
await db.query("update transactions set routing_profile_json=jsonb_set(jsonb_set(routing_profile_json,'{workflowPlan,laneKeys}',$1),'{workflowPlan,lanes}',$2)",[
 JSON.stringify(['transfer','bond']),JSON.stringify([...profile.workflowPlan.lanes,{laneKey:'bond',stepKeys:['bond_instruction_received']}])])
const bond=randomUUID()
await db.query("insert into transaction_subprocesses(id,transaction_id,process_type) values($1,$2,'bond')",[bond,matter])
await db.query("insert into transaction_subprocess_steps(id,subprocess_id,step_key,status) values($1,$2,'bond_instruction_received','not_started')",[randomUUID(),bond])
await assert.rejects(repair(await audit()),/Workflow authority/)
await db.exec('rollback')
await db.exec('begin; delete from transaction_attorney_assignments')
await assert.rejects(repair(await audit()),/Workflow authority/)
await db.exec('rollback')
await db.exec(`update profiles set role='agent' where id='${actor}'`)
await assert.rejects(repair(await audit()),/Attorney reconciliation authority/)
await db.exec('set role anon')
await assert.rejects(audit(),/permission denied/)
await db.exec('reset role')
await db.exec('set role authenticated')
await audit()
await assert.rejects(db.query('select journey_private.audit_matter($1)',[matter]),/permission denied/)
await assert.rejects(db.query('select * from journey_private.reconciliation_receipts'),/permission denied/)
await assert.rejects(db.query('select bridge_audit_shared_matter_journey($1)',[randomUUID()]),/access/)
await db.exec('reset role')
assert.equal((await db.query('select count(*)::int n from journey_private.task_events')).rows[0].n,0)
await db.close()
console.log('Shared matter reconciliation SQL checks passed')
