import { readFileSync } from 'node:fs'
import { accessMigration, id, transactionActorAccessFixture } from './transaction-actor-access.mjs'

export const lifecycleMigration = readFileSync(new URL('../../../supabase/migrations/20261108175717_transaction_lifecycle_atomic_receipts.sql', import.meta.url), 'utf8')
export async function transactionLifecycleFixture() {
  const db = await transactionActorAccessFixture()
  await db.exec(`
    create schema journey_private; create schema storage;
    create function auth.role() returns text language sql stable as $$select coalesce(auth.jwt()->>'role','anon')$$;
    create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql stable as $$select auth.uid()='${id(5)}'::uuid and $1='${id(100)}'::uuid and $2='transfer_attorney'$$;
    alter table organisation_users add column app_role text;
    update organisation_users set app_role='developer' where user_id='${id(2)}';
    alter table transactions add column unit_id uuid,add column listing_id uuid,
      add column registered_at timestamptz,add column registration_date date,add column title_deed_number text,
      add column registration_confirmation_document_id uuid,add column registered_by_user_id uuid,
      add column stage text,add column current_main_stage text,add column lifecycle_state text default 'active',
      add column completed_at timestamptz,add column completed_by_user_id uuid,add column attorney_stage text,
      add column cancelled_at timestamptz,add column cancelled_by_user_id uuid,add column cancelled_reason text,
      add column archived_at timestamptz,add column archived_by_user_id uuid,add column archive_reason text,
      add column last_meaningful_activity_at timestamptz,add column updated_at timestamptz,
      add column registration_reversal_reason text,add column registration_reversed_at timestamptz,
      add column finance_type text default 'cash',add column routing_profile_json jsonb default '{}',add column is_active boolean default true;
    alter table documents add column document_type text default 'registration_confirmation',add column category text,
      add column file_bucket text default 'documents',add column file_path text,add column status text default 'uploaded';
    update documents set file_path='proof-'||transaction_id::text||'.pdf';
    create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
    insert into storage.objects select file_bucket,file_path from documents;
    create table transaction_workflow_instances(id uuid primary key default gen_random_uuid(),transaction_id uuid,workflow_key text,status text,completed_at timestamptz,updated_at timestamptz);
    create table transaction_workflow_steps(id uuid primary key default gen_random_uuid(),workflow_instance_id uuid,transaction_id uuid,workflow_key text,step_key text,status text,required boolean default true,completed_at timestamptz,completed_by uuid,updated_at timestamptz);
    create table transaction_workflow_evidence(id uuid primary key default gen_random_uuid(),transaction_id uuid,workflow_step_id uuid,workflow_key text,step_key text,evidence_type text,evidence_id text,evidence_status text,unique(workflow_step_id,evidence_type,evidence_id));
    create table transaction_workflow_events(id uuid primary key default gen_random_uuid(),transaction_id uuid,workflow_key text,step_key text,action_key text,event_type text,new_status text,payload_json jsonb,source text,created_by uuid);
    create table transaction_events(id uuid primary key default gen_random_uuid(),transaction_id uuid,event_type text,created_by uuid,created_by_role text,event_data jsonb);
    create table transaction_lifecycle_workflows(id uuid primary key default gen_random_uuid(),transaction_id uuid unique,current_stage text,status text,last_updated_by uuid,last_updated_at timestamptz,completed_at timestamptz,updated_at timestamptz);
    create table transaction_subprocesses(id uuid primary key,transaction_id uuid,process_type text);
    create table transaction_subprocess_steps(id uuid primary key,subprocess_id uuid,step_key text,status text);
    create table transaction_attorney_closeouts(transaction_id uuid,close_out_status text);
    create table transaction_bond_closeouts(transaction_id uuid,close_out_status text);
    insert into transaction_workflow_instances(transaction_id,workflow_key,status)
      select '${id(100)}'::uuid,key,'active' from unnest(array['sales_otp','finance_cash','attorney_transfer','registration']) key;
    insert into transaction_workflow_steps(transaction_id,workflow_instance_id,workflow_key,step_key,status)
      select transaction_id,id,workflow_key,case when workflow_key='registration' then 'registration_confirmed' else 'ready' end,
      case when workflow_key='registration' then 'not_started' else 'complete' end from transaction_workflow_instances;
    update transactions set assigned_attorney_email='lawyer@example.test' where id='${id(100)}';
    grant select on organisation_users to authenticated;
  `)
  for (const table of ['transaction_workflow_instances', 'transaction_workflow_steps', 'transaction_workflow_evidence', 'transaction_workflow_events', 'transaction_events', 'transaction_lifecycle_workflows']) {
    await db.exec(`alter table ${table} enable row level security;create policy actor_scope on ${table} for all to authenticated using(bridge_can_access_transaction_spine(transaction_id)) with check(bridge_can_access_transaction_spine(transaction_id));grant select,insert,update on ${table} to authenticated;`)
  }
  // Match production's narrower coordinator projection boundary. Organisation
  // membership alone does not satisfy that old policy; the new lifecycle actor
  // policies must close the permission gap without granting ordinary viewers.
  await db.exec(`drop policy actor_scope on transaction_lifecycle_workflows;
    create policy existing_coordinator on transaction_lifecycle_workflows for all to authenticated
      using(auth.uid()='${id(5)}'::uuid) with check(auth.uid()='${id(5)}'::uuid);`)
  await db.exec(accessMigration)
  for (const name of ['20261104174321_transaction_registration_actor_boundary.sql', '20261104175807_transaction_registration_readiness_boundary.sql', '20261104180554_registered_confirmation_integrity.sql', '20261104195411_registration_proof_explicit_type_exclusion.sql']) {
    await db.exec(readFileSync(new URL('../../../supabase/migrations/' + name, import.meta.url), 'utf8'))
  }
  await db.exec(lifecycleMigration)
  return db
}

export async function lifecycleRpc(db, action = 'register', options = {}) {
  const result = await db.query('select bridge_commit_transaction_lifecycle($1,$2,$3::date,$4,$5) receipt', [
    options.transactionId || id(100), action, options.registrationDate || '2026-11-08', options.titleDeedNumber || 'T-FIXTURE-1', options.documentId || id(103),
  ])
  return result.rows[0].receipt
}
