// Isolated PostgreSQL verification; dependency can be supplied outside the repo.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const actor = '00000000-0000-0000-0000-000000000001'
const matter = '00000000-0000-0000-0000-000000000002'
const lane = '00000000-0000-0000-0000-000000000003'
const step = '00000000-0000-0000-0000-000000000004'
await db.exec(`
create role authenticated;
create role anon;
alter default privileges grant execute on functions to anon, authenticated;
create schema auth;
create function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;
create table profiles(id uuid, role text);
create table attorney_firm_members(user_id uuid, status text, firm_id uuid);
create table transaction_attorney_assignments(transaction_id uuid, assignment_status text, status text, assigned_user_id uuid, attorney_user_id uuid, primary_attorney_id uuid, secretary_id uuid, admin_handler_id uuid, attorney_firm_id uuid, firm_id uuid);
create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql as $$select $2 = 'transfer_attorney' and exists(select 1 from public.transaction_attorney_assignments where transaction_id = $1 and assigned_user_id = auth.uid())$$;
create table transactions(id uuid primary key, routing_profile_json jsonb, lifecycle_state text, current_main_stage text, current_sub_stage_summary text, updated_at timestamptz);
create table transaction_subprocesses(id uuid primary key, transaction_id uuid, process_type text, current_stage text, lane_status text, status text, completed_at timestamptz, updated_by uuid, updated_at timestamptz);
create table transaction_subprocess_steps(id uuid primary key, subprocess_id uuid, step_key text, step_label text, status text, comment text, completed_at timestamptz, completed_by uuid, visibility_scope text, updated_at timestamptz, sort_order integer, created_at timestamptz);
create table transaction_lifecycle_workflows(transaction_id uuid primary key, current_stage text, status text, last_updated_by uuid, last_updated_at timestamptz, updated_at timestamptz);
create table transaction_attorney_lane_history(transaction_id uuid, subprocess_id uuid, lane_key text, attorney_role text, previous_stage text, new_stage text, previous_status text, new_status text, changed_by uuid, note text, visibility text, source text, metadata jsonb);
create table transaction_events(transaction_id uuid, event_type text, event_data jsonb, created_by uuid, created_by_role text, visibility_scope text);
create function bridge_attorney_step_to_matter_stage(text,text) returns text language sql as $$select case when $2 = 'instruction_received' then 'instruction' else 'documents' end$$;
create function bridge_matter_lifecycle_stage_rank(text) returns integer language sql as $$select case when $1 = 'instruction' then 1 else 2 end$$;
create function bridge_matter_lifecycle_stage_label(text) returns text language sql as $$select $1$$;
insert into profiles values ('${actor}','attorney');
insert into transactions values ('${matter}', '{"workflowPlan":{"status":"active","lanes":[{"laneKey":"transfer","stepKeys":["instruction_received","matter_opened"]}]}}', 'active', 'instruction', null, now());
insert into transaction_attorney_assignments(transaction_id, assigned_user_id, status) values ('${matter}','${actor}','active');
insert into transaction_subprocesses(id,transaction_id,process_type,status) values ('${lane}','${matter}','transfer','not_started');
insert into transaction_subprocess_steps(id,subprocess_id,step_key,status,sort_order) values ('${step}','${lane}','instruction_received','not_started',1);
`)
await db.exec(readFileSync(new URL('../../supabase/migrations/20260908071547_attorney_mvp_atomic_task_progress.sql', import.meta.url), 'utf8'))
await db.exec(readFileSync(new URL('../../supabase/migrations/20260908073924_attorney_mvp_task_discretion.sql', import.meta.url), 'utf8'))
const privileges = (await db.query(`select
  has_function_privilege('anon','bridge_update_attorney_workflow_step_v3(uuid,text,uuid,text,text,text,jsonb)','EXECUTE') as anonymous_update,
  has_function_privilege('authenticated','bridge_update_attorney_workflow_step_v3(uuid,text,uuid,text,text,text,jsonb)','EXECUTE') as authenticated_update,
  has_function_privilege('authenticated','bridge_recompute_matter_lifecycle_from_attorney_workflows(uuid,uuid,text,text)','EXECUTE') as direct_helper,
  has_function_privilege('anon','bridge_recompute_matter_lifecycle_from_attorney_workflows(uuid,uuid,text,text)','EXECUTE') as anonymous_helper`)).rows[0]
