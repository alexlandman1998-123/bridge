import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('ordinary-agent inbox referral preserves history and rejects unauthorized transfers', async () => {
 const db=new PGlite()
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
 const [org,foreign,owner,matt,outsider,principal,listing,lead,otherLead]=Array.from({length:9},(_,i)=>id(i+1))
 const actor=user=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${user}',false);set role authenticated`)
 const refer=(target=lead,expected=matt)=>db.query('select public.bridge_inbox_refer_listing_lead($1,$2,$3,$4) receipt',[org,target,listing,expected])
 try {
  await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,private to authenticated;
   create table organisations(id uuid primary key,type text);
   create table organisation_users(id uuid primary key,user_id uuid,organisation_id uuid,membership_status text,status text,workspace_role text,role text,email text);
   create function public.bridge_agency_open_operations(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.organisation_users where user_id=auth.uid() and organisation_id=p_org and workspace_role='principal' and membership_status='active')$$;
   create table private_listings(id uuid primary key,organisation_id uuid,assigned_agent_id uuid);
   create table leads(lead_id uuid primary key,organisation_id uuid,listing_id text,lead_domain text default 'agency',assigned_user_id uuid,assigned_agent_id uuid,assigned_agent_email text,assigned_queue_id text,assigned_at timestamptz,ownership_status text,sla_due_at timestamptz,updated_at timestamptz,is_demo_data boolean default true);
   create table lead_assignment_history(assignment_id uuid primary key default gen_random_uuid(),organisation_id uuid,lead_id uuid,previous_agent_id uuid,new_agent_id uuid,previous_queue_id text,new_queue_id text,reason text,assignment_source text,assigned_by uuid,created_at timestamptz default now());
   create table lead_activities(activity_id uuid primary key default gen_random_uuid(),organisation_id uuid,lead_id uuid,activity_type text,activity_note text,outcome text,activity_date timestamptz,is_demo_data boolean);
   grant select,update on leads to authenticated;alter table leads enable row level security;
   create policy own_lead on leads for all to authenticated using(assigned_user_id=auth.uid()) with check(assigned_user_id=auth.uid());
   insert into organisations values('${org}','agency'),('${foreign}','agency');
   insert into organisation_users values('${id(11)}','${owner}','${org}','active','active','agent','agent','owner@example.test'),('${id(12)}','${matt}','${org}','active','active','agent','agent','matt@example.test'),('${id(13)}','${outsider}','${foreign}','active','active','agent','agent','outsider@example.test'),('${id(14)}','${principal}','${org}','active','active','principal','principal','principal@example.test');
   insert into private_listings values('${listing}','${org}','${matt}');
   insert into leads(lead_id,organisation_id,listing_id,assigned_user_id,assigned_agent_id) values('${lead}','${org}','${listing}','${owner}','${owner}'),('${otherLead}','${org}','${listing}','${principal}','${principal}');
   insert into lead_activities(organisation_id,lead_id,activity_type,activity_note) values('${org}','${lead}','Email received','Original inbox history');`)
  await db.exec(await readFile(new URL('../../../supabase/migrations/20261118182500_inbox_listing_lead_referral.sql',import.meta.url),'utf8'))
  await actor(owner)
  await assert.rejects(db.query('update leads set assigned_user_id=$1 where lead_id=$2',[matt,lead]),/row-level security/)
  await assert.rejects(refer(lead,owner),/listing agent changed/)
  await assert.rejects(refer(otherLead),/current lead owner/)
  await actor(outsider);await assert.rejects(refer(),/membership/)
  await actor(owner)
  const receipt=(await refer()).rows[0].receipt
  assert.equal(receipt.agentId,matt);assert.equal(receipt.alreadyReferred,false)
  assert.equal((await db.query('select * from leads where lead_id=$1',[lead])).rows.length,0)
  assert.equal((await refer()).rows[0].receipt.assignmentId,receipt.assignmentId)
  await actor(matt)
  assert.equal((await db.query('select assigned_agent_id from leads where lead_id=$1',[lead])).rows[0].assigned_agent_id,matt)
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::int n from lead_assignment_history where lead_id=$1',[lead])).rows[0].n,1)
  assert.equal((await db.query('select count(*)::int n from lead_activities where lead_id=$1',[lead])).rows[0].n,2)
  await db.exec(`create function reject_referral_audit() returns trigger language plpgsql as $$begin raise exception 'Audit unavailable';end$$;create trigger refuse_audit before insert on lead_assignment_history for each row execute function reject_referral_audit();`)
  await actor(principal);await assert.rejects(refer(otherLead),/Audit unavailable/)
  await db.exec('reset role');assert.equal((await db.query('select assigned_user_id from leads where lead_id=$1',[otherLead])).rows[0].assigned_user_id,principal)
  await db.exec('drop trigger refuse_audit on lead_assignment_history;set role anon')
  await assert.rejects(refer(),/permission denied/)
  await db.exec(`reset role;update organisation_users set membership_status='inactive',status='inactive' where user_id='${matt}'`)
  await actor(principal);await assert.rejects(refer(otherLead),/not an active/)
 } finally {await db.close()}
})
