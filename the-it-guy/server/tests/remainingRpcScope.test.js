import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
const migration=await readFile(new URL('../../../supabase/migrations/20261021083842_close_remaining_rpc_scope_gaps.sql',import.meta.url),'utf8')
const schema=await readFile(new URL('./fixtures/remainingRpcScopeSchema.sql',import.meta.url),'utf8')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`

test('remaining RPC scope correction rejects cross-tenant access and preserves authorised operations',async t=>{
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
  await t.test('internal audit, queue and assignment lookups reject both browser roles; guarded parents retain access',async()=>{
   for(const name of names)for(const role of ['anon','authenticated'])await assert.rejects(as(role,`select ${name}()`),/permission denied/)
   assert.equal((await as('service_role','select bridge_record_invite_event() result')).rows[0].result,'internal-ok')
   assert.equal((await as('authenticated','select guarded_invite_parent() result')).rows[0].result,'internal-ok')
  })
  await t.test('blank JWT email cannot match blank assignee or participant email',async()=>{
   assert.equal((await as('authenticated',`select bridge_can_manage_transaction_role_players('${id(21)}') allowed`,id(1),id(10),'')).rows[0].allowed,false)
   assert.equal((await as('authenticated',`select bridge_can_manage_transaction_role_players('${id(20)}') allowed`,id(1),id(10),'')).rows[0].allowed,true)
  })
  await t.test('partner prospect writes require transaction authority and bind invite and actor',async()=>{
   const use=tx=>`select bridge_use_partner_prospect_on_transaction('${tx}','${id(99)}','attorney') result`
   await assert.rejects(as('anon',use(id(20))),/permission denied/)
   await assert.rejects(as('authenticated',use(id(21))),/Transaction partner management authority/)
   assert.equal((await as('authenticated',use(id(20)))).rows[0].result.code,'prospect_not_found')
   const up=(invite,actor)=>`select bridge_upsert_partner_prospect_for_invitation('${id(20)}','${invite}','attorney',null,null,null,null,'${actor}')`
   await assert.rejects(as('authenticated',up(id(26),id(1))),/Invitation must belong/)
   await assert.rejects(as('authenticated',up(id(25),id(2))),/actor must match/)
   await assert.rejects(as('authenticated',up(id(25),id(1))),/company name is required/)
  })
  await t.test('authorised invitation save and partner reuse still persist the normal access records',async()=>{
   const saved=(await as('authenticated',`select bridge_upsert_partner_prospect_for_invitation('${id(20)}','${id(25)}','attorney','Synthetic Firm','Synthetic Partner','partner@example.invalid',null,'${id(1)}') result`)).rows[0].result
   assert.equal(saved.success,true)
   const prospect=saved.prospect.id
   await db.query("update partner_prospects set status='joined',bridge_user_id=$1 where id=$2",[id(3),prospect])
   const used=(await as('authenticated',`select bridge_use_partner_prospect_on_transaction('${id(20)}','${prospect}','attorney') result`)).rows[0].result
   assert.equal(used.success,true);assert.equal(used.accessGranted,true)
   assert.equal((await db.query('select count(*)::int n from transaction_user_access')).rows[0].n,1)
   await assert.rejects(as('authenticated',`select bridge_use_partner_prospect_on_transaction('${id(21)}','${prospect}','attorney')`),/Transaction partner management authority/)
   assert.equal((await db.query('select count(*)::int n from transaction_user_access')).rows[0].n,1)
  })
  await t.test('pilot controls reject anonymous and unrelated operators and preserve own-org pause',async()=>{
   const pause=(pilot,actor=id(1))=>`select bridge_pause_bond_originator_one_originator_pilot('${pilot}','${actor}','Synthetic pause') result`
   await assert.rejects(as('anon',pause(id(40))),/permission denied/)
   await assert.rejects(as('authenticated',pause(id(41))),/Pilot package authority/)
   await assert.rejects(as('authenticated',pause(id(40),id(2))),/authenticated internal user/)
   assert.equal((await as('authenticated',pause(id(40)))).rows[0].result,id(40))
   await assert.rejects(as('authenticated',`select bridge_pause_bond_originator_multi_originator_rollout('${id(51)}','${id(1)}',null)`),/Pilot package authority/)
   assert.equal((await as('authenticated',`select bridge_pause_bond_originator_multi_originator_rollout('${id(50)}','${id(1)}',null) result`)).rows[0].result,id(50))
   assert.equal((await as('service_role',pause(id(41),id(2)))).rows[0].result,id(41))
   await assert.rejects(as('authenticated',`select bridge_record_bond_originator_operational_incident('${id(40)}','low','Test','Test',null,'${id(2)}')`),/actor must match/)
   await assert.rejects(as('authenticated',`select bridge_create_bond_originator_operational_hardening_report('${id(40)}','healthy','{}','[]','${id(2)}')`),/actor must match/)
  })
  await t.test('package authority rejects empty, unknown and mixed-tenant package sets',async()=>{
   // A SECURITY DEFINER parent has the same privilege context as the public guarded commands.
   await db.exec(`create function synthetic_pilot_parent(ids jsonb)returns boolean language plpgsql security definer as $$begin perform private.bridge_assert_pilot_package_authority(ids);return true;end$$`)
   for(const ids of [[],[id(99)],[id(30),id(31)]])await assert.rejects(as('authenticated',`select synthetic_pilot_parent('${JSON.stringify(ids)}')`),/Pilot package authority/)
   assert.equal((await as('authenticated',`select synthetic_pilot_parent('["${id(30)}"]') allowed`)).rows[0].allowed,true)
   await assert.rejects(as('authenticated',`select private.bridge_assert_pilot_package_authority('["${id(30)}"]')`),/permission denied/)
  })
  await t.test('expired and revoked referral credentials return no client or commission data',async()=>{
   for(const token of ['expired-link','revoked-link','invented']){
    const result=(await as('anon',`select bridge_lookup_referral_invite_by_token('${token}') result`)).rows[0].result
    assert.equal(result.success,false);assert.equal(result.referral,undefined);assert.equal(result.client,undefined)
   }
   const valid=(await as('anon',"select bridge_lookup_referral_invite_by_token('valid-link') result")).rows[0].result
   assert.equal(valid.success,true);assert.equal(valid.referral.id,id(70))
  })
  await t.test('revoked and expired onboarding invitations disclose no recipient metadata',async()=>{
   for(const token of ['invite-expired','invite-revoked']){
    const result=(await as('anon',`select bridge_lookup_invite_by_token('${token}') result`)).rows[0].result
    assert.equal(result.success,false);assert.equal(result.invite,undefined)
   }
   assert.equal((await as('anon',"select bridge_lookup_invite_by_token('invite-valid') result")).rows[0].result.invite.email,'synthetic@example.invalid')
  })
  await t.test('correction is safe to reapply',async()=>{await db.exec(migration)})
 }finally{await db.close()}
})
