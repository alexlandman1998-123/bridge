// @vitest-environment node
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest'
const org='10000000-0000-4000-8000-000000000001',actor='20000000-0000-4000-8000-000000000001',dev='abcf1b8a-df2e-4dec-8b11-9958f18fc2f4',other='30000000-0000-4000-8000-000000000001',contact='40000000-0000-4000-8000-000000000001',email='50000000-0000-4000-8000-000000000001',wa='60000000-0000-4000-8000-000000000001',lead='70000000-0000-4000-8000-000000000001'
const context=()=>({source:'development_workspace',version:1,organisation_id:org,development_id:dev,development_name:'Madison fixture'})
let db
beforeAll(async()=>{
 db=new PGlite()
 const campaignSchema=readFileSync(new URL('../../../../supabase/migrations/20261022132550_marketing_campaign_initiatives.sql',import.meta.url),'utf8')
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema arch9_client_private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create table auth.users(id uuid primary key);create table organisations(id uuid primary key);
 create table developments(id uuid primary key,organisation_id uuid,name text,status text);
 create table development_profiles(development_id uuid primary key,marketing_content jsonb,image_links jsonb,description text,revision bigint default 0);
 create table contacts(contact_id uuid primary key,organisation_id uuid,email text,phone text);
 create table leads(lead_id uuid primary key,organisation_id uuid,contact_id uuid);
 create table developer_leads(developer_lead_id uuid primary key,source_lead_id uuid,developer_org_id uuid,source_agency_org_id uuid,primary_development_id uuid);
 create table developer_lead_development_interests(developer_lead_id uuid,developer_org_id uuid,development_id uuid);
 create table email_marketing_contacts(id uuid primary key,organisation_id uuid,source_type text,source_id uuid,email text,full_name text,role_type text,lead_stage text,area text,branch_id uuid,assigned_user_id uuid,tags text[],is_valid_email boolean);
 create table email_marketing_contact_sources(organisation_id uuid,marketing_contact_id uuid,source_kind text,source_id uuid);
 create table whatsapp_marketing_contacts(id uuid primary key,organisation_id uuid,phone text,consent_status text,opted_out_at timestamptz);
 create table marketing_events(id uuid primary key,organisation_id uuid,subject_type text,subject_id uuid,title text,event_type text,status text,starts_at timestamptz,location text,address text,description text,image_url text);
 create table email_campaigns(id uuid primary key,organisation_id uuid,name text,status text,created_by uuid,updated_at timestamptz default now(),content_json jsonb);
 create table whatsapp_campaigns(id uuid primary key,organisation_id uuid,name text,status text,created_by uuid,parameter_values jsonb);
 ${campaignSchema.match(/create table public.marketing_campaigns \([\s\S]*?\n\);/)[0]}
 ${campaignSchema.match(/create table public.marketing_campaign_activities \([\s\S]*?\n\);/)[0]}
 create table marketing_audiences(id uuid,organisation_id uuid,visibility text,created_by uuid,definition jsonb,archived_at timestamptz);
 create function bridge_has_organisation_membership(target uuid) returns boolean language sql stable as $$select target='${org}'::uuid and auth.uid()='${actor}'::uuid$$;
 create function bridge_is_active_member(target uuid) returns boolean language sql stable as $$select public.bridge_has_organisation_membership(target)$$;
 create function bridge_can_manage_development_record(target uuid) returns boolean language sql stable as $$select exists(select 1 from public.developments where id=target and public.bridge_has_organisation_membership(organisation_id))$$;
 create function email_campaign_resolve_audience_rules(target uuid,rules jsonb) returns jsonb language sql stable as $$select rules$$;
 create function arch9_client_private.email_contact_visible(target uuid,email text) returns boolean language sql stable as $$select true$$;
 create function arch9_client_private.client_tags_for_email(target uuid,email text) returns text[] language sql stable as $$select null::text[]$$;
 create function marketing_audience_crm_members(target uuid,definition jsonb,category uuid) returns table(email_id uuid,recent boolean) language sql stable as $$select null::uuid,false where false$$;
 create function email_audience_rule_matches(contact public.email_marketing_contacts,rules jsonb) returns boolean language sql stable as $$select true$$;
 create function whatsapp_crm_phone(phone text) returns text language sql immutable as $$select regexp_replace(phone,'[^0-9]','','g')$$;
 create table email_campaign_recipients(id uuid primary key,organisation_id uuid,campaign_id uuid);
 create table whatsapp_campaign_recipients(id uuid primary key,organisation_id uuid,campaign_id uuid);
 create table marketing_attribution_links(id uuid primary key default gen_random_uuid(),token text unique default replace(gen_random_uuid()::text,'-',''),organisation_id uuid,channel text,email_campaign_id uuid,whatsapp_campaign_id uuid,email_recipient_id uuid,whatsapp_recipient_id uuid,target_url text,campaign_id uuid generated always as(coalesce(email_campaign_id,whatsapp_campaign_id)) stored,recipient_id uuid generated always as(coalesce(email_recipient_id,whatsapp_recipient_id)) stored,target_key text generated always as(md5(target_url)) stored,unique(channel,campaign_id,recipient_id,target_key));
 create table marketing_conversions(id uuid default gen_random_uuid(),organisation_id uuid,link_id uuid,channel text,campaign_id uuid,kind text,source_key text,lead_id uuid,occurred_at timestamptz,unique(organisation_id,channel,campaign_id,kind,source_key));
 create table development_enquiry_submissions(id uuid primary key,development_id uuid,lead_id uuid,developer_lead_id uuid,is_verification boolean default false,created_at timestamptz default now());
 create table website_sites(id uuid,organisation_id uuid,status text);create table website_domains(website_site_id uuid,hostname text,status text);
 create function marketing_attribution_in_window(target uuid,at_time timestamptz) returns boolean language sql stable as $$select current_setting('test.attribution_valid',true)='yes'$$;
 create function madison_capture_website_enquiry(request uuid,name text,email text,phone text,interest text,message text,fingerprint text,ip_hash text) returns jsonb language plpgsql security invoker as $$declare new_lead uuid:=gen_random_uuid();begin
 if exists(select 1 from public.development_enquiry_submissions where id=request) then return jsonb_build_object('reference','fixture','duplicate',true);end if;
 insert into public.leads values(new_lead,'${org}',null);
 insert into public.development_enquiry_submissions(id,development_id,lead_id) values(request,'${dev}',new_lead);
 return jsonb_build_object('reference','fixture','duplicate',false);end$$;
 grant usage on schema auth,arch9_client_private to authenticated,service_role;
 grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
 grant select on auth.users to authenticated,service_role;
 `)
 await db.exec(`revoke insert on marketing_campaigns from authenticated;grant insert(organisation_id,name,goal,objective,audience,status,planned_channels,created_by) on marketing_campaigns to authenticated;${campaignSchema.match(/create function public.marketing_campaign_protect_plan[\s\S]*?create trigger marketing_campaign_validate_activity[\s\S]*?;/)[0]}`)
 for(const table of ['developments','contacts','leads','email_marketing_contacts','whatsapp_marketing_contacts','marketing_events','marketing_campaigns','marketing_campaign_activities'])await db.exec(`alter table ${table} enable row level security;create policy scoped on ${table} to authenticated using(public.bridge_has_organisation_membership(organisation_id)) with check(public.bridge_has_organisation_membership(organisation_id));`)
 await db.exec(readFileSync(new URL('../../../../supabase/migrations/20261109193000_development_campaign_connections.sql',import.meta.url),'utf8'))
},30000)
afterAll(async()=>{await db?.close()})
beforeEach(async()=>{
 await db.exec("reset role;set test.attribution_valid='yes';revoke insert on marketing_campaign_activities from authenticated;grant insert(organisation_id,campaign_id,channel,email_campaign_id,whatsapp_campaign_id) on marketing_campaign_activities to authenticated;truncate marketing_campaign_activities,marketing_campaigns,email_campaigns,whatsapp_campaigns,email_marketing_contacts,email_marketing_contact_sources,whatsapp_marketing_contacts,developer_lead_development_interests,developer_leads,leads,contacts,development_profiles,developments,marketing_events,marketing_attribution_links,marketing_conversions,development_enquiry_submissions,email_campaign_recipients,whatsapp_campaign_recipients;")
 await db.query('insert into auth.users values($1) on conflict do nothing',[actor]);await db.query('insert into organisations values($1),($2) on conflict do nothing',[org,other])
 await db.query("insert into developments values($1,$2,'Madison fixture','active'),($3,$3,'Other','active')",[dev,org,other]);await db.query(`insert into development_profiles(development_id,marketing_content) values($1,'{"listingConfiguration":{"publicVisibility":true,"marketingStatus":"live","listingSlug":"madison-fixture"}}')`,[dev])
 await db.query("insert into contacts values($1,$2,'buyer@fixture.test','27820000000')",[contact,org]);await db.query('insert into leads values($1,$2,$3)',[lead,org,contact]);await db.query('insert into developer_leads values($1,$2,$3,null,$4)',[lead,lead,org,dev])
 await db.query("insert into email_marketing_contacts(id,organisation_id,source_type,source_id,email,is_valid_email) values($1,$2,'crm',$3,'buyer@fixture.test',true),($4,$2,'manual',null,'other@fixture.test',true)",[email,org,contact,other])
 await db.query("insert into whatsapp_marketing_contacts values($1,$2,'27820000000','opted_in',null)",[wa,org]);await db.query("insert into marketing_events(id,organisation_id,subject_type,subject_id,title,event_type,status,starts_at) values($1,$2,'development',$3,'Launch','launch','upcoming','2030-11-20T10:00:00Z')",[lead,org,dev])
 await db.query("select set_config('test.actor',$1,false)",[actor]);await db.exec('set role authenticated;')
})
async function prepare(development=dev){return(await db.query('select bridge_prepare_development_campaign($1,$2) value',[org,development])).rows[0].value}
async function match(filter){return(await db.query('select id,email_campaign_contact_filter_matches(c,$1::jsonb) matches from email_marketing_contacts c order by id',[JSON.stringify(filter)])).rows}
async function saveEmail(ctx=context(),id=email){return db.query('insert into email_campaigns(id,organisation_id,name,status,created_by,content_json) values($1,$2,\'Development campaign\',\'draft\',$3,$4::jsonb)',[id,org,actor,JSON.stringify({arch9_context:ctx})])}
it('prepares the scoped saved development, events and opted-in WhatsApp audience',async()=>{
 const result=await prepare();expect(result.development.id).toBe(dev);expect(result.events[0]).toMatchObject({id:lead,title:'Launch'});expect(result.whatsappContactIds).toEqual([wa])
 await db.query("update whatsapp_marketing_contacts set consent_status='opted_out' where id=$1",[wa]);expect((await prepare()).whatsappContactIds).toEqual([])
})
it('limits email matching to actual development contacts and matches nobody when that cohort is empty',async()=>{
 expect((await match({development_id:dev})).filter(row=>row.matches).map(row=>row.id)).toEqual([email])
 await db.query('delete from developer_leads');expect((await match({development_id:dev})).some(row=>row.matches)).toBe(false)
 expect((await match({})).every(row=>row.matches)).toBe(true)
})
it('keeps existing source aliases connected and refuses a foreign tenant audience',async()=>{
 await db.query("update email_marketing_contacts set source_id=null where id=$1",[email]);await db.query("insert into email_marketing_contact_sources values($1,$2,'crm_contact',$3)",[org,email,contact])
 expect((await match({development_id:dev})).filter(row=>row.matches).map(row=>row.id)).toEqual([email])
 expect((await match({development_id:other})).some(row=>row.matches)).toBe(false)
 await expect(prepare(other)).rejects.toMatchObject({code:'42501'})
})
it('creates one real plan/activity in the same transaction as the prepared email draft',async()=>{
 await saveEmail();const plans=(await db.query('select * from marketing_campaigns')).rows;expect(plans).toHaveLength(1);expect(plans[0].planned_channels).toEqual(['email'])
 expect((await db.query('select email_campaign_id from marketing_campaign_activities')).rows[0].email_campaign_id).toBe(email)
 await db.query("update email_campaigns set content_json=content_json||'{\"version\":1}'::jsonb where id=$1",[email]);expect((await db.query('select count(*)::int total from marketing_campaigns')).rows[0].total).toBe(1)
})
it('links WhatsApp plans without granting browser channel-write privileges in production',async()=>{
 await db.exec('set role service_role;');await db.query('insert into whatsapp_campaigns values($1,$2,\'WhatsApp draft\',\'draft\',$3,$4::jsonb)',[wa,org,actor,JSON.stringify({__arch9_context:context()})])
 expect((await db.query('select whatsapp_campaign_id from marketing_campaign_activities')).rows[0].whatsapp_campaign_id).toBe(wa)
})
it('rolls channel and plan creation back if its activity cannot be linked',async()=>{
 await db.exec('reset role;revoke insert(organisation_id,campaign_id,channel,email_campaign_id,whatsapp_campaign_id) on marketing_campaign_activities from authenticated;set role authenticated;')
 await expect(saveEmail()).rejects.toMatchObject({code:'42501'})
 expect((await db.query('select count(*)::int total from email_campaigns')).rows[0].total).toBe(0);expect((await db.query('select count(*)::int total from marketing_campaigns')).rows[0].total).toBe(0)
})
it('preserves legacy context-only drafts and blocks moving a linked prepared draft to another source',async()=>{
 await saveEmail({development_id:dev});expect((await db.query('select count(*)::int total from marketing_campaigns')).rows[0].total).toBe(0)
 await db.query('delete from email_campaigns');await saveEmail()
 await expect(db.query("update email_campaigns set content_json=content_json||'{\"arch9_context\":{\"source\":\"legacy\"}}'::jsonb where id=$1",[email])).rejects.toMatchObject({code:'22023'})
 await expect(db.query("update email_campaigns set content_json=jsonb_set(content_json,'{arch9_context,development_id}',$1::jsonb) where id=$2",[JSON.stringify(other),email])).rejects.toMatchObject({code:'22023'})
})
it('rejects cancelled event sources before creating their first campaign link',async()=>{
 await db.query("update marketing_events set status='cancelled'")
 await expect(saveEmail({...context(),event_id:lead})).rejects.toMatchObject({code:'22023'})
 expect((await db.query('select count(*)::int total from email_campaigns')).rows[0].total).toBe(0)
})
async function attributedLead(token,request=crypto.randomUUID()){return(await db.query("select madison_capture_campaign_enquiry($1,'Buyer','buyer@fixture.test','0820000000','Viewing','Hello','fingerprint','private-hash',$2) value",[request,token])).rows[0].value}
it('qualifies only published owned development targets as first party',async()=>{
 await db.exec('set role service_role;')
 expect((await db.query("select bridge_development_attribution_target($1,'https://app.arch9.co.za/development/madison-fixture') id",[org])).rows[0].id).toBe(dev)
 expect((await db.query("select bridge_development_attribution_target($1,'https://evil.test/development/madison-fixture') id",[org])).rows[0].id).toBeNull()
 await db.query("update development_profiles set marketing_content='{}'");expect((await db.query("select bridge_development_attribution_target($1,'https://madisonplace.co.za') id",[org])).rows[0].id).toBeNull()
})
it('connects a validated development campaign click to one real CRM lead conversion and replays safely',async()=>{
 await saveEmail();await db.exec('set role service_role;')
 const link=(await db.query("select marketing_create_attribution_link('email',$1,null,'https://madisonplace.co.za') value",[email])).rows[0].value
 expect(link.firstParty).toBe(true)
 const request=crypto.randomUUID();await attributedLead(link.token,request);await attributedLead(link.token,request)
 const conversions=(await db.query('select * from marketing_conversions')).rows;expect(conversions).toHaveLength(1);expect(conversions[0]).toMatchObject({campaign_id:email,channel:'email',kind:'lead_created'})
})
it('keeps ordinary and invalid/expired attribution enquiries working without inventing campaign leads',async()=>{
 await saveEmail();await db.exec('set role service_role;')
 await attributedLead(null);await attributedLead('unknown')
 const link=(await db.query("select marketing_create_attribution_link('email',$1,null,'https://madisonplace.co.za') value",[email])).rows[0].value
 await db.exec("set test.attribution_valid='no';");await attributedLead(link.token)
 expect((await db.query('select count(*)::int total from development_enquiry_submissions')).rows[0].total).toBe(3)
 expect((await db.query('select count(*)::int total from marketing_conversions')).rows[0].total).toBe(0)
})
it('keeps preparation signed-in and attribution intake/link resolution service-only',async()=>{
 const privileges=(await db.query("select has_function_privilege('anon','public.bridge_prepare_development_campaign(uuid,uuid)','execute') prep,has_function_privilege('authenticated','public.madison_capture_campaign_enquiry(uuid,text,text,text,text,text,text,text,text)','execute') intake,has_function_privilege('authenticated','public.marketing_resolve_attribution_link(text)','execute') resolve")).rows[0]
 expect(privileges).toEqual({prep:false,intake:false,resolve:false})
 await db.query("select set_config('test.actor','',false)");await expect(prepare()).rejects.toMatchObject({code:'42501'})
})
it('rolls enquiry capture back if recording a valid conversion fails',async()=>{
 await saveEmail();await db.exec('set role service_role;')
 const link=(await db.query("select marketing_create_attribution_link('email',$1,null,'https://madisonplace.co.za') value",[email])).rows[0].value
 await db.exec("reset role;create function reject_conversion() returns trigger language plpgsql as $$begin raise exception 'conversion storage unavailable';end$$;create trigger reject_conversion before insert on marketing_conversions for each row execute function reject_conversion();set role service_role;")
 try {
  const request=crypto.randomUUID()
  await expect(attributedLead(link.token,request)).rejects.toThrow('conversion storage unavailable')
  expect((await db.query('select count(*)::int total from development_enquiry_submissions where id=$1',[request])).rows[0].total).toBe(0)
  expect((await db.query('select count(*)::int total from leads')).rows[0].total).toBe(1)
 }finally{await db.exec('reset role;drop trigger reject_conversion on marketing_conversions;drop function reject_conversion();')}
})
