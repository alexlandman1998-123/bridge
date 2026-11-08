import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../the-it-guy/node_modules/@electric-sql/pglite/dist/index.js';
const dev='abcf1b8a-df2e-4dec-8b11-9958f18fc2f4',org='00000000-0000-4000-8000-000000000001',agent='00000000-0000-4000-8000-000000000002',manager='00000000-0000-4000-8000-000000000003';
const migration=new URL('../supabase/migrations/20261108123931_madison_website_enquiry_capture.sql',import.meta.url);
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.user',true),'')::uuid$$;
 create function bridge_can_manage_development_record(uuid) returns boolean language sql stable as $$select auth.uid()='${agent}'::uuid and $1='${dev}'::uuid$$;
 create table organisations(id uuid primary key);create table profiles(id uuid primary key);create table developments(id uuid primary key,organisation_id uuid);
 create table units(id uuid primary key);create table transactions(id uuid primary key);
 create table organisation_users(id uuid default gen_random_uuid(),user_id uuid,organisation_id uuid,email text,first_name text,last_name text,role text,status text,updated_at timestamptz default now());
 create table contacts(contact_id uuid primary key,organisation_id uuid,first_name text,last_name text,email text,phone text,contact_type text);
 create table leads(lead_id uuid primary key,organisation_id uuid,contact_id uuid,lead_category text,lead_domain text,lead_source text,source_channel text,stage text,status text,notes text,assigned_agent_id uuid,assigned_user_id uuid,assigned_agent_email text,enquired_listing_id uuid,enquired_property_title text,raw_enquiry_payload jsonb);
 create table private_listings(id uuid primary key,development_id uuid,organisation_id uuid,assigned_agent_id uuid,created_at timestamptz default now());
 create table lead_agent_email_jobs(organisation_id uuid,lead_id uuid,kind text default 'agent',payload_json jsonb,unique(organisation_id,lead_id,kind));
 create table development_visual_events(development_id uuid,session_id uuid,event_type text,occurred_at timestamptz default now(),scene_id text,unit_id text,metadata jsonb,viewport text);
 create function get_public_development_landing(text) returns jsonb language sql stable as $$select jsonb_build_object('id','${dev}')$$;
 insert into organisations values('${org}');insert into profiles values('${agent}'),('${manager}');insert into developments values('${dev}','${org}');
 insert into private_listings(id,development_id,organisation_id,assigned_agent_id) values(gen_random_uuid(),'${dev}','${org}','${agent}');
 insert into organisation_users(user_id,organisation_id,email,first_name,role,status) values('${agent}','${org}','agent@agency.co.za','Agent','agent','active'),('${manager}','${org}','manager@agency.co.za','Manager','owner','active');`);
 const foundation=await readFile(new URL('../supabase/migrations/20260816092532_developer_leads_phase10_foundation.sql',import.meta.url),'utf8');
 await db.exec(foundation.slice(foundation.indexOf('create table'),foundation.indexOf('create index')));
 await db.exec(await readFile(migration,'utf8'));return db;
}
const request=(db,id='10000000-0000-4000-8000-000000000001',fp='a',ip='b')=>db.query('select madison_capture_website_enquiry($1,$2,$3,$4,$5,$6,$7,$8) receipt',[id,'Buyer Name','buyer@agency.co.za','0820000000','Viewing options','Please arrange a viewing',fp.repeat(64),ip.repeat(64)]);
test('submission commits CRM, private developer lead, receipt and both staff notifications; clicks remain separate',async()=>{
 const db=await fixture();try{
 const result=(await request(db)).rows[0].receipt;assert.match(result.reference,/^MP-E-/);
 for(const table of ['leads','contacts','developer_leads','developer_lead_private_details','developer_lead_development_interests','development_enquiry_submissions'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,1,table);
 const jobs=(await db.query('select kind,payload_json from lead_agent_email_jobs order by kind')).rows;assert.equal(jobs.length,2);assert.equal(jobs[0].payload_json.to,'agent@agency.co.za');assert.equal(jobs[1].payload_json.to,'manager@agency.co.za');assert.equal(jobs[1].payload_json.eventKind,'new_website_enquiry_principal');
 const lead=(await db.query('select * from developer_leads')).rows[0];assert.equal(lead.assigned_agent_id,agent);assert.equal(lead.visibility_state,'full');assert.equal(lead.lead_status,'new');
 await db.query("insert into development_visual_events(development_id,session_id,event_type) values($1,gen_random_uuid(),'enquiry_started'),($1,gen_random_uuid(),'enquiry_started')",[dev]);
 const summary=(await db.query('select get_development_visual_analytics($1,30) a',[dev])).rows[0].a.summary;assert.equal(summary.enquiries,2);assert.equal(summary.submittedEnquiries,1);
 await db.exec('update development_enquiry_submissions set is_verification=true');assert.equal((await db.query('select get_development_visual_analytics($1,30) a',[dev])).rows[0].a.summary.submittedEnquiries,0);
 }finally{await db.close()}
});
test('same request and concurrent-content retries count once; reused request with changed data is rejected',async()=>{
 const db=await fixture();try{await request(db);assert.equal((await request(db)).rows[0].receipt.duplicate,true);assert.equal((await request(db,'20000000-0000-4000-8000-000000000002')).rows[0].receipt.duplicate,true);await assert.rejects(request(db,undefined,'c'),/already used/);assert.equal((await db.query('select count(*)::int n from leads')).rows[0].n,1)}finally{await db.close()}
});
test('rate limits and publication guard reject without partial lead records',async()=>{
 const db=await fixture();try{for(let i=0;i<10;i++)await request(db,`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`,String(i));await assert.rejects(request(db,'20000000-0000-4000-8000-000000000000','f'),/rate exceeded/);assert.equal((await db.query('select count(*)::int n from leads')).rows[0].n,10);await db.exec(`create or replace function get_public_development_landing(text) returns jsonb language sql stable as $$select null::jsonb$$`);await assert.rejects(request(db,'30000000-0000-4000-8000-000000000000','e','z'),/not published/)}finally{await db.close()}
});
test('outbox failure rolls back the whole enquiry; public roles cannot capture, read contacts or spoof ownership',async()=>{
 const db=await fixture();try{
 await db.exec("alter table lead_agent_email_jobs add constraint fail_queue check(kind<>'manager')");await assert.rejects(request(db));assert.equal((await db.query('select count(*)::int n from leads')).rows[0].n,0);await db.exec('alter table lead_agent_email_jobs drop constraint fail_queue');await request(db);
 await db.exec('grant usage on schema public,auth to anon,authenticated');
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(request(db),/permission denied/);await assert.rejects(db.query('select fingerprint from development_enquiry_submissions'),/permission denied/);await db.exec('reset role')}
 await db.query("select set_config('request.user',$1,false)",[manager]);await db.exec('set role authenticated');assert.equal((await db.query('select id from development_enquiry_submissions')).rows.length,0);await db.exec('reset role');await db.query("select set_config('request.user',$1,false)",[agent]);await db.exec('set role authenticated');assert.equal((await db.query('select id from development_enquiry_submissions')).rows.length,1);await db.exec('reset role');
 }finally{await db.close()}
});

test('confirmed delivery resolves only its own automatic attention task, never unconfirmed or customer tasks',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema private;create role anon;create role authenticated;
 create table tasks(task_id uuid primary key,organisation_id uuid,lead_id uuid,title text,status text default 'Pending',updated_at timestamptz);
 create table lead_agent_email_jobs(id uuid primary key,organisation_id uuid,lead_id uuid,attention_task_id uuid,status text,provider_message_id text);
 insert into tasks(task_id,organisation_id,lead_id,title) values('${agent}','${org}','${dev}','Review lead email delivery'),('${manager}','${org}','${dev}','Call the buyer');
 insert into lead_agent_email_jobs values('${agent}','${org}','${dev}','${agent}','pending',null),('${manager}','${org}','${dev}','${manager}','pending',null);`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261108125424_lead_email_delivery_attention_resolution.sql',import.meta.url),'utf8'));
 await db.query("update lead_agent_email_jobs set status='sent' where id=$1",[agent]);assert.equal((await db.query('select status from tasks where task_id=$1',[agent])).rows[0].status,'Pending');
 await db.query("update lead_agent_email_jobs set status='sent',provider_message_id='accepted' where id=$1",[agent]);assert.equal((await db.query('select status from tasks where task_id=$1',[agent])).rows[0].status,'Completed');
 await db.query("update lead_agent_email_jobs set status='sent',provider_message_id='accepted' where id=$1",[manager]);assert.equal((await db.query('select status from tasks where task_id=$1',[manager])).rows[0].status,'Pending');
 }finally{await db.close()}
});