assert.deepEqual(privileges, { anonymous_update: false, authenticated_update: true, direct_helper: false, anonymous_helper: false })
const update = async (status, note = '') => (await db.query('select bridge_update_attorney_workflow_step_v3($1,$2,$3,$4,$5) as result', [matter, 'transfer', step, status, note])).rows[0].result
const reconcile = async () => (await db.query('select bridge_reconcile_attorney_lane_progress_with_matter_plan($1,$2,$3,$4) as result', [matter, 'transfer', 'instruction_received', 'not_started'])).rows[0].result
let result = await update('completed')
assert.equal(result.completionPercent, 50)
assert.equal(result.laneStatus, 'in_progress')
assert.equal(result.currentStage, 'matter_opened')
assert.equal(result.matterStage, 'documents')
await assert.rejects(update('completed_externally'), /reason/)
await assert.rejects(update('not_applicable'), /reason/)
result = await update('completed_externally', 'Completed in our file; evidence held by the firm.')
assert.equal(result.completionPercent, 50)
assert.equal(result.stepStatus, 'completed_externally')
assert.equal((await reconcile()).completionPercent, 50)
assert.equal((await reconcile()).currentStage, 'matter_opened')
assert.equal((await db.query('select status from transaction_subprocess_steps where id = $1', [step])).rows[0].status, 'completed_externally')
result = await update('not_applicable', 'This task does not apply to this instruction.')
assert.equal(result.completionPercent, 0)
assert.equal(result.stepStatus, 'not_applicable')
assert.equal((await reconcile()).completionPercent, 0)
assert.equal((await reconcile()).currentStage, 'matter_opened')
assert.equal((await db.query('select completed_at from transaction_subprocess_steps where id = $1', [step])).rows[0].completed_at, null)
await db.query("update transactions set routing_profile_json = jsonb_set(routing_profile_json, '{workflowPlan,lanes,0,stepKeys}', '[\"instruction_received\"]') where id = $1", [matter])
assert.equal((await reconcile()).completionPercent, 0, 'zero applicable tasks must not fabricate completion percentage')
assert.equal((await reconcile()).laneStatus, 'completed', 'no unresolved applicable work remains')
await db.query("update transactions set routing_profile_json = jsonb_set(routing_profile_json, '{workflowPlan,lanes,0,stepKeys}', '[\"instruction_received\",\"matter_opened\"]') where id = $1", [matter])
assert.equal((await reconcile()).currentStage, 'matter_opened', 'restoring a missing planned task makes it outstanding')
result = await update('not_started')
assert.equal(result.completionPercent, 0)
assert.equal(result.matterStage, 'instruction')
await db.exec("create function reject_test_event() returns trigger language plpgsql as $$begin raise exception 'test failure'; end$$; create trigger reject_test_event before insert on transaction_events for each row execute function reject_test_event();")
await assert.rejects(update('completed'), /test failure/)
assert.equal((await db.query('select status from transaction_subprocess_steps where id = $1', [step])).rows[0].status, 'not_started')
assert.equal((await db.query('select current_main_stage from transactions where id = $1', [matter])).rows[0].current_main_stage, 'instruction')
await db.exec('drop trigger reject_test_event on transaction_events; delete from transaction_attorney_assignments;')
await assert.rejects(update('completed'), /permission/)
await assert.rejects(reconcile(), /permission/)
await db.close()
console.log('Phase 2 PostgreSQL outcome tests passed: completion, reopening, missing rows, rollback, and unauthorised access.')
