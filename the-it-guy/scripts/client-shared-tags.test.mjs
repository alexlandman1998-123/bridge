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
const denied=async promise=>{await assert.rejects(promise,/permission denied|Client access|required|changed|row-level security|Unsupported|owner or principal|workspace administrator/);assertions++}
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
 for(const name of ['marketing_audience_validate','marketing_audience_matches']) await db.exec(fn(read('20261025102447_shared_crm_marketing_audiences.sql'),name))
 const dev='33333333-3333-4333-8333-333333333333'
 await db.query("insert into organisations(id,type) values($1,'developer_company')",[dev])
 await db.query("insert into organisation_users(user_id,organisation_id,workspace_role,membership_status,status) values($1,$2,'owner','active','active'),($3,$2,'agent','active','active')",[user,dev,staff])
 const old=await add('before@example.com',staff,{org:dev})
 check((await one('select count(*)::integer n from agency_client_profiles where organisation_id=$1',[dev])).n,0)
 await db.exec(read('20261105183145_shared_client_identity_tags.sql'))
 check((await one("select bool_and(not has_function_privilege('anon',oid,'execute')) ok from pg_proc where oid in ('public.client_tag_workspace(uuid,uuid)'::regprocedure,'public.client_tags_save(uuid,uuid,bigint,text[])'::regprocedure,'public.client_identity_refresh(uuid)'::regprocedure,'arch9_client_private.client_tags_value(uuid)'::regprocedure)")).ok,true)
 check((await one("select relrowsecurity ok from pg_class where oid='public.agency_client_tags'::regclass")).ok,true)

 check((await one('select count(*)::integer n from agency_client_profiles where organisation_id=$1',[dev])).n,0)
 await service();check((await one('select client_identity_refresh($1) n',[dev])).n,1)
 const identity=async(id)=>one("select p.* from agency_client_profiles p join agency_client_links l on l.client_id=p.id where l.source_kind='contact' and l.source_id=$1",[id])
 const tagState=async(scope,id)=>(await one('select client_tag_workspace($1,$2) result',[scope,id])).result
 const saveTags=async(scope,id,version,tags)=>(await one('select client_tags_save($1,$2,$3,$4) result',[scope,id,version,tags])).result
 const oldProfile=await identity(old.contact_id)
 check(Boolean(oldProfile.id),true)
 const phone=await one("insert into contacts(organisation_id,assigned_agent_id,first_name,phone) values($1,$2,'Phone Only','0821234567') returning *",[dev,staff])
 const phoneProfile=await identity(phone.contact_id)
 check(phoneProfile.primary_phone,'27821234567')
 check((await one('select count(*)::integer n from email_marketing_contacts where organisation_id=$1',[dev])).n,1)
 await actor(staff)
 check((await one('select client_identity_can_manage($1) ok',[dev])).ok,false)
 let snapshot=await tagState(dev,phoneProfile.id)
 snapshot=await saveTags(dev,phoneProfile.id,snapshot.tagVersion,[' Investor ','investor','Launch'])
 check(snapshot.tags,['investor','launch'])
 check(snapshot.emails,[])
 await denied(saveTags(dev,phoneProfile.id,snapshot.tagVersion-1,['lost']))
 await denied(db.query("insert into agency_client_tags(organisation_id,client_id,tag) values($1,$2,'bypass')",[dev,phoneProfile.id]))
 await actor(outsider);await denied(tagState(dev,phoneProfile.id));await denied(saveTags(dev,phoneProfile.id,snapshot.tagVersion,['wrong']))
 await actor(staff);await denied(tagState(other,phoneProfile.id));await denied(db.query('select client_identity_refresh($1)',[dev]))
 // Shared phone tags participate in the actual CRM audience matcher.
 const definition={match:'all',rules:[{field:'tags',operator:'in',values:['investor']}],excludeClosed:true,quietDays:0}
 let members=(await db.query('select * from marketing_audience_members($1,$2)',[dev,JSON.stringify(definition)])).rows
 check(members.map(m=>m.contact_id),[phone.contact_id]);check(members[0].phone,'27821234567');check(members[0].email_reason,'Email sending access required')
 await service();await db.query("insert into whatsapp_marketing_contacts(organisation_id,phone,consent_status,consent_at) values($1,'27821234567','opted_in',now())",[dev])
 await actor(staff);members=(await db.query('select * from marketing_audience_members($1,$2)',[dev,JSON.stringify(definition)])).rows
 check(members[0].whatsapp_reason,null)
 // Adding an email later retains the phone client's shared tags in the feed.
 await service();await db.query("update contacts set email='phone-later@example.com' where contact_id=$1",[phone.contact_id])
 check((await one("select tags from email_marketing_contacts where organisation_id=$1 and email='phone-later@example.com'",[dev])).tags,['investor','launch'])
 // Same phone/name is review evidence, never an automatic identity merge.
 const samePhone=await one("insert into contacts(organisation_id,assigned_agent_id,first_name,phone) values($1,$2,'Phone Only','+27 82 123 4567') returning *",[dev,staff])
 check((await identity(samePhone.contact_id)).id===phoneProfile.id,false)
 const secondary=await add('secondary@example.com',staff,{org:dev})
 const secondaryProfile=await identity(secondary.contact_id)
 await actor(staff);let otherState=await tagState(dev,secondaryProfile.id)
 otherState=await saveTags(dev,secondaryProfile.id,otherState.tagVersion,['secondary'])
 await denied(db.query('select agency_client_merge($1,$2,$3,$4,$5)',[phoneProfile.id,secondaryProfile.id,phoneProfile.version,secondaryProfile.version,'Unpermitted merge']))
 // Legacy destination tags remain visible; their changes invalidate stale saves.
 const primaryBefore=await tagState(dev,phoneProfile.id)
 await db.query("update email_marketing_contacts set tags=array['legacy'] where organisation_id=$1 and email='phone-later@example.com'",[dev])
 await denied(saveTags(dev,phoneProfile.id,primaryBefore.tagVersion,['overwrite']))
 check((await tagState(dev,phoneProfile.id)).tags,['investor','launch','legacy'])
 await service();const beforeMerge=await identity(phone.contact_id),secondBeforeMerge=await identity(secondary.contact_id)
 const sourceCount=(await one('select count(*)::integer n from contacts')).n
 await one('select email_campaign_ensure_subscription_types($1)',[dev])
 const category=await one('select id from email_subscription_types where organisation_id=$1 limit 1',[dev])
 await db.query("insert into contact_marketing_preferences(organisation_id,email,marketing_consent_status) values($1,'phone-later@example.com','opted_in'),($1,'secondary@example.com','opted_out')",[dev])
 await db.query("insert into contact_email_subscriptions(organisation_id,email,subscription_type_id,status) values($1,'phone-later@example.com',$2,'subscribed'),($1,'secondary@example.com',$2,'unsubscribed')",[dev,category.id])
 await db.query("insert into email_suppressions(organisation_id,email,reason) values($1,'secondary@example.com','unsubscribe')",[dev])
 const consentSnapshot=await one("select (select jsonb_agg(p order by email) from contact_marketing_preferences p) preferences,(select jsonb_agg(s order by email) from contact_email_subscriptions s) subscriptions,(select jsonb_agg(s order by email) from email_suppressions s) suppressions")
 const consentCounts=await one('select (select count(*)::integer from contact_marketing_preferences) preferences,(select count(*)::integer from contact_email_subscriptions) subscriptions,(select count(*)::integer from email_suppressions) suppressions')
 await actor(user);check((await one('select client_identity_can_manage($1) ok',[dev])).ok,true)
 await one('select agency_client_merge($1,$2,$3,$4,$5)',[beforeMerge.id,secondBeforeMerge.id,beforeMerge.version,secondBeforeMerge.version,'Synthetic reviewed merge'])
 const combined=await tagState(dev,phoneProfile.id)
 check(combined.tags,['investor','launch','legacy','secondary'])
 check(combined.emails,['phone-later@example.com','secondary@example.com'])
 check((await tagState(dev,secondaryProfile.id)).clientId,phoneProfile.id)
 await denied(saveTags(dev,secondaryProfile.id,otherState.tagVersion,['stale']))
 const replaced=await saveTags(dev,phoneProfile.id,combined.tagVersion,['shared'])
 check(replaced.tags,['shared'])
 check((await one("select email_audience_preview($1,'{\"tag\":\"shared\"}') result",[dev])).result.count,2)
 check((await one("select email_campaign_preview_audience($1,$2,'{\"tag\":\"shared\"}') n",[dev,category.id])).n,1)
 await service();await one("select email_campaign_apply_platform_status('synthetic-platform','verified',true)")
 await actor(user);const sender=await shared(dev)
 const campaign=await one("insert into email_campaigns(organisation_id,created_by,sender_identity_id,subscription_type_id,name,subject,audience_filter) values($1,$2,$3,$4,'Shared tags local check','Local test','{\"tag\":\"shared\"}') returning id",[dev,user,sender.id,category.id])
 check((await one('select email_campaign_prepare_dispatch($1) result',[campaign.id])).result.added_recipients,1)
 check((await one('select email from email_campaign_recipients where campaign_id=$1',[campaign.id])).email,'phone-later@example.com')


 await service();check((await one('select count(*)::integer n from contacts')).n,sourceCount)
 check(await one("select (select jsonb_agg(p order by email) from contact_marketing_preferences p) preferences,(select jsonb_agg(s order by email) from contact_email_subscriptions s) subscriptions,(select jsonb_agg(s order by email) from email_suppressions s) suppressions"),consentSnapshot)

 check(await one('select (select count(*)::integer from contact_marketing_preferences) preferences,(select count(*)::integer from contact_email_subscriptions) subscriptions,(select count(*)::integer from email_suppressions) suppressions'),consentCounts)
 check((await db.query("select tags from email_marketing_contacts where organisation_id=$1 and email in ('phone-later@example.com','secondary@example.com')",[dev])).rows.map(r=>r.tags),[['shared'],['shared']])
 // Reassignment to a colleague removes full-person access instead of leaking tags.
 await db.query('update contacts set assigned_agent_id=$1 where contact_id=$2',[colleague,secondary.contact_id])
 await actor(staff);await denied(tagState(dev,phoneProfile.id))
 check((await db.query('select * from marketing_audience_members($1,$2)',[dev,JSON.stringify({...definition,rules:[{field:'tags',operator:'in',values:['shared']}]})])).rows.length,0)
 check((await one('select count(*)::integer n from agency_client_profiles where id=$1',[phoneProfile.id])).n,0)
 await actor(user);check((await tagState(dev,phoneProfile.id)).tags,['shared'])
 // Agency clients use the same shared API and keep their established scope.
 await service();const agencyContact=await add('agency-shared@example.com');const agencyProfile=await identity(agencyContact.contact_id)
 await actor(staff);const agencyState=await tagState(org,agencyProfile.id)
 check((await saveTags(org,agencyProfile.id,agencyState.tagVersion,['agency-tag'])).tags,['agency-tag'])
 // Workspaces remain isolated even with the same email or phone.
 await service();const foreign=await add('phone-later@example.com',outsider,{org:other});const foreignProfile=await identity(foreign.contact_id)
 await actor(outsider);check((await tagState(other,foreignProfile.id)).tags,[])
 await service();await db.query("update organisation_users set membership_status='inactive' where organisation_id=$1 and user_id=$2",[dev,staff])
 await actor(staff);await denied(tagState(dev,oldProfile.id))
 check((await tagState(org,agencyProfile.id)).tags,['agency-tag'])
 await denied(db.query('select arch9_client_private.client_tags_value($1)',[agencyProfile.id]))
 await db.exec('reset role;set role anon');await denied(db.query('select client_tag_workspace($1,$2)',[dev,phoneProfile.id]))
 console.log(`Shared client identity and tag checks passed: ${assertions} assertions; developer intake/backfill, phone-only tags, alias merges, source privacy, conflicts, channel matching and unchanged consent.`)
} finally {await db.close()}
