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
const denied=async promise=>{await assert.rejects(promise,/permission denied|Client access|required|changed|row-level security|Unsupported|owner or principal|workspace administrator|unavailable|sharing access/);assertions++}
try {
 await db.exec(`reset role;
 alter table organisations add column type text default 'agency';
 create table organisation_users(id uuid primary key default gen_random_uuid(),user_id uuid,organisation_id uuid,workspace_role text,membership_status text,status text);
 create function bridge_agency_open_operations(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organisation_users where organisation_id=p_org and user_id=auth.uid() and membership_status='active' and workspace_role='owner' and exists(select 1 from public.organisations o where o.id=p_org and o.type='agency')) $$;
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
 await db.exec(fn(foundation,'email_campaign_quote_usage'))
 await db.exec(read('20261105181651_client_audience_feed_repair.sql'))
 await db.exec(`reset role;
 create table developments(id uuid primary key);
 create table marketing_campaigns(id uuid primary key,organisation_id uuid,created_by uuid,unique(id,organisation_id));
 alter table email_saved_audiences add column archived_at timestamptz;
 alter table leads add column lead_category text,add column status text,add column budget numeric;
 create table lead_activities(organisation_id uuid,lead_id uuid,activity_date timestamptz,activity_type text,outcome text);
 create table whatsapp_marketing_contacts(id uuid primary key default gen_random_uuid(),organisation_id uuid,phone text,consent_status text,opted_out_at timestamptz,consent_at timestamptz);
 create table whatsapp_campaign_recipients(organisation_id uuid,phone text,sent_at timestamptz);
 create function bridge_is_active_member(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.bridge_has_organisation_membership(p_org) $$;
 create function bridge_is_org_admin(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.organisation_users where organisation_id=p_org and user_id=auth.uid() and membership_status='active' and workspace_role='owner') $$;
 create function bridge_can_access_assignment(p_org uuid,p_user uuid,p_branch uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.bridge_is_org_admin(p_org) or (public.bridge_is_active_member(p_org) and (p_user is null or p_user=auth.uid())) $$;
 create function bridge_has_transaction_access(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.transactions t where t.id=p_id and public.bridge_can_access_assignment(t.organisation_id,coalesce(t.assigned_user_id,t.assigned_agent_id,t.owner_user_id),null)) $$;
 create or replace function email_campaign_can_send(p_organisation_id uuid) returns boolean language sql stable as $$ select public.bridge_is_active_member(p_organisation_id) and public.bridge_is_org_admin(p_organisation_id) $$;
 grant all on developments,lead_activities,whatsapp_marketing_contacts,whatsapp_campaign_recipients to service_role;
 grant select on email_suppressions,contacts,leads,lead_activities,whatsapp_marketing_contacts,whatsapp_campaign_recipients to authenticated;
 alter table contacts enable row level security;
 create policy source_visible on contacts for select to authenticated using(bridge_can_access_assignment(organisation_id,assigned_agent_id,null));
 alter table leads enable row level security;
 create policy source_visible on leads for select to authenticated using(bridge_can_access_assignment(organisation_id,coalesce(assigned_user_id,assigned_agent_id),branch_id));
 `)
 await db.exec(read('20261103192636_inbox_shared_client_tags_and_enquiries.sql'))
 await db.exec(read('20261025102447_shared_crm_marketing_audiences.sql'))
 await db.exec(read('20261105183145_shared_client_identity_tags.sql'))
 const definition={match:'all',rules:[{field:'role',operator:'in',values:['buyer']}],excludeClosed:false,quietDays:0}
 await service()
 const c1=await add('buyer@example.com'),c2=await add('seller@example.com',staff,{type:'seller'})
 const branch='44444444-4444-4444-8444-444444444444'
 await db.query('insert into organisation_branches values($1,$2)',[branch,org])
 await db.query("insert into leads(organisation_id,contact_id,assigned_user_id,branch_id,area_interest,stage) values($1,$2,$3,$4,'Cape Town','Qualified')",[org,c1.contact_id,staff,branch])
 const m1=await one('select * from email_marketing_contacts where email=$1',[c1.email])
 await db.query("insert into email_marketing_contacts(organisation_id,email,source_type,full_name) values($1,'upload@example.com','manual','Uploaded person')",[org])
 const filter={area:'Cape Town',branch_id:branch,assigned_user_id:staff,contact_ids:[m1.id],rules:[{field:'contact_type',operator:'in',value:['buyer']}],operator:'AND'}
 const legacy=await one("insert into email_saved_audiences(organisation_id,name,description,created_by,filter_json,created_at,updated_at) values($1,'Restricted legacy','Keep exact restrictions',$2,$3,'2026-01-01','2026-02-01') returning *",[org,staff,JSON.stringify(filter)])
 const all=await one("insert into email_saved_audiences(organisation_id,name,description,created_by) values($1,$2,$3,null) returning *",[org,'L'.repeat(130),'D'.repeat(700)])
 const hidden=await one("insert into email_saved_audiences(organisation_id,name,created_by,archived_at) values($1,'Archived legacy',$2,now()) returning *",[org,staff])
 await db.exec('reset role')
 const normal=await one("insert into marketing_audiences(organisation_id,name,visibility,created_by,definition) values($1,'Shared buyers','agency',$2,$3) returning *",[org,user,JSON.stringify(definition)])
 const personal=await one("insert into marketing_audiences(organisation_id,name,visibility,created_by,definition) values($1,'Private to colleague','personal',$2,$3) returning *",[org,colleague,JSON.stringify(definition)])
 await actor(staff)
 check((await one('select email_audience_preview($1,$2) result',[org,JSON.stringify({saved_audience_id:legacy.id})])).result.count,1)
 // Refuse UUID collisions atomically instead of silently overwriting targeting.
 await db.exec('reset role')
 await db.query("insert into marketing_audiences(id,organisation_id,name,visibility,created_by,definition) values($1,$2,'Collision','agency',$3,$4)",[legacy.id,org,user,JSON.stringify(definition)])
 await assert.rejects(db.exec(read('20261105185204_unified_client_audiences.sql')),/Audience ID collision/);assertions++
 await db.exec('rollback');await db.query('delete from marketing_audiences where id=$1',[legacy.id])
 await db.exec('alter default privileges in schema public grant all on tables to authenticated,service_role')
 await db.exec(read('20261105185204_unified_client_audiences.sql'))
 const imported=await one('select * from marketing_audiences where id=$1',[legacy.id])
 check((await one('select description from marketing_audiences where id=$1',[all.id])).description,all.description)
 check(imported.definition,{emailFilter:filter});check(imported.created_by,staff);check(imported.visibility,'agency');check(imported.created_at,legacy.created_at);check(imported.updated_at,legacy.updated_at)
 check((await one('select count(*)::integer n from email_saved_audiences_archive')).n,3)
 check((await one("select has_table_privilege('service_role','public.email_saved_audiences','insert,update,delete') ok")).ok,false)
 check((await one("select reloptions @> array['security_invoker=true'] ok from pg_class where oid='public.email_saved_audiences'::regclass")).ok,true)
 await actor(staff)
 check((await one('select filter_json from email_saved_audiences where id=$1',[legacy.id])).filter_json,filter)
 check((await one('select count(*)::integer n from email_saved_audiences where id=$1',[personal.id])).n,0)
 await denied(db.query("update email_saved_audiences set name='Bypass' where id=$1",[legacy.id]))
 await denied(db.query('select * from email_saved_audiences_archive'))
 let library=(await one('select marketing_audience_library($1) result',[org])).result
 check(library.total,3);check(library.audiences.some(a=>a.id===hidden.id),false)
 let p=(await one("select marketing_audience_preview($1,$2,null,'email') result",[org,legacy.id])).result
 check(p.matched,1);check(p.whatsappEligible,0);check(p.rows[0].contact_id,m1.id)
 check(p.rows[0].whatsapp_reason.includes('Email targeting only'),true)
 check((await one('select email_audience_preview($1,$2) result',[org,JSON.stringify({saved_audience_id:legacy.id})])).result.count,1)
 check((await one('select email_audience_preview($1,$2) result',[org,JSON.stringify({saved_audience_id:all.id})])).result.count,3)
 // The creator can rename without losing any predicate; stale edits cannot win.
 await db.query("update marketing_audiences set name='Renamed exact',revision=revision+1 where id=$1",[legacy.id])
 check((await one('select definition from marketing_audiences where id=$1',[legacy.id])).definition,{emailFilter:filter})
 await denied(db.query("update marketing_audiences set definition='{\"emailFilter\":{}}',revision=revision+1 where id=$1",[legacy.id]))
 await assert.rejects(db.query('select email_campaign_resolve_audience_rules($1,$2)',[org,JSON.stringify({saved_audience_id:legacy.id,branch_id:branch})]),/separately/);assertions++

 await assert.rejects(db.query("update marketing_audiences set name='Stale',revision=1 where id=$1",[legacy.id]),/changed/);assertions++
 await denied(db.query('select email_campaign_resolve_audience_rules($1,$2)',[org,JSON.stringify({saved_audience_id:personal.id})]))
 await denied(db.query('select email_campaign_resolve_audience_rules($1,$2)',[other,JSON.stringify({saved_audience_id:legacy.id})]))
 // Person-level memberships share this catalogue, including phone-only CRM.
 await service();const phone=await one("insert into contacts(organisation_id,assigned_agent_id,first_name,phone,contact_type) values($1,$2,'Phone buyer','0827654321','buyer') returning *",[org,staff])
 const identity=async(id)=>one("select p.* from agency_client_profiles p join agency_client_links l on l.client_id=p.id where l.source_kind='contact' and l.source_id=$1",[id])
 const phoneProfile=await identity(phone.contact_id),buyerProfile=await identity(c1.contact_id)
 await actor(staff)
 let memberships=(await one('select client_audience_memberships($1,$2) result',[org,phoneProfile.id])).result
 check(memberships.map(a=>a.id),[normal.id])
 memberships=(await one('select client_audience_memberships($1,$2) result',[org,buyerProfile.id])).result
 check(memberships.some(a=>a.id===legacy.id),true);check(memberships.some(a=>a.id===normal.id),true);check(memberships.some(a=>a.id===personal.id),false)
 await actor(outsider);await denied(db.query('select client_audience_memberships($1,$2)',[org,buyerProfile.id]))
 // The shared CRM definition is also selectable by existing email references.
 await actor(user)
 check((await one('select email_audience_preview($1,$2) result',[org,JSON.stringify({saved_audience_id:normal.id})])).result.count,1)
 check((await one('select email_campaign_resolve_audience_rules($1,$2) result',[org,JSON.stringify({saved_audience_id:normal.id,audience_revision:normal.revision})])).result,{shared_audience_id:normal.id,audience_revision:normal.revision})
 await assert.rejects(db.query('select email_audience_preview($1,$2)',[org,JSON.stringify({saved_audience_id:normal.id,audience_revision:normal.revision-1})]),/saved audience changed/);assertions++

 await service();await one('select email_campaign_ensure_subscription_types($1)',[org])
 const category=await one('select id from email_subscription_types where organisation_id=$1 limit 1',[org])
 for(const email of ['buyer@example.com','seller@example.com','upload@example.com']) {
  await db.query("insert into contact_marketing_preferences(organisation_id,email,marketing_consent_status) values($1,$2,'opted_in')",[org,email])
  await db.query("insert into contact_email_subscriptions(organisation_id,email,subscription_type_id,status) values($1,$2,$3,'subscribed')",[org,email,category.id])
 }
 await one("select email_campaign_apply_platform_status('synthetic-platform','verified',true)")
 await actor(user);const sender=await shared()
 check((await one('select email_campaign_preview_audience($1,$2,$3) n',[org,category.id,JSON.stringify({saved_audience_id:normal.id})])).n,1)
 const campaign=await one("insert into email_campaigns(organisation_id,created_by,sender_identity_id,subscription_type_id,name,subject,audience_filter) values($1,$2,$3,$4,'Unified local test','Local test',$5) returning id",[org,user,sender.id,category.id,JSON.stringify({saved_audience_id:normal.id})])
 check((await one('select email_campaign_prepare_dispatch($1) result',[campaign.id])).result.added_recipients,1)
 check((await one('select email from email_campaign_recipients where campaign_id=$1',[campaign.id])).email,'buyer@example.com')
 // Eligibility drift invalidates a reviewed selection; unsubscribe still wins.
 p=(await one("select marketing_audience_preview($1,$2,null,'email',$3) result",[org,normal.id,category.id])).result
 await service();await db.query("update contact_marketing_preferences set marketing_consent_status='opted_out' where organisation_id=$1 and email='buyer@example.com'",[org]);await actor(user)
 await assert.rejects(db.query("select marketing_audience_preview($1,$2,null,'email',$3,0,$4,$5,true)",[org,normal.id,category.id,p.revision,p.reviewHash]),/changed/);assertions++
 check((await one('select email_campaign_preview_audience($1,$2,$3) n',[org,category.id,JSON.stringify({saved_audience_id:normal.id})])).n,0)
 // A privileged email selector must not use CRM facts hidden from the caller,
 // even if a visible manual email contact happens to share that destination.
 await service();const privateContact=await add('private-buyer@example.com',colleague)
 await db.query("update email_marketing_contacts set source_type='manual' where organisation_id=$1 and email='private-buyer@example.com'",[org])
 await db.query("insert into contact_marketing_preferences(organisation_id,email,marketing_consent_status) values($1,'private-buyer@example.com','opted_in')",[org])
 await db.query("insert into contact_email_subscriptions(organisation_id,email,subscription_type_id,status) values($1,'private-buyer@example.com',$2,'subscribed')",[org,category.id])
 await actor(staff)
 check((await one('select email_campaign_preview_audience($1,$2,$3) n',[org,category.id,JSON.stringify({saved_audience_id:normal.id})])).n,0)
 check((await one('select marketing_audience_has_email_contact($1,$2,$3) ok',[org,normal.id,m1.id])).ok,true)
 await actor(user)
 // Cycles fail closed, and creators cannot promote a personal audience.
 await service();const cycle=await one("insert into marketing_audiences(organisation_id,name,visibility,created_by,definition) values($1,'Cycle','agency',$2,'{\"emailFilter\":{}}') returning id",[org,user])
 await db.query('update marketing_audiences set definition=$1,revision=revision+1 where id=$2',[JSON.stringify({emailFilter:{saved_audience_id:cycle.id}}),cycle.id])
 await actor(user);await assert.rejects(db.query('select email_campaign_resolve_audience_rules($1,$2)',[org,JSON.stringify({saved_audience_id:cycle.id})]),/cycle/);assertions++
 await db.query('update marketing_audiences set archived_at=now(),revision=revision+1 where id=$1',[cycle.id])
 await denied(db.query('select email_campaign_resolve_audience_rules($1,$2)',[org,JSON.stringify({saved_audience_id:personal.id})]))
 // Developer phone-only clients use the very same personal/shared library.
 await service();const dev='33333333-3333-4333-8333-333333333333'
 await db.query("insert into organisations(id,type) values($1,'developer_company')",[dev])
 await db.query("insert into organisation_users(user_id,organisation_id,workspace_role,membership_status,status) values($1,$2,'agent','active','active')",[staff,dev])
 const devContact=await one("insert into contacts(organisation_id,assigned_agent_id,first_name,phone,contact_type) values($1,$2,'Developer phone buyer','0829876543','buyer') returning *",[dev,staff])
 const devProfile=await identity(devContact.contact_id)
 await actor(staff);const devAudience=await one("insert into marketing_audiences(organisation_id,name,visibility,definition) values($1,'Developer buyers','personal',$2) returning *",[dev,JSON.stringify(definition)])
 check((await one('select client_audience_memberships($1,$2) result',[dev,devProfile.id])).result.map(a=>a.id),[devAudience.id])
 check((await one('select marketing_audience_library($1) result',[dev])).result.total,1)
 await denied(db.query("update marketing_audiences set visibility='agency',revision=revision+1 where id=$1",[devAudience.id]))
 await actor(user)
 // Archive is reflected in every consumer and never becomes an all-contact filter.
 await db.query('update marketing_audiences set archived_at=now(),revision=revision+1 where id=$1',[normal.id])
 await denied(db.query('select email_audience_preview($1,$2)',[org,JSON.stringify({saved_audience_id:normal.id})]))
 check((await one('select client_audience_memberships($1,$2) result',[org,phoneProfile.id])).result,[])
 check((await one("select has_function_privilege('anon','public.client_audience_memberships(uuid,uuid)','execute') ok")).ok,false)
 console.log(`Unified client audience checks passed: ${assertions} assertions; exact legacy import, one catalogue, personal/shared permissions, phone-only memberships, stable IDs, revision conflicts, dispatch parity and consent drift.`)
} finally {await db.close()}
