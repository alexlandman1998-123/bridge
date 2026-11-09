import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const org=id(1),other=id(2),user=id(3),sender=id(4),foreign=id(5),listingId=id(6),connection=id(7)
export async function fixture({workspace=false}={}){
  const db=new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table organisations(id uuid primary key);
    create table organisation_communication_channels(id uuid primary key,organisation_id uuid,branch_id uuid,provider text,channel_type text,waba_id text,phone_number_id text,meta_business_id text,display_phone_number text,business_display_name text,connection_status text,verification_status text,is_default boolean,connected_at timestamptz,disconnected_at timestamptz,last_error_message text,last_checked_at timestamptz,created_by uuid,created_at timestamptz default now(),updated_at timestamptz,meta_access_token text);
    create table meta_lead_ads_connections(id uuid primary key,organisation_id uuid,page_id text,page_name text,connection_status text,token_ciphertext text,last_error_message text,connected_at timestamptz default now());
    create table private_listings(id uuid primary key,organisation_id uuid);
    create table organisation_users(user_id uuid,organisation_id uuid,status text,role text);
    create table whatsapp_campaigns(id uuid primary key,sender_id uuid,status text);
    create table whatsapp_campaign_jobs(campaign_id uuid,status text);
    create table whatsapp_campaign_recipients(id uuid primary key default gen_random_uuid(),campaign_id uuid,status text);
    create table whatsapp_marketing_contacts(id uuid primary key default gen_random_uuid(),organisation_id uuid,phone text,consent_status text,opted_out_at timestamptz,updated_at timestamptz);
    grant all on organisation_communication_channels to anon,authenticated;
    alter table organisation_communication_channels enable row level security;
    create policy org_read on organisation_communication_channels for select to authenticated using(organisation_id=current_setting('test.org',true)::uuid);`)
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261017172424_meta_inbox_and_listing_posts.sql',import.meta.url),'utf8'))
  for (const migration of ['20261018094503_whatsapp_inbox_agent_ownership.sql','20261018111956_whatsapp_inbox_messaging.sql','20261018125856_whatsapp_business_app_sync.sql','20261018140502_instagram_listing_posts.sql']) await db.exec(readFileSync(new URL('../../../supabase/migrations/'+migration,import.meta.url),'utf8'))
  await db.query('insert into organisations values($1),($2)',[org,other]);await db.query('insert into auth.users values($1)',[user]);await db.query('insert into private_listings values($1,$2)',[listingId,org])
  await db.query("insert into organisation_users(user_id,organisation_id,status,role) values($1,$2,'active','owner')",[user,org])
  await db.exec("alter table organisation_users enable row level security; create policy own_membership on organisation_users for select to authenticated using(user_id=auth.uid()); grant select on organisation_users to authenticated;")
  await db.query("insert into organisation_communication_channels(id,organisation_id,provider,channel_type,phone_number_id,waba_id,connection_status,meta_access_token) values($1,$2,'meta','whatsapp','100','200','connected','secret'),($3,$4,'meta','whatsapp','101','201','connected','foreign-secret')",[sender,org,foreign,other])
  await db.query("insert into meta_lead_ads_connections(id,organisation_id,page_id,page_name,connection_status,token_ciphertext,granted_scopes,page_tasks) values($1,$2,'300','Test Page','connected','encrypted',array['pages_manage_posts'],array['CREATE_CONTENT'])",[connection,org])
  if(workspace){
    await db.exec("create table notification_provider_webhook_events(id uuid primary key default gen_random_uuid(),provider text,provider_event_id text,event_type text,provider_message_id text,payload_json jsonb default '{}',processing_status text default 'received',processing_error text,received_at timestamptz default now(),processed_at timestamptz,unique(provider,provider_event_id));");
    await db.exec('alter table organisation_users add column first_name text,add column last_name text,add column email text;');
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20261103193901_whatsapp_personal_number_assignment_guard.sql',import.meta.url),'utf8'));
    await db.exec(readFileSync(new URL('../../../supabase/migrations/20261109184918_whatsapp_inbox_workspace_reliability.sql',import.meta.url),'utf8'));
  }
  return db
}

// Minimal PostgREST adapter: executes the real handler queries against PostgreSQL.
export function sqlClient(db){return {rpc:async(name,args)=>{try{return {data:(await db.query(`select * from ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')})`,Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v))).rows.map(row => Object.keys(row).length===1 ? Object.values(row)[0] : row)[0],error:null}}catch(error){return {data:null,error}}},from:table=>{
  let columns='*',filters=[],values=[],mutation=null,mode='',order=[],limit=''
  const bind=v=>{values.push(v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v);return `$${values.length}`}
  const q={select(c='*'){columns=c;return q},eq(k,v){filters.push(`${k}=${bind(v)}`);return q},is(k,v){assert.equal(v,null);filters.push(`${k} is null`);return q},gt(k,v){filters.push(`${k}>${bind(v)}`);return q},lte(k,v){filters.push(`${k}<=${bind(v)}`);return q},order(k,o={}){order.push(`${k} ${o.ascending===false?'desc':'asc'}`);return q},limit(n){limit=` limit ${Number(n)}`;return q},single(){mode='single';return q},maybeSingle(){mode='maybe';return q},update(patch){mutation=`update ${table} set ${Object.entries(patch).map(([k,v])=>`${k}=${bind(v)}`).join(',')}`;return q},insert(row){mutation=`insert into ${table}(${Object.keys(row).join(',')}) values(${Object.values(row).map(bind).join(',')})`;return q},async then(resolve){try{const where=filters.length?` where ${filters.join(' and ')}`:'';const sql=mutation?`${mutation}${where} returning ${columns}`:`select ${columns} from ${table}${where}${order.length?` order by ${order.join(',')}`:''}${limit}`;const rows=(await db.query(sql,values)).rows;if(mode==='single'&&rows.length!==1)throw Error('Expected one row');return resolve({data:mode?rows[0]||null:rows,error:null})}catch(error){return resolve({data:null,error})}}};return q
}}}