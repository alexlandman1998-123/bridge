import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createEmailCampaignDatabase} from '../../scripts/fixtures/emailCampaignDatabase.mjs'
const {db,org,other,user,one,shared,foundation}=await createEmailCampaignDatabase()
const read=name=>readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')
const fn=(sql,name)=>{const at=sql.indexOf('function public.'+name+'(');assert.ok(at>=0,name);return sql.slice(sql.lastIndexOf('create ',at),sql.indexOf('$$;',at)+3)}
const staff='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',colleague='cccccccc-cccc-4ccc-8ccc-cccccccccccc',outsider='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
let assertions=0
const check=(actual,expected)=>{assert.deepEqual(actual,expected);assertions++}
const actor=async(id=user)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.query("select set_config('test.org',$1,false)",[id===outsider?other:org]);await db.exec('set role authenticated')}
const service=()=>db.exec('reset role;set role service_role')
const denied=async promise=>{await assert.rejects(promise,/permission denied|server-maintained|Only CRM|row-level security/);assertions++}
try {
 await db.exec(`reset role;
 alter table organisations add column type text default 'agency';
 create table organisation_users(id uuid primary key default gen_random_uuid(),user_id uuid,organisation_id uuid,workspace_role text,membership_status text,status text);
 create function bridge_agency_open_operations(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organisation_users where organisation_id=p_org and user_id=auth.uid() and membership_status='active' and workspace_role='owner') $$;
 create function bridge_agency_record_scope(p_org uuid,p_user uuid,p_agent uuid default null,p_owner uuid default null) returns boolean language sql stable security definer set search_path='' as $$ select public.bridge_agency_open_operations(p_org) or exists(select 1 from public.organisation_users where organisation_id=p_org and user_id=auth.uid() and membership_status='active' and coalesce(p_user,p_agent,p_owner)=user_id) $$;
 create or replace function bridge_has_organisation_membership(id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organisation_users where organisation_id=$1 and user_id=auth.uid() and membership_status='active') $$;
 create or replace function email_campaign_can_send(p_organisation_id uuid) returns boolean language sql stable as $$ select public.bridge_agency_open_operations(p_organisation_id) $$;
 create table contacts(contact_id uuid primary key default gen_random_uuid(),organisation_id uuid,assigned_agent_id uuid,first_name text,last_name text,email text,phone text,contact_type text,created_at timestamptz default now(),updated_at timestamptz default now(),is_demo_data boolean default false,demo_metadata jsonb);
 create table leads(lead_id uuid primary key default gen_random_uuid(),organisation_id uuid,contact_id uuid,assigned_user_id uuid,assigned_agent_id uuid,branch_id uuid,stage text,area_interest text,lead_domain text default 'agency',created_at timestamptz default now(),updated_at timestamptz default now(),is_demo_data boolean default false);
 create table buyers(id uuid primary key,organisation_id uuid,name text,email text,phone text,created_at timestamptz default now());
 create table canvassing_prospects(id uuid primary key,organisation_id uuid,assigned_user_id uuid,assigned_agent_id uuid,first_name text,last_name text,email text,phone text,created_at timestamptz default now());
 create table transactions(id uuid primary key,organisation_id uuid,assigned_user_id uuid,assigned_agent_id uuid,owner_user_id uuid,buyer_id uuid,seller_name text,seller_email text,seller_phone text,created_at timestamptz default now());
 create table private_listings(id uuid primary key,organisation_id uuid,assigned_agent_id uuid,seller_canonical_facts_json jsonb,seller_lead_id uuid,created_at timestamptz default now());
 create table private_listing_seller_onboarding(id uuid primary key,private_listing_id uuid,form_data jsonb,canonical_facts_json jsonb);
 grant all on organisation_users,contacts,leads,buyers,canvassing_prospects,transactions,private_listings,private_listing_seller_onboarding to service_role;
 `)
 for(const [id,scope,role] of [[user,org,'owner'],[staff,org,'agent'],[colleague,org,'agent'],[outsider,other,'owner']]) {
  await db.query('insert into auth.users values($1) on conflict do nothing',[id]);await db.query("insert into organisation_users(user_id,organisation_id,workspace_role,membership_status,status) values($1,$2,$3,'active','active')",[id,scope,role])
 }
 await db.exec(read('20261009113042_agency_client_identity_and_reviewed_merge.sql'))
 for(const [file,names] of [['20260918134000_dynamic_email_audiences_phase1.sql',['email_audience_rule_matches']],['20260918143000_dynamic_audience_campaign_delivery.sql',['email_campaign_resolve_audience_rules']]]) for(const name of names) await db.exec(fn(read(file),name))
 const add=async(email,assigned=staff,extra={})=>one('insert into contacts(organisation_id,assigned_agent_id,first_name,email,contact_type,updated_at,is_demo_data,demo_metadata) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',[extra.org||org,assigned,extra.name||'Synthetic',email,extra.type||'buyer',extra.updated||'2026-11-05T10:00:00Z',extra.demo||false,extra.metadata||null])
 const a=await add('PERSON@example.com'),b=await add(' person@example.com ',staff,{name:'Latest',updated:'2026-11-05T11:00:00Z'})
 check((await one('select count(*)::integer n from email_marketing_contacts')).n,0)
 await db.exec(fn(foundation,'email_campaign_quote_usage'))
 await db.exec(read('20261105181651_client_audience_feed_repair.sql'))
 check((await one('select count(*)::integer n from email_marketing_contacts')).n,0) // no unreviewed backfill
 await service();check((await one('select email_campaign_refresh_contact_projection($1) n',[org])).n,2)
 let projected=await one('select * from email_marketing_contacts where organisation_id=$1',[org])
 check(projected.email,'person@example.com');check(projected.full_name,'Latest');check((await one('select count(*)::integer n from email_marketing_contact_sources')).n,2)
 await actor(staff);check((await one("select email_audience_preview($1,'{}') result",[org])).result.count,1)
 await db.query("update email_marketing_contacts set tags=array['retained'] where id=$1",[projected.id])
 await denied(db.query("update email_marketing_contacts set source_type='manual' where id=$1",[projected.id]))
 await denied(db.query('select email_campaign_refresh_contact_projection($1)',[org]))
 await service();await add('private@example.com',colleague);await add('new@example.com')
 check((await one('select count(*)::integer n from email_marketing_contacts')).n,3)
 await actor(staff);check((await one("select email_audience_preview($1,'{}') result",[org])).result.count,2)
 await actor(outsider);check((await one('select count(*)::integer n from email_marketing_contacts where organisation_id=$1',[org])).n,0)
 await actor(user);check((await one("select email_audience_preview($1,'{}') result",[org])).result.count,3)
 await service();await add('invalid-address');await add('demo@example.com',staff,{demo:true});await add('seed@example.com',staff,{metadata:{seedData:true}})
 check((await one("select count(*)::integer n from email_marketing_contacts where email in ('invalid-address','demo@example.com','seed@example.com')")).n,0)
 const legal=await add('legal@example.com');await db.query("insert into leads(organisation_id,contact_id,assigned_user_id,lead_domain) values($1,$2,$3,'legal')",[org,legal.contact_id,staff])
 check((await one("select is_valid_email from email_marketing_contacts where email='legal@example.com'")).is_valid_email,false)
 await db.query("update contacts set email='changed@example.com' where email='new@example.com'")
 check((await one("select is_valid_email from email_marketing_contacts where email='new@example.com'")).is_valid_email,false)
 check((await one("select is_valid_email from email_marketing_contacts where email='changed@example.com'")).is_valid_email,true)
 check((await one('select tags from email_marketing_contacts where id=$1',[projected.id])).tags,['retained'])
 check((await one('select count(*)::integer n from contact_marketing_preferences')).n,0)
 check((await one('select count(*)::integer n from contact_email_subscriptions')).n,0)
 // Current sources still gate profile privacy; stale links alone no longer hide it.
 const profile=await one("select p.* from agency_client_profiles p join agency_client_links l on l.client_id=p.id where l.source_kind='contact' and l.source_id=$1",[a.contact_id])
 await db.query("insert into agency_client_links(organisation_id,client_id,source_kind,source_id) values($1,$2,'lead',gen_random_uuid())",[org,profile.id])
 await actor(staff);check((await one('select count(*)::integer n from agency_client_profiles where id=$1',[profile.id])).n,1)
 await denied(db.query('select email_campaign_repair_client_links($1,true)',[org]));await denied(db.query('select * from arch9_client_private.source_link_archive'))
 await service();check((await one('select email_campaign_repair_client_links($1,false) n',[org])).n,1)
 check((await one('select count(*)::integer n from arch9_client_private.source_link_archive')).n,0)
 check((await one('select email_campaign_repair_client_links($1,true) n',[org])).n,1)
 check((await one('select count(*)::integer n from arch9_client_private.source_link_archive')).n,1)
 await db.query('update contacts set assigned_agent_id=$1 where contact_id=$2',[colleague,b.contact_id])
 await actor(staff);check((await one('select count(*)::integer n from agency_client_profiles where id=$1',[profile.id])).n,0)
 check((await one('select count(*)::integer n from email_marketing_contacts where id=$1',[projected.id])).n,0)
 await service();await db.query('update contacts set assigned_agent_id=$1 where contact_id=$2',[staff,b.contact_id])
 const doomed=await add('deleted@example.com');await db.query('delete from contacts where contact_id=$1',[doomed.contact_id])
 check((await one("select is_valid_email from email_marketing_contacts where email='deleted@example.com'")).is_valid_email,false)
 check((await one('select count(*)::integer n from agency_client_links where source_id=$1',[doomed.contact_id])).n,0)
 check((await one("select count(*)::integer n from arch9_client_private.source_link_archive where source_id=$1 and reason='deleted'",[doomed.contact_id])).n,1)
 // Preview applies the exact legacy intersection, including empty/all definitions.
 await actor(user)
 const filters={contact_ids:[projected.id],area:'Cape Town'}
 await service();await db.query("insert into leads(organisation_id,contact_id,assigned_user_id,area_interest) values($1,$2,$3,'Cape Town')",[org,b.contact_id,staff]);await actor(user)
 check((await one('select email_audience_preview($1,$2) result',[org,JSON.stringify(filters)])).result.count,1)
 check((await one('select email_audience_preview($1,$2) result',[org,JSON.stringify({...filters,assigned_user_id:colleague})])).result.count,0)
 check((await one('select email_audience_preview($1,$2) result',[org,JSON.stringify({...filters,branch_id:other})])).result.count,0)
 // Existing first-tag creation for a visible prospect still works. These are
 // not contact-feed projections and must not be invalidated by a feed refresh.
 await service();await db.query("insert into canvassing_prospects(id,organisation_id,assigned_user_id,email,first_name) values(gen_random_uuid(),$1,$2,'prospect@example.com','Prospect')",[org,staff])
 await actor(staff)
 await db.query("insert into email_marketing_contacts(organisation_id,email,source_type,tags) values($1,'prospect@example.com','crm',array['prospect-tag'])",[org])
 await denied(db.query("insert into email_marketing_contacts(organisation_id,email,source_type) values($1,'private@example.com','crm') on conflict(organisation_id,email) do update set source_type='crm'",[org]))
 await service();await one('select email_campaign_refresh_contact_projection($1)',[org]);await actor(staff)
 check((await one("select is_valid_email from email_marketing_contacts where email='prospect@example.com'")).is_valid_email,true)
 check((await one("select tags from email_marketing_contacts where email='prospect@example.com'")).tags,['prospect-tag'])
 // A source moving workspace is archived before identity reassignment.
 await service();const moved=await add('moved@example.com')
 await db.query('update contacts set organisation_id=$1,assigned_agent_id=$2 where contact_id=$3',[other,outsider,moved.contact_id])
 check((await one("select count(*)::integer n from arch9_client_private.source_link_archive where source_id=$1 and reason='moved'",[moved.contact_id])).n,1)
 check((await one('select count(*)::integer n from agency_client_links where organisation_id=$1 and source_id=$2',[org,moved.contact_id])).n,0)
 check((await one("select is_valid_email from email_marketing_contacts where organisation_id=$1 and email='moved@example.com'",[org])).is_valid_email,false)
 check((await one("select is_valid_email from email_marketing_contacts where organisation_id=$1 and email='moved@example.com'",[other])).is_valid_email,true)
 // Membership preview and deliverable preview intentionally differ by consent.
 await actor(user);const sender=await shared()
 await service();await one("select email_campaign_apply_platform_status('synthetic-domain','verified',true)");await one('select email_activate_verified_organisation($1)',[org])
 await db.query('update email_sending_policies set approved_at=now(),paused_at=null,manual_paused_at=null where organisation_id=$1',[org])
 await one('select email_campaign_ensure_subscription_types($1)',[org])
 const category=await one('select id from email_subscription_types where organisation_id=$1 limit 1',[org])
 await db.query("insert into contact_marketing_preferences(organisation_id,email,marketing_consent_status) select organisation_id,email,'opted_in' from email_marketing_contacts where organisation_id=$1",[org])
 await db.query("insert into contact_email_subscriptions(organisation_id,email,subscription_type_id,status) select organisation_id,email,$2,'subscribed' from email_marketing_contacts where organisation_id=$1",[org,category.id])
 const privateContact=await one("select id from email_marketing_contacts where organisation_id=$1 and email='private@example.com'",[org])
 await actor(staff)
 check((await one('select email_campaign_preview_audience($1,$2,$3) n',[org,category.id,JSON.stringify({contact_ids:[privateContact.id]})])).n,0)
 await actor(user)
 check((await one('select email_campaign_preview_audience($1,$2,$3) n',[org,category.id,JSON.stringify({contact_ids:[privateContact.id]})])).n,1)
 await service()
 await db.query("insert into email_suppressions(organisation_id,email,reason) values($1,'private@example.com','hard_bounce')",[org])
 await actor(user)
 check((await one('select email_campaign_preview_audience($1,$2,$3) n',[org,category.id,JSON.stringify(filters)])).n,1)
 const campaign=await one("insert into email_campaigns(organisation_id,created_by,sender_identity_id,subscription_type_id,name,subject,audience_filter) values($1,$2,$3,$4,'Synthetic local check','Test',$5) returning id",[org,user,sender.id,category.id,JSON.stringify(filters)])
 check((await one('select email_campaign_prepare_dispatch($1) result',[campaign.id])).result.added_recipients,1)
 check((await one('select email from email_campaign_recipients where campaign_id=$1',[campaign.id])).email,projected.email)
 await service();await db.query("update contact_marketing_preferences set marketing_consent_status='opted_out' where organisation_id=$1 and email=$2",[org,projected.email])
 await one('select email_campaign_refresh_contact_projection($1)',[org]);await actor(user)
 check((await one('select email_campaign_preview_audience($1,$2,$3) n',[org,category.id,JSON.stringify(filters)])).n,0)
 check((await one('select email_audience_preview($1,$2) result',[org,JSON.stringify({contact_ids:[projected.id]})])).result.count,1)
 // Losing active membership also removes projection and preview access.
 await service();await db.query("update organisation_users set membership_status='inactive' where user_id=$1",[staff]);await actor(staff)
 check((await one('select count(*)::integer n from email_marketing_contacts')).n,0)
 await assert.rejects(db.query("select email_audience_preview($1,'{}')",[org]),/Not authorised/);assertions++
 console.log(`Client audience feed checks passed: ${assertions} assertions; valid/duplicate addresses, automatic refresh, source privacy, tags, consent, stale references and exact legacy filters.`)
} finally {await db.close()}
