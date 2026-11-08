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
 await db.exec(`reset role;create schema journey_private;create schema private;grant usage on schema private to authenticated;
 create table profiles(id uuid primary key,first_name text,last_name text);
 alter table organisation_users add column role text;update organisation_users set role=workspace_role;
 alter table lead_activities add column activity_id uuid primary key default gen_random_uuid(),add column agent_id uuid,add column activity_note text,add column created_at timestamptz default now(),add column is_demo_data boolean default false;
 alter table transactions add column status text;
 alter table private_listing_seller_onboarding add column submitted_at timestamptz,add column seller_portal_last_login_at timestamptz,add column created_at timestamptz default now();
    create table tasks(task_id uuid primary key,organisation_id uuid,lead_id uuid,transaction_id uuid,title text,status text,created_at timestamptz default now());
    create table appointments(appointment_id uuid primary key,organisation_id uuid,lead_id uuid,contact_id uuid,transaction_id uuid,listing_id text,title text,status text,date_time timestamptz,created_at timestamptz default now());
    create table appointment_participants(participant_id uuid primary key,appointment_id uuid,organisation_id uuid,email text,participant_role text,rsvp_status text,responded_at timestamptz,created_at timestamptz default now());
    create table offers(id uuid primary key,organisation_id uuid,buyer_lead_id uuid,seller_lead_id uuid,buyer_contact_id uuid,seller_contact_id uuid,status text,buyer_viewed_at timestamptz,buyer_submitted_at timestamptz,seller_viewed_at timestamptz,created_at timestamptz default now());
    create table transaction_events(id uuid primary key,transaction_id uuid,event_type text,event_data jsonb,visibility_scope text,created_at timestamptz default now());
    create table transaction_comments(id uuid primary key,transaction_id uuid,comment_text text,visibility_scope text,created_at timestamptz default now());
    create table documents(id uuid primary key,transaction_id uuid,name text,status text,file_path text,visibility_scope text,created_at timestamptz default now());
    create table private_listing_activity(id uuid primary key,private_listing_id uuid,activity_title text,activity_description text,created_at timestamptz default now());
    create table buyer_viewing_preference_links(id uuid primary key,organisation_id uuid,lead_id uuid,submitted_at timestamptz,token_hash text,created_at timestamptz default now());
    create table seller_viewing_coordination_links(id uuid primary key,organisation_id uuid,lead_id uuid,submitted_at timestamptz,token_hash text,created_at timestamptz default now());
    create table client_issues(id uuid primary key,transaction_id uuid,status text,client_confirmed_at timestamptz,created_at timestamptz default now());
    create table alteration_requests(id uuid primary key,transaction_id uuid,status text,created_at timestamptz default now());
    create table service_reviews(id uuid primary key,transaction_id uuid,rating integer,created_at timestamptz default now());
    create table transaction_handover(id uuid primary key,transaction_id uuid,status text,signature_signed_at timestamptz,created_at timestamptz default now());
    create table transaction_onboarding(id uuid primary key,transaction_id uuid,submitted_at timestamptz,created_at timestamptz default now());
    create table transaction_bond_applications(id uuid primary key,transaction_id uuid,status text,created_at timestamptz default now());
    create table client_portal_notifications(id uuid primary key,transaction_id uuid,client_role text,read_at timestamptz,dismissed_at timestamptz,created_at timestamptz default now());
    create table private_listing_documents(id uuid primary key,private_listing_id uuid,document_name text,status text,storage_path text,created_at timestamptz default now());
    create table client_portal_links(id uuid primary key,transaction_id uuid,buyer_id uuid,token text,is_active boolean,expires_at timestamptz);
    create table test_seller_sessions(token text,access_token text,listing_id uuid,transaction_id uuid,is_active boolean);
    create function journey_private.resolve_seller_portal_context(p_token text,p_access text) returns table(listing_id uuid,transaction_id uuid) language plpgsql security definer set search_path='' as $$
      begin return query select s.listing_id,s.transaction_id from public.test_seller_sessions s where s.token=p_token and s.access_token=p_access and s.is_active; if not found then raise exception 'Seller portal access required.' using errcode='42501'; end if; end; $$;
    create function bridge_client_portal_request_token() returns text language sql stable as $$ select nullif(current_setting('request.portal.token',true),'') $$;
    create function bridge_has_client_portal_token_transaction_access(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
      select exists(select 1 from client_portal_links where token=bridge_client_portal_request_token() and transaction_id=p_id and is_active and (expires_at is null or expires_at>now())); $$;

 grant select on all tables in schema public to authenticated;
 grant all on all tables in schema public to service_role;
 `)
 await db.exec(read('20261009121124_agency_client_activity_timeline.sql'))
 await db.exec(read('20261011171757_client_activity_anchor_planner_estimate.sql'))
 await db.exec(read('20261009135332_agency_client_campaign_engagement.sql'))
 await db.exec(read('20261105185204_unified_client_audiences.sql'))
 await db.exec(`reset role;
 create table revo_inbox_channels(id uuid primary key default gen_random_uuid(),organisation_id uuid,access_scope text,owner_user_id uuid);
 create table shared_inbox_mailbox_members(channel_id uuid,organisation_id uuid,user_id uuid,access_role text);
 create table revo_inbox_conversations(id uuid primary key default gen_random_uuid(),organisation_id uuid,channel_id uuid,assigned_user_id uuid,status text default 'open');
 create table revo_inbox_messages(id uuid primary key default gen_random_uuid(),organisation_id uuid,conversation_id uuid,channel text default 'email',direction text,message_type text default 'message',sender_address text,recipient_addresses text[],delivery_status text,occurred_at timestamptz default now(),created_by uuid,body_text text);
 create table whatsapp_inbox_conversations(id uuid primary key default gen_random_uuid(),organisation_id uuid,channel_id uuid,contact_phone text,assigned_user_id uuid,status text default 'open');
 create table whatsapp_inbox_messages(id uuid primary key default gen_random_uuid(),organisation_id uuid,conversation_id uuid,channel_id uuid,direction text,delivery_status text,event_at timestamptz default now(),created_by uuid,message_origin text default 'cloud_api',revoked_at timestamptz,body text);
 create table whatsapp_inbox_crm_links(organisation_id uuid,conversation_id uuid primary key,lead_id uuid,recruitment_lead_id uuid);
 grant all on revo_inbox_channels,shared_inbox_mailbox_members,revo_inbox_conversations,revo_inbox_messages,whatsapp_inbox_conversations,whatsapp_inbox_messages,whatsapp_inbox_crm_links to service_role;
 `)
 const mailbox=read('20261025181115_shared_inbox_mailbox_foundation.sql')
 for(const name of ['shared_inbox_permission_for_user','shared_inbox_can_access','shared_inbox_can_access_conversation']) {
  const at=mailbox.indexOf('function private.'+name+'(');await db.exec(mailbox.slice(mailbox.lastIndexOf('create ',at),mailbox.indexOf('$$;',at)+3))
 }
 await db.exec(read('20261105190717_email_audience_contact_import.sql'))
 await db.exec('grant all on email_audience_imports to service_role')
 await db.exec(read('20261105192633_client_engagement_history.sql'))
 const importCorrection=read('20261105194348_client_audience_import_catalogue.sql')
 const importFunction=async()=> (await one("select pg_get_functiondef('private.email_import_audience(uuid,uuid,text,uuid,jsonb)'::regprocedure) definition")).definition
 const beforeCorrection=await importFunction()
 await assert.rejects(db.exec(importCorrection.replace(/commit;\s*$/, () => "do $$ begin raise exception 'Synthetic migration rollback';end $$;commit;")),/Synthetic migration rollback/);assertions++
 await db.exec('rollback')
 check(await importFunction(),beforeCorrection)
 await db.exec(importCorrection)
 check((await importFunction()).includes('insert into public.email_saved_audiences'),false)
 await db.query("insert into profiles values($1,'Synthetic','Owner'),($2,'Synthetic','Agent')",[user,staff])
 const person=await add('engagement@example.com')
 const profile=(await one("select client_id from agency_client_links where source_kind='contact' and source_id=$1",[person.contact_id])).client_id
 const channel=await one("insert into revo_inbox_channels(organisation_id,access_scope,owner_user_id) values($1,'workspace',$2) returning *",[org,staff])
 const thread=await one('insert into revo_inbox_conversations(organisation_id,channel_id,assigned_user_id) values($1,$2,$3) returning *',[org,channel.id,colleague])
 const email=async(direction,status='sent',extra={})=>one('insert into revo_inbox_messages(organisation_id,conversation_id,direction,delivery_status,sender_address,recipient_addresses,created_by,body_text,message_type,occurred_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10::timestamptz,now())) returning *',[extra.org||org,thread.id,direction,status,direction==='inbound'?person.email:'staff@example.com',[person.email],staff,'PRIVATE BODY',extra.type||'message',extra.at||null])
 const summary=async(id=staff)=>{await actor(id);return (await one('select client_engagement_summary($1,$2) result',[org,profile])).result}
 const history=async()=> (await db.query('select * from agency_client_activity_page($1)',[profile])).rows
 await service()
 await email('outbound','queued');await email('internal','sent',{type:'note'});await email('outbound','sent',{type:'draft'})
 check((await summary()).lastContact,null)
 await service();const failed=await email('outbound','failed')
 check((await summary()).lastContact,null);check((await history()).some(e=>e.engagement_status==='failed'),true)
 await service();await db.query("update revo_inbox_messages set delivery_status='sent' where id=$1",[failed.id])
 check((await summary()).lastContact.channel,'email')
 check((await summary()).conversations[0].assignedUserId,colleague)
 check((await history()).filter(e=>e.origin_id===failed.id).length,2)
 await service();await db.query("update revo_inbox_messages set delivery_status='read' where id=$1",[failed.id]);await summary()
 check((await history()).filter(e=>e.origin_id===failed.id).length,2)
 check((await history()).some(e=>JSON.stringify(e).includes('PRIVATE BODY')),false)
 await service();await email('inbound','received')
 check((await summary()).lastContact.direction,'inbound')
 await service();await db.query("update revo_inbox_channels set access_scope='private' where id=$1",[channel.id])
 check((await summary(user)).lastContact,null);check((await summary(user)).conversations,[])
 check((await summary(staff)).conversations.length,1)
 await service();await db.query("update revo_inbox_channels set access_scope='selected',owner_user_id=$2 where id=$1",[channel.id,user])
 check((await summary(staff)).lastContact,null)
 await service();await db.query("insert into shared_inbox_mailbox_members values($1,$2,$3,'viewer')",[channel.id,org,staff])
 check((await summary(staff)).conversations.length,1)
 await assert.rejects(db.query("select arch9_client_private.capture_communication('revo_inbox_messages',$1,false)",[failed.id]),/permission denied/);assertions++
 await assert.rejects(db.query('select client_engagement_backfill($1,true)',[org]),/permission denied/);assertions++
 await actor(outsider);await assert.rejects(db.query('select client_engagement_summary($1,$2)',[org,profile]),/access required/);assertions++
 await service();await db.query("update contacts set phone='27821234567' where contact_id=$1",[person.contact_id])
 const wa=await one("insert into whatsapp_inbox_conversations(organisation_id,channel_id,contact_phone,assigned_user_id) values($1,gen_random_uuid(),'27821234567',$2) returning *",[org,staff])
 const wm=await one("insert into whatsapp_inbox_messages(organisation_id,conversation_id,channel_id,direction,delivery_status,created_by,body) values($1,$2,$3,'outbound','sent',$4,'PRIVATE WHATSAPP') returning *",[org,wa.id,wa.channel_id,staff])
 check((await summary()).conversations.some(c=>c.channel==='whatsapp'),true)
 await actor(colleague);check((await one("select arch9_client_private.communication_visible('whatsapp_inbox_messages',$1) ok",[wm.id])).ok,false)
 await service();const household=await add('household@example.com');await db.query("update contacts set phone='27821234567' where contact_id=$1",[household.contact_id])
 check((await summary()).conversations.some(c=>c.channel==='whatsapp'),false)
 await service();const lead=await one('insert into leads(organisation_id,contact_id,assigned_user_id) values($1,$2,$3) returning *',[org,person.contact_id,staff])
 await db.query('insert into whatsapp_inbox_crm_links values($1,$2,$3,null)',[org,wa.id,lead.lead_id])
 check((await summary()).conversations.some(c=>c.channel==='whatsapp'),true)
 await service();await db.query("insert into tasks(task_id,organisation_id,lead_id,title,status) values(gen_random_uuid(),$1,$2,'Open follow-up','pending'),(gen_random_uuid(),$1,$2,'Finished follow-up','completed')",[org,lead.lead_id])
 check((await summary()).pendingFollowUps,1)
 await service();await db.query('update whatsapp_inbox_messages set revoked_at=now() where id=$1',[wm.id])
 check((await summary()).conversations.some(c=>c.channel==='whatsapp'),false)
 await actor(staff);const req='12345678-1234-4234-8234-123456789012'
 const args=[profile,req,'call','No answer','2026-01-01T10:00:00Z','no_answer']
 const saved=await one('select client_log_engagement($1,$2,$3,$4,$5,$6) id',args)
 check((await one('select client_log_engagement($1,$2,$3,$4,$5,$6) id',args)).id,saved.id)
 await assert.rejects(db.query('select client_log_engagement($1,$2,$3,$4,$5,$6)',[...args.slice(0,5),'completed']),/another interaction/);assertions++
 check((await history()).find(e=>e.id===saved.id).engagement_status,'no_answer')
 await service();const future=await email('outbound','sent',{at:'2099-01-01'})
 await summary();check((await history()).some(e=>e.origin_id===future.id),true)
 check(new Date((await summary()).lastContact.at).getUTCFullYear()<2099,true)
 await service();check((await one('select client_engagement_backfill($1,false) result',[org])).result.inserted,0)
 check((await one('select client_engagement_backfill($1,true) result',[org])).result.inserted,0)
 // Late identities replay existing messages, preserving their occurrence time.
 await service()
 const late=await one("insert into revo_inbox_messages(organisation_id,conversation_id,direction,delivery_status,sender_address,recipient_addresses,occurred_at) values($1,$2,'inbound','received','late@example.com','{}','2020-01-01') returning *",[org,thread.id])
 const lateContact=await add('late@example.com')
 const lateProfile=(await one("select client_id from agency_client_links where source_kind='contact' and source_id=$1",[lateContact.contact_id])).client_id
 await actor(staff)
 const lateHistory=(await db.query('select * from agency_client_activity_page($1)',[lateProfile])).rows
 check(lateHistory.find(e=>e.origin_id===late.id).historical,true)
 check(new Date(lateHistory.find(e=>e.origin_id===late.id).occurred_at).getUTCFullYear(),2020)
 // Isolated quiet-period evidence: unsuccessful calls and notes are excluded.
 await service();const quietContact=await add('quiet@example.com')
 const qp=(await one("select client_id from agency_client_links where source_kind='contact' and source_id=$1",[quietContact.contact_id])).client_id
 await one('select email_campaign_ensure_subscription_types($1)',[org])
 const category=await one('select id from email_subscription_types where organisation_id=$1 limit 1',[org])
 await db.query("insert into contact_marketing_preferences(organisation_id,email,marketing_consent_status) values($1,$2,'opted_in')",[org,quietContact.email])
 await db.query("insert into contact_email_subscriptions(organisation_id,email,subscription_type_id,status) values($1,$2,$3,'subscribed')",[org,quietContact.email,category.id])
 await one("select email_campaign_apply_platform_status('synthetic-platform','verified',true)")
 await actor(user);const sender=await shared()
 const definition={match:'all',rules:[{field:'role',operator:'in',values:['buyer']}],excludeClosed:false,quietDays:7}
 const audience=await one("insert into marketing_audiences(organisation_id,name,visibility,definition) values($1,'Quiet test','agency',$2) returning *",[org,JSON.stringify(definition)])
 const preview=async()=> (await one("select marketing_audience_preview($1,$2,null,'email',$3) result",[org,audience.id,category.id])).result
 const before=await preview();check(before.rows.find(r=>r.contact_id===quietContact.contact_id).recent,false)
 for(const [type,outcome] of [['call','no_answer'],['note','recorded']]) await db.query('select client_log_engagement($1,gen_random_uuid(),$2,$3,now(),$4)',[qp,type,'Synthetic unsuccessful contact',outcome])
 check((await one('select client_contacted_at($1,$2) at',[org,quietContact.contact_id])).at,null)
 await service();const quietThread=await one('insert into revo_inbox_conversations(organisation_id,channel_id,assigned_user_id) values($1,$2,$3) returning *',[org,channel.id,staff])
 await service();const qm=await one("insert into revo_inbox_messages(organisation_id,conversation_id,direction,delivery_status,sender_address,recipient_addresses,created_by) values($1,$2,'outbound','failed','staff@example.com',array[$3],$4) returning *",[org,quietThread.id,quietContact.email,staff])
 await actor(user);check((await preview()).rows.find(r=>r.contact_id===quietContact.contact_id).recent,false)
 await service();await db.query("update revo_inbox_messages set delivery_status='sent' where id=$1",[qm.id]);await actor(user)
 const after=await preview();check(after.rows.find(r=>r.contact_id===quietContact.contact_id).recent,true)
 check(after.rows.find(r=>r.contact_id===quietContact.contact_id).email_reason,'Contacted within the quiet period')
 await assert.rejects(db.query("select marketing_audience_preview($1,$2,null,'email',$3,0,$4,$5,true)",[org,audience.id,category.id,before.revision,before.reviewHash]),/changed/);assertions++
 check((await one('select email_campaign_preview_audience($1,$2,$3) n',[org,category.id,JSON.stringify({saved_audience_id:audience.id})])).n,0)
 const campaign=await one("insert into email_campaigns(organisation_id,created_by,sender_identity_id,subscription_type_id,name,subject,audience_filter) values($1,$2,$3,$4,'Quiet test','Synthetic',$5) returning id",[org,user,sender.id,category.id,JSON.stringify({saved_audience_id:audience.id})])
 check((await one('select email_campaign_prepare_dispatch($1) result',[campaign.id])).result.added_recipients,0)
 // A privileged selector must not infer private communication recency.
 await service();await db.query("update revo_inbox_channels set access_scope='private',owner_user_id=$2 where id=$1",[channel.id,staff]);await actor(user)
 check((await preview()).rows.find(r=>r.contact_id===quietContact.contact_id).recent,false)
 check((await one('select email_campaign_preview_audience($1,$2,$3) n',[org,category.id,JSON.stringify({saved_audience_id:audience.id})])).n,1)
 await service();await db.query("update revo_inbox_channels set access_scope='selected',owner_user_id=$2 where id=$1",[channel.id,user]);await actor(user)
 // Source deletion and mailbox privacy remove communication-derived recency.
 await service();await db.query('delete from revo_inbox_messages where id=$1',[qm.id]);await actor(user)
 check((await one('select client_contacted_at($1,$2) at',[org,quietContact.contact_id])).at,null)
 await service();await db.query("update contacts set phone='27829999999' where contact_id=$1",[quietContact.contact_id])
 const qwa=await one("insert into whatsapp_inbox_conversations(organisation_id,channel_id,contact_phone,assigned_user_id) values($1,gen_random_uuid(),'27829999999',$2) returning *",[org,staff])
 const qwm=await one("insert into whatsapp_inbox_messages(organisation_id,conversation_id,channel_id,direction,delivery_status,created_by) values($1,$2,$3,'inbound','received',$4) returning *",[org,qwa.id,qwa.channel_id,staff])
 await actor(staff);check((await one('select client_contacted_at($1,$2) at',[org,quietContact.contact_id])).at!==null,true)
 await service();await db.query('update whatsapp_inbox_conversations set assigned_user_id=$1 where id=$2',[colleague,qwa.id]);await actor(staff)
 check((await one('select client_contacted_at($1,$2) at',[org,quietContact.contact_id])).at,null)
 await actor(user);check((await preview()).rows.find(r=>r.contact_id===quietContact.contact_id).recent,true)
 await service();await db.query('update whatsapp_inbox_messages set revoked_at=now() where id=$1',[qwm.id]);await actor(user)
 await db.query("select client_log_engagement($1,gen_random_uuid(),'call','Connected',now(),'completed')",[qp])
 check((await one('select client_contacted_at($1,$2) at',[org,quietContact.contact_id])).at!==null,true)
 await actor(colleague);check((await one('select client_contacted_at($1,$2) at',[org,quietContact.contact_id])).at,null)
 // Reviewed merge deduplicates a single message addressed to both aliases.
 await service();const alias=await add('alias@example.com')
 const ap=(await one("select client_id from agency_client_links where source_kind='contact' and source_id=$1",[alias.contact_id])).client_id
 const multi=await one("insert into revo_inbox_messages(organisation_id,conversation_id,direction,delivery_status,recipient_addresses) values($1,$2,'outbound','sent',$3) returning *",[org,thread.id,[quietContact.email,alias.email]])
 const primary=await one('select * from agency_client_profiles where id=$1',[qp]),secondary=await one('select * from agency_client_profiles where id=$1',[ap])
 await actor(user);await db.query('select agency_client_merge($1,$2,$3,$4,$5)',[qp,ap,primary.version,secondary.version,'Synthetic alias merge'])
 const merged=(await db.query('select * from agency_client_activity_page($1)',[qp])).rows
 check(merged.filter(e=>e.origin_id===multi.id).length,1)
 check((await db.query('select * from agency_client_activity_page($1)',[ap])).rows,merged)
 // Former source associations cannot keep another person's WhatsApp history.
 await service();await db.query('update whatsapp_inbox_messages set revoked_at=null where id=$1',[wm.id])
 await db.query('update whatsapp_inbox_crm_links set lead_id=null,recruitment_lead_id=gen_random_uuid() where conversation_id=$1',[wa.id])
 check((await summary()).conversations.some(c=>c.channel==='whatsapp'),false)
 await service();await db.query("update organisation_users set status='inactive',membership_status='inactive' where organisation_id=$1 and user_id=$2",[org,staff])
 await actor(staff);check((await one("select arch9_client_private.communication_visible('whatsapp_inbox_messages',$1) ok",[wm.id])).ok,false)
 // Explicit replay previews, writes and repeats without provider calls.
 await db.exec('reset role;alter table revo_inbox_messages disable trigger client_email_engagement')
 const missed=await email('inbound','received')
 await db.exec('alter table revo_inbox_messages enable trigger client_email_engagement');await service()
 check((await one('select count(*)::int n from agency_client_activity where origin_id=$1',[missed.id])).n,0)
 check((await one('select client_engagement_backfill($1,false) result',[org])).result.inserted,0)
 check((await one('select client_engagement_backfill($1,true) result',[org])).result.inserted>=1,true)
 check((await one('select client_engagement_backfill($1,true) result',[org])).result.inserted,0)
 check((await one('select historical from agency_client_activity where origin_id=$1',[missed.id])).historical,true)
 check((await one("select has_function_privilege('anon','public.client_engagement_summary(uuid,uuid)','execute') ok")).ok,false)
 // Developer organisations retain the same phone-only engagement capability.
 await service();const dev='33333333-3333-4333-8333-333333333333'
 await db.query("insert into organisations(id,type) values($1,'developer_company')",[dev])
 await db.query("insert into organisation_users(user_id,organisation_id,workspace_role,role,membership_status,status) values($1,$2,'agent','agent','active','active')",[staff,dev])
 const dc=await one("insert into contacts(organisation_id,assigned_agent_id,first_name,phone,contact_type) values($1,$2,'Developer phone client','27825555555','buyer') returning *",[dev,staff])
 const dp=(await one("select client_id from agency_client_links where source_kind='contact' and source_id=$1",[dc.contact_id])).client_id
 const dw=await one("insert into whatsapp_inbox_conversations(organisation_id,channel_id,contact_phone,assigned_user_id) values($1,gen_random_uuid(),'27825555555',$2) returning *",[dev,staff])
 await db.query("insert into whatsapp_inbox_messages(organisation_id,conversation_id,channel_id,direction,delivery_status) values($1,$2,$3,'inbound','received')",[dev,dw.id,dw.channel_id])
 await actor(staff)
 check((await one('select client_engagement_summary($1,$2) result',[dev,dp])).result.lastContact.channel,'whatsapp')
 check((await one('select client_contacted_at($1,$2) at',[dev,dc.contact_id])).at!==null,true)
 check((await one('select client_contacted_at($1,$2) at',[org,dc.contact_id])).at,null)
 // Stage 5 acceptance: import through the real unified catalogue and selectors.
 await service();await db.query("update organisation_users set status='active',membership_status='active' where organisation_id=$1 and user_id=$2",[org,staff])
 const opt=email=>({email,firstName:'Synthetic import',consent:'opted_in',consentSource:'Local acceptance fixture',consentAt:'2026-01-01T00:00:00Z'})
 const importRows=[opt('accepted@example.test'),opt('unsubscribed@example.test'),opt('suppressed@example.test'),{email:'unknown@example.test',consent:'unknown'}]
 await db.query("insert into contact_marketing_preferences(organisation_id,email,marketing_consent_status,unsubscribed_at) values($1,'unsubscribed@example.test','opted_out',now())",[org])
 await db.query("insert into email_suppressions(organisation_id,email,reason) values($1,'suppressed@example.test','provider_suppression')",[org])
 await actor(user)
 const importRequest='12345678-1234-4234-8234-123456789099'
 const runImport=(request=importRequest,name='Acceptance import',rows=importRows,scope=org,subscription=category.id)=>one('select email_import_audience($1,$2,$3,$4,$5) receipt',[scope,request,name,subscription,JSON.stringify(rows)])
 const receipt=(await runImport()).receipt
 check(receipt.total,4);check(receipt.added,4);check(receipt.eligible,1)
 check((await runImport()).receipt,receipt)
 const imported=await one('select * from marketing_audiences where id=$1',[receipt.audienceId])
 check(imported.visibility,'agency');check(imported.created_by,user)
 check(imported.definition,{emailFilter:{contact_ids:receipt.contactIds}})
 check((await one('select filter_json from email_saved_audiences where id=$1',[receipt.audienceId])).filter_json,imported.definition.emailFilter)
 check((await one('select marketing_audience_library($1) result',[org])).result.audiences.some(a=>a.id===receipt.audienceId),true)
 check((await one('select email_campaign_preview_audience($1,$2,$3) n',[org,category.id,JSON.stringify({saved_audience_id:receipt.audienceId})])).n,1)
 const selected=(await one("select marketing_audience_preview($1,$2,null,'email',$3) result",[org,receipt.audienceId,category.id])).result
 check(selected.emailEligible,1);check(selected.whatsappEligible,0)
 const importedCampaign=await one("insert into email_campaigns(organisation_id,created_by,sender_identity_id,subscription_type_id,name,subject,audience_filter) values($1,$2,$3,$4,'Imported acceptance','Local only',$5) returning id",[org,user,sender.id,category.id,JSON.stringify({saved_audience_id:receipt.audienceId})])
 check((await one('select email_campaign_prepare_dispatch($1) result',[importedCampaign.id])).result.added_recipients,1)
 check((await one('select email from email_campaign_recipients where campaign_id=$1',[importedCampaign.id])).email,'accepted@example.test')
 await assert.rejects(runImport(importRequest,'Changed payload'),/already used/);assertions++
 await assert.rejects(runImport('12345678-1234-4234-8234-123456789091','Acceptance import',[opt('duplicate-name-rollback@example.test')]),/name already exists/);assertions++
 await assert.rejects(runImport('12345678-1234-4234-8234-123456789092','Malformed',[opt('bad-rows-rollback@example.test'),{email:'invalid'}]),/invalid email/);assertions++
 await assert.rejects(runImport('12345678-1234-4234-8234-123456789093','Foreign',importRows,other),/active organisation sender/);assertions++
 await assert.rejects(runImport('12345678-1234-4234-8234-123456789094','Wrong category',importRows,org,'12345678-1234-4234-8234-123456789000'),/active email category/);assertions++
 await actor(staff);await assert.rejects(runImport('12345678-1234-4234-8234-123456789095','Staff bypass'),/active organisation sender/);assertions++
 await actor(outsider);check((await one('select count(*)::int n from email_audience_imports')).n,0)
 await service()
 check((await one("select count(*)::int n from email_marketing_contacts where email in ('duplicate-name-rollback@example.test','bad-rows-rollback@example.test')")).n,0)
 check((await one("select marketing_consent_status from contact_marketing_preferences where organisation_id=$1 and email='unsubscribed@example.test'",[org])).marketing_consent_status,'opted_out')
 check((await one("select marketing_consent_status from contact_marketing_preferences where organisation_id=$1 and email='unknown@example.test'",[org])).marketing_consent_status,'unknown')
 check((await one("select count(*)::int n from email_audience_imports where organisation_id=$1",[org])).n,1)
 check((await one("select has_function_privilege('anon','public.email_import_audience(uuid,uuid,text,uuid,jsonb)','execute') ok")).ok,false)
 // Legacy compatibility stays read-only; the correction does not reopen writes.
 await actor(user);await assert.rejects(db.query("insert into email_saved_audiences(organisation_id,name,filter_json) values($1,'Direct bypass','{}')",[org]),/permission denied|cannot insert/);assertions++
 // Developer managers use the same importer and catalogue without an agency detour.
 await service();await db.query("update organisation_users set workspace_role='owner',role='developer' where organisation_id=$1 and user_id=$2",[dev,staff])
 await one('select email_campaign_ensure_subscription_types($1)',[dev])
 const devCategory=await one('select id from email_subscription_types where organisation_id=$1 limit 1',[dev])
 await actor(staff)
 const devReceipt=(await runImport('12345678-1234-4234-8234-123456789096','Developer import',[opt('developer-import@example.test')],dev,devCategory.id)).receipt
 check(devReceipt.total,1);check(devReceipt.eligible,1)
 check((await one('select marketing_audience_library($1) result',[dev])).result.audiences.some(a=>a.id===devReceipt.audienceId),true)
 await actor(user);check((await one('select count(*)::int n from marketing_audiences where id=$1',[devReceipt.audienceId])).n,0)
 console.log(`Client engagement history: ${assertions} assertions passed`)
} catch(error) { console.error("Assertions completed:",assertions); throw error } finally {await db.close()}
