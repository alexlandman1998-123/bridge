import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

export async function verifyAttorneyTaskComments(PGlite) {
  const db = new PGlite()
  const actor = randomUUID(), matter = randomUUID()
  try {
    await db.exec(`
      create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;
      create table comment_permissions(role text primary key, allowed boolean);
      create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql as
        $$select $3='internal_notes' and coalesce((select allowed from public.comment_permissions where role=$2),false)$$;
      create table transaction_subprocesses(id uuid primary key,transaction_id uuid,process_type text);
      create table transaction_subprocess_steps(id uuid primary key,subprocess_id uuid,step_key text);
      create table transaction_attorney_lane_updates(id uuid primary key default gen_random_uuid(),transaction_id uuid,
        subprocess_id uuid,lane_key text,attorney_role text,update_type text,visibility text,message text,created_by uuid,
        client_recipients jsonb,metadata jsonb);
      create table transaction_sync_command_receipts(id uuid primary key default gen_random_uuid(),transaction_id uuid,
        idempotency_key text,source_record_id text,canonical_event_id uuid,transaction_version bigint,status text,outputs_json jsonb);
      create table sync_audit(action text,visibility text,audience jsonb,title text,description text,client_title text,client_description text,metadata jsonb);
      create function bridge_commit_transaction_sync_command_phase2(uuid,text,text,text,text,text,jsonb,text,text,text,text,jsonb)
      returns jsonb language plpgsql as $$begin
        if $9='force rollback' then raise exception 'Sync failed'; end if;
        insert into public.transaction_sync_command_receipts(transaction_id,idempotency_key,source_record_id) values($1,$3,$5);
        insert into public.sync_audit values($2,$6,$7,$8,$9,$10,$11,$12);
        return jsonb_build_object('saved',true);
      end$$;
    `)
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20261006160000_attorney_task_comment_scope.sql', import.meta.url), 'utf8'))
    for (const lane of ['transfer', 'bond', 'cancellation']) {
      const laneId = randomUUID(), task = `${lane}_test_task`, command = randomUUID()
      await db.query('insert into transaction_subprocesses values($1,$2,$3)', [laneId, matter, lane])
      await db.query('insert into transaction_subprocess_steps values($1,$2,$3)', [randomUUID(), laneId, task])
      await db.query('insert into comment_permissions values($1,true)', [`${lane}_attorney`])
      const save = (message = 'Task comment', key = task, id = command) => db.query(
        'select bridge_add_attorney_task_comment_and_sync_v1($1,$2,$3,$4,$5) result', [matter, lane, message, id, key])
      const receipt = (await save()).rows[0].result
      assert.equal((await save()).rows[0].result.updateId, receipt.updateId, 'an uncertain retry must not duplicate the comment')
      await assert.rejects(save('Changed text'), /different work/)
      await assert.rejects(save('Task comment', 'wrong-task', randomUUID()), /does not belong/)
      const saved = (await db.query('select * from transaction_attorney_lane_updates where id=$1', [receipt.updateId])).rows[0]
      assert.equal(saved.message, 'Task comment')
      assert.equal(saved.visibility, 'internal')
      assert.deepEqual(saved.client_recipients, [])
      assert.deepEqual(saved.metadata.workPacket, { laneKey: lane, stageKey: task, commandType: 'add_note' })
      const audit = (await db.query("select * from sync_audit where metadata->>'laneKey'=$1", [lane])).rows[0]
      assert.deepEqual(audit.audience, [`${lane}_attorney`], 'private comments stay in their authorised lane audience')
      assert.equal(audit.client_title, null); assert.equal(audit.client_description, null)
      assert.equal(audit.metadata.stepKey, task)
      await db.query('update comment_permissions set allowed=false where role=$1', [`${lane}_attorney`])
      await assert.rejects(save(), /permission/, 'replaying a saved command must recheck current permission')
    }
    await db.exec(`
      update comment_permissions set allowed=true where role='transfer_attorney';
      create function reject_comment_sync() returns trigger language plpgsql as $$begin raise exception 'Sync failed'; end$$;
      create trigger reject_sync before insert on sync_audit for each row execute function reject_comment_sync();
    `)
    await assert.rejects(db.query('select bridge_add_attorney_task_comment_and_sync_v1($1,$2,$3,$4,$5)',
      [matter, 'transfer', 'Uncommitted comment', randomUUID(), 'transfer_test_task']), /Sync failed/)
    assert.equal((await db.query('select count(*)::int n from transaction_attorney_lane_updates')).rows[0].n, 3)
    assert.equal((await db.query('select count(*)::int n from transaction_sync_command_receipts')).rows[0].n, 3, 'a sync failure rolls back both the comment and receipt')
    const privileges = (await db.query(`select has_function_privilege('anon',
      'bridge_add_attorney_task_comment_and_sync_v1(uuid,text,text,text,text)','execute') anonymous`)).rows[0]
    assert.equal(privileges.anonymous, false)
    console.log('Task comments: three-lane scope, privacy, durable receipts, retry and revoked permission PASS')
  } finally { await db.close() }
}

