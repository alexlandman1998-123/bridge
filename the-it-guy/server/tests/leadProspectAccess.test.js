import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
const migration=await readFile(new URL('../../../supabase/migrations/20261021083842_close_remaining_rpc_scope_gaps.sql',import.meta.url),'utf8')
const schema=await readFile(new URL('./fixtures/remainingRpcScopeSchema.sql',import.meta.url),'utf8')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`

test('lead and prospect access is scoped while public capture and partner reuse work',async t=>{
 const db=new PGlite()
 const as=(role,sql,user=id(1),org=id(10),email='operator@example.invalid')=>db.transaction(async tx=>{
  await tx.query("select set_config('request.jwt.claims',$1,true),set_config('test.org',$2,true)",[JSON.stringify({sub:user,role,email}),org]);await tx.exec(`set local role ${role}`);return tx.query(sql)
 })
 try {
  await db.exec(schema)
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
   grant usage on schema public,auth to anon,authenticated,service_role;
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
   create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
   create function bridge_is_platform_admin() returns boolean language sql stable as $$select coalesce(auth.jwt()->'app_metadata'->>'role','')='platform_admin'$$;
   create function bridge_is_active_member(p uuid) returns boolean language sql stable as $$select auth.uid()='${id(1)}' and p::text=current_setting('test.org',true)$$;
   create function bridge_can_access_transaction_spine(p uuid) returns boolean language sql stable as $$select exists(select 1 from public.transactions where id=p and public.bridge_is_active_member(organisation_id))$$;
   create function bridge_partner_prospect_role(p text) returns text language sql as $$select p$$;
   create function bridge_partner_prospect_key(p text) returns text language sql as $$select lower(p)$$;
   create table organisations(id uuid,name text,display_name text,type text,logo_url text);
   create table invites(id uuid default gen_random_uuid(),token text,status text,expires_at timestamptz,revoked_at timestamptz,
    invite_type text,inviter_user_id uuid,target_workspace_id uuid,target_workspace_role text,target_transaction_id uuid,target_transaction_role text,
    target_branch_id uuid,target_team_id uuid,email text,phone text,invitee_user_id uuid,metadata jsonb,accepted_at timestamptz,accepted_by_user_id uuid,revoked_by_user_id uuid,created_at timestamptz,updated_at timestamptz);
   create table profiles(id uuid,role text);
   create table transaction_participants(transaction_id uuid,user_id uuid,status text,removed_at timestamptz,participant_email text);
  `)
  await db.exec(`create table synthetic_events(kind text);
   create function bridge_log_partner_prospect_event(uuid,uuid,uuid,text,uuid,jsonb)returns void language sql security definer as $$insert into synthetic_events values('prospect')$$;
   create function bridge_log_transaction_partner_invitation_event(uuid,text,uuid,jsonb)returns void language sql security definer as $$insert into synthetic_events values('invitation')$$;
   create function bridge_transaction_partner_invite_role_shape(text)returns table(role_type text,legal_role text,transaction_role text)language sql as $$select 'attorney'::text,'transfer'::text,'transfer_attorney'::text$$;
   create table transaction_user_access(id uuid default gen_random_uuid(),transaction_id uuid,user_id uuid,access_role text,updated_at timestamptz,unique(transaction_id,user_id,access_role));
   alter table transaction_participants add column id uuid default gen_random_uuid(),add column role_type text,add column legal_role text,add column transaction_role text,
    add column participant_name text,add column invited_by_user_id uuid,add column invited_at timestamptz,add column accepted_at timestamptz,
    add column visibility_scope text,add column is_internal boolean,add column participant_scope text,add column assignment_source text,add column partner_prospect_id uuid,
    add column can_view boolean,add column can_comment boolean,add column can_upload_documents boolean,add column can_edit_finance_workflow boolean,
    add column can_edit_attorney_workflow boolean,add column can_edit_core_transaction boolean,add column updated_at timestamptz,
    add constraint participant_role_unique unique(transaction_id,role_type,legal_role);
   create table transaction_role_players(transaction_id uuid,role_type text,selection_source text,partner_prospect_id uuid,partner_name text,contact_person text,email_address text,phone_number text,
    status text,assignment_status text,user_id uuid,assigned_user_id uuid,assigned_by uuid,snapshot_json jsonb,created_at timestamptz,updated_at timestamptz,removed_at timestamptz);
   create unique index role_player_active on transaction_role_players(transaction_id,role_type)where removed_at is null;
  `)
  await db.exec(`insert into profiles values('${id(1)}','agent'),('${id(2)}','agent');
   insert into transactions(id,organisation_id,owner_user_id)values('${id(20)}','${id(10)}','${id(1)}'),('${id(21)}','${id(11)}','${id(2)}');
   insert into transaction_partner_invitations(id,transaction_id)values('${id(25)}','${id(20)}'),('${id(26)}','${id(21)}');
   insert into transaction_bond_application_export_packages(id,transaction_id)values('${id(30)}','${id(20)}'),('${id(31)}','${id(21)}');
   insert into transaction_bond_originator_one_originator_pilots(id,status,pilot_package_ids_json)values('${id(40)}','active','["${id(30)}"]'),('${id(41)}','active','["${id(31)}"]');
   insert into transaction_bond_originator_multi_originator_rollouts(id,status,rollout_package_ids_json)values('${id(50)}','active','["${id(30)}"]'),('${id(51)}','active','["${id(31)}"]');
   insert into referral_invites(id,referral_id,token,status,expires_at)values
   ('${id(60)}','${id(70)}','valid-link','sent',now()+interval '1 day'),
   ('${id(61)}','${id(70)}','expired-link','accepted',now()-interval '1 day'),
   ('${id(62)}','${id(70)}','revoked-link','revoked',now()+interval '1 day');
   insert into lead_referrals(id)values('${id(70)}');
   insert into invites(token,status,email,expires_at,revoked_at)values('invite-valid','pending','synthetic@example.invalid',now()+interval '1 day',null),('invite-expired','accepted','synthetic@example.invalid',now()-interval '1 day',null),('invite-revoked','pending','synthetic@example.invalid',now()+interval '1 day',now());
  `)
  // Dummy internal implementations make ACL and owner-call behavior observable without production side effects.
  const names=[...migration.matchAll(/p\.proname=ANY\(ARRAY\[([\s\S]*?)\]\)/g)][0][1].match(/'([^']+)'/g).map(x=>x.slice(1,-1))
  for(const name of names)await db.exec(`create function public.${name}()returns text language sql security definer as $$select 'internal-ok'::text$$`)
  await db.exec(`create function guarded_invite_parent()returns text language sql security definer as $$select bridge_record_invite_event()$$`)
  await db.exec(migration)
  await db.exec(`
   create function public.arch9_admin_access_level()returns jsonb language sql stable as $$select jsonb_build_object('level',case when auth.uid() is null then '' when auth.jwt()->'app_metadata'->>'role'='executive' then 'executive' when auth.jwt()->'app_metadata'->>'role'='customer_support' then 'customer_support' else '' end)$$;
   create or replace function bridge_is_active_member(p uuid)returns boolean language sql stable as $$select (auth.uid()='${id(1)}' and p='${id(10)}')or(auth.uid()='${id(2)}' and p='${id(11)}')$$;
   create table partner_prospect_events(id uuid default gen_random_uuid(),partner_prospect_id uuid,transaction_id uuid);
   create table launch_event_leads(id uuid default gen_random_uuid(),event_slug text,status text,source text,full_name text);
   create table launch_event_referral_clicks(id uuid default gen_random_uuid(),event_slug text,source text,action text);
   create table areas(id uuid default gen_random_uuid(),name text);
   create table area_aliases(id uuid default gen_random_uuid(),name text);
   alter table partner_prospects enable row level security;
   alter table partner_prospect_events enable row level security;
   alter table launch_event_leads enable row level security;
   alter table launch_event_referral_clicks enable row level security;
   alter table areas enable row level security;
   alter table area_aliases enable row level security;
   grant select,insert,update on all tables in schema public to authenticated,anon;
   create policy public_capture on launch_event_leads for insert to anon,authenticated with check(event_slug='event' and status='new' and source='qr');
   create policy public_click on launch_event_referral_clicks for insert to anon,authenticated with check(event_slug='event' and source='success' and action='copy_link');
   create policy public_areas on areas for select using(true);
   create policy public_aliases on area_aliases for select using(true);
   insert into launch_event_leads values('${id(80)}','event','new','qr','Synthetic Lead');
   insert into launch_event_referral_clicks values('${id(81)}','event','success','copy_link');
   insert into areas values('${id(82)}','Synthetic Area');
   insert into partner_prospects(id,role_type,company_name,company_key,organisation_id,created_by,invitation_count,transaction_count,created_at)values
   ('${id(90)}','attorney','Existing Firm','existing','${id(10)}','${id(1)}',0,0,now()),
   ('${id(91)}','attorney','Other Firm','other','${id(11)}','${id(2)}',0,0,now());
   insert into partner_prospect_events(partner_prospect_id,transaction_id)values('${id(90)}',null),('${id(91)}',null);
  `)
  const correction=await readFile(new URL('../../../supabase/migrations/20261021110538_restrict_lead_prospect_and_catalogue_access.sql',import.meta.url),'utf8')
  // The exact-production-definition guard is exercised by the hosted rollback rehearsal.
  await db.exec(correction.replace(/DO \$review\$ BEGIN[\s\S]*?END \$review\$;/,''))
  const actor=(role,sql,user=id(99),app={},userMetadata={})=>db.transaction(async tx=>{
   await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:role==='anon'?null:user,email:'fixture@example.invalid',app_metadata:app,user_metadata:userMetadata})]);await tx.exec(`set local role ${role}`);return tx.query(sql)
  })
  const count=(table)=>`select count(*)::int n from ${table}`
  await t.test('unrelated and anonymous users cannot read launch leads, prospects or null-transaction events',async()=>{
   for(const role of ['anon','authenticated'])for(const table of ['launch_event_leads','launch_event_referral_clicks','partner_prospects','partner_prospect_events'])assert.equal((await actor(role,count(table))).rows[0].n,0)
   assert.equal((await actor('authenticated',count('launch_event_leads'),id(99),{},{role:'executive'})).rows[0].n,0)
  })
  await t.test('executives and support keep intended reads while only executives update lead records',async()=>{
   for(const role of ['executive','customer_support'])assert.equal((await actor('authenticated',count('launch_event_leads'),id(99),{role})).rows[0].n,1)
   for(const role of ['', 'customer_support'])assert.equal((await actor('authenticated',`update launch_event_leads set status='contacted' returning id`,id(99),{role})).rows.length,0)
   assert.equal((await actor('authenticated',`update launch_event_leads set status='contacted' returning id`,id(99),{role:'executive'})).rows.length,1)
  })
  await t.test('public event capture and referral clicks remain write-only',async()=>{
   await actor('anon',`insert into launch_event_leads(event_slug,status,source,full_name)values('event','new','qr','Synthetic visitor')`)
   await actor('anon',`insert into launch_event_referral_clicks(event_slug,source,action)values('event','success','copy_link')`)
   await assert.rejects(actor('anon',`insert into launch_event_leads(event_slug,status,source)values('event','contacted','qr')`),/row-level security/)
   assert.equal((await actor('anon',count('launch_event_leads'))).rows[0].n,0)
  })
  await t.test('members see their own organisation prospects and events, not another organisation',async()=>{
   for(const [user,prospect]of [[id(1),id(90)],[id(2),id(91)]]){
    assert.deepEqual((await actor('authenticated','select id from partner_prospects order by id',user)).rows.map(x=>x.id),[prospect])
    assert.equal((await actor('authenticated',count('partner_prospect_events'),user)).rows[0].n,1)
   }
  })
  await t.test('cross-organisation prospect reuse is denied before granting transaction access',async()=>{
   await assert.rejects(actor('authenticated',`select bridge_use_partner_prospect_on_transaction('${id(20)}','${id(91)}','attorney')`,id(1)),/Partner prospect access required/)
   assert.equal((await db.query('select count(*)::int n from transaction_user_access')).rows[0].n,0)
  })
  await t.test('the same company can be invited independently by two organisations without sharing contacts',async()=>{
   const up=(tx,invite,user,email)=>`select bridge_upsert_partner_prospect_for_invitation('${tx}','${invite}','attorney','Same Firm','Synthetic Partner','${email}',null,'${user}') result`
   const first=(await actor('authenticated',up(id(20),id(25),id(1),'first@example.invalid'),id(1))).rows[0].result
   const second=(await actor('authenticated',up(id(21),id(26),id(2),'second@example.invalid'),id(2))).rows[0].result
   assert.equal(first.success,true);assert.equal(second.success,true);assert.notEqual(first.prospect.id,second.prospect.id)
   assert.equal(first.prospect.organisation_id,id(10));assert.equal(second.prospect.organisation_id,id(11))
   assert.equal((await actor('authenticated',`select email from partner_prospects where id='${first.prospect.id}'`,id(1))).rows[0].email,'first@example.invalid')
   await db.query("update partner_prospects set status='joined',bridge_user_id=$1 where id=$2",[id(3),first.prospect.id])
   const used=(await actor('authenticated',`select bridge_use_partner_prospect_on_transaction('${id(20)}','${first.prospect.id}','attorney') result`,id(1))).rows[0].result
   assert.equal(used.success,true);assert.equal(used.accessGranted,true)
  })
  await t.test('public location lookup survives while unrelated accounts cannot edit shared reference data',async()=>{
   assert.equal((await actor('anon',count('areas'))).rows[0].n,1)
   await assert.rejects(actor('authenticated',"insert into areas(name)values('unauthorized')"),/row-level security/)
   assert.equal((await actor('authenticated',"update areas set name='unauthorized' returning id")).rows.length,0)
   await actor('authenticated',"insert into areas(name)values('Synthetic operator area')",id(99),{role:'executive'})
  })
 }finally{await db.close()}
})