// Replay the real canonical command, rather than a comment-sync mock. Existing
// legal lanes must accept private comments even before a summary has been derived.
export async function verifyLegacyAttorneyTaskComments(PGlite) {
  const db = new PGlite(), actor = randomUUID(), matter = randomUUID()
  const migration = name => readFileSync(new URL('../../../supabase/migrations/' + name, import.meta.url), 'utf8')
  try {
    await db.exec(`
      create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;
      create function bridge_can_access_transaction_spine(uuid) returns boolean language sql as $$select true$$;
      create table profiles(id uuid primary key,role text); insert into profiles values('${actor}','attorney');
      create table comment_permissions(role text primary key,allowed boolean);
      create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql as $$select $3='internal_notes' and coalesce((select allowed from public.comment_permissions where role=$2),false)$$;
      create table transaction_subprocesses(id uuid primary key,transaction_id uuid,process_type text,status text default 'not_started');
      create table transaction_subprocess_steps(id uuid primary key,subprocess_id uuid,step_key text);
      create table transaction_rollups(transaction_id uuid primary key);
      create table transaction_workflow_evidence(id uuid primary key,transaction_id uuid);
      create table transaction_attorney_lane_updates(id uuid primary key default gen_random_uuid(),transaction_id uuid,subprocess_id uuid,lane_key text,attorney_role text,update_type text,visibility text,message text,created_by uuid,client_recipients jsonb,metadata jsonb);
      create table transaction_sync_action_catalog(action_key text primary key,owner_role text,canonical_event_type text,affected_lane text,default_visibility text,source_table text);
      create table transaction_sync_command_receipts(id uuid primary key default gen_random_uuid(),transaction_id uuid,action_key text,idempotency_key text,source_table text,source_record_id text,actor_id uuid,actor_role text,visibility text,audience_json jsonb,canonical_event_id uuid,transaction_version bigint,status text,outputs_json jsonb,completed_at timestamptz);
      create table transaction_events(id uuid primary key default gen_random_uuid(),transaction_id uuid,event_type text,event_data jsonb,created_by uuid,created_by_role text,visibility_scope text,created_at timestamptz default now());
      create table transaction_activity_projections(id uuid primary key default gen_random_uuid(),transaction_id uuid,command_receipt_id uuid,canonical_event_id uuid,canonical_event_type text,lane_key text,visibility text,audience_json jsonb,title text,description text,payload_json jsonb,occurred_at timestamptz);
      create table transaction_refresh_signals(transaction_id uuid primary key,version bigint,command_receipt_id uuid,canonical_event_id uuid,changed_at timestamptz);
      create table transaction_workflow_events(transaction_id uuid,workflow_key text,step_key text,action_key text,event_type text,payload_json jsonb,source text,created_by uuid);
      create table transaction_sync_projection_queue(transaction_id uuid,command_receipt_id uuid,status text,attempt_count int,completed_at timestamptz,updated_at timestamptz);
      create table transaction_workflow_instances(id uuid,transaction_id uuid,workflow_key text);
    `)
    const canonical = migration('20260829103738_transaction_sync_phase2_canonical_propagation.sql')
    const start = canonical.indexOf('create or replace function public.bridge_commit_transaction_sync_command_phase2(')
    const end = canonical.indexOf('\n$$;', start) + '\n$$;'.length
    assert.ok(start >= 0 && end > start)
    await db.exec(canonical.slice(start, end))
    await db.exec(migration('20261006160000_attorney_task_comment_scope.sql'))
    await db.exec(migration('20261006221500_attorney_comment_legacy_rollup_compatibility.sql'))
    for (const lane of ['transfer', 'bond', 'cancellation']) {
      const laneId = randomUUID(), task = lane + '_existing_task', command = randomUUID()
      await db.query('insert into transaction_subprocesses(id,transaction_id,process_type) values($1,$2,$3)', [laneId,matter,lane])
      await db.query('insert into transaction_subprocess_steps values($1,$2,$3)', [randomUUID(),laneId,task])
      await db.query('insert into comment_permissions values($1,true)', [lane+'_attorney'])
      const affected = {transfer:'transfer',bond:'bond_registration',cancellation:'seller_bond_cancellation'}[lane]
      await db.query('insert into transaction_sync_action_catalog values($1,$2,$3,$4,$5,$6)', [lane.toUpperCase()+'_ATTORNEY_COMMENT_ADDED',lane+'_attorney','AttorneyCommentAdded',affected,'internal','transaction_attorney_lane_updates'])
      const save = () => db.query('select bridge_add_attorney_task_comment_and_sync_v1($1,$2,$3,$4,$5) result', [matter,lane,'Private task note',command,task])
      const first = (await save()).rows[0].result, retry = (await save()).rows[0].result
      assert.equal(first.updateId,retry.updateId); assert.equal(retry.duplicate,true)
      assert.equal(first.sync.outputs.transaction_rollup,null,'a note must not fabricate a legal summary')
      const recorded = (await db.query('select * from transaction_activity_projections where command_receipt_id=$1',[first.sync.receiptId])).rows[0]
      assert.equal(recorded.visibility,'internal'); assert.deepEqual(recorded.audience_json,[lane+'_attorney']); assert.equal(recorded.payload_json.stepKey,task)
      await db.query('update comment_permissions set allowed=false where role=$1',[lane+'_attorney'])
      await assert.rejects(save(),/permission/,'replay must still respect revoked note access')
    }
    assert.equal((await db.query('select count(*)::int n from transaction_rollups')).rows[0].n,0)
    assert.equal((await db.query("select count(*)::int n from transaction_subprocesses where status<>'not_started'")).rows[0].n,0)
    assert.equal((await db.query('select count(*)::int n from transaction_sync_command_receipts')).rows[0].n,3)
    await db.exec("insert into transaction_sync_action_catalog values('TRANSFER_ATTORNEY_STAGE_UPDATED','transfer_attorney','StageUpdated','transfer','professional_shared','transaction_subprocesses')")
    const stage = () => db.query('select bridge_commit_transaction_sync_command_phase2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[matter,'TRANSFER_ATTORNEY_STAGE_UPDATED',randomUUID(),'transaction_subprocesses',matter.toString(),'internal',[], 'Stage update','Stage changed',null,null,{}])
    await assert.rejects(stage(),/Canonical transaction rollup is required/,'legal commands keep the original summary prerequisite')
    await db.query('insert into transaction_rollups values($1)',[matter]); await stage()
    console.log('Legacy task comments: real canonical commands, three lanes, missing summaries, privacy, retries and unchanged legal gates PASS')
  } finally { await db.close() }
}
