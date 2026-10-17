import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { canReply, publicListingPost, applyWhatsAppInboxWebhook } from '../../supabase/functions/_shared/metaIntegrationCore.js'
import { createMetaIntegrationHandler } from '../../supabase/functions/meta-integrations/handler.js'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org=id(1), other=id(2), user=id(3), sender=id(4), foreign=id(5), listingId=id(6), connection=id(7)
const time='2026-10-17T17:00:00.000Z', origin='https://example.supabase.co'
const listing={id:listingId,organisation_id:org,title:'Family home',description:'Public description',asking_price:1000000,suburb:'Claremont',city:'Cape Town',listing_status:'active',is_active:true,updated_at:time,notes:'PRIVATE NOTE',street_address:'PRIVATE ADDRESS'}

test('24-hour reply boundary and public listing snapshots',()=>{
  const now=Date.parse(time)
  assert.equal(canReply({last_inbound_at:new Date(now-86400000).toISOString()},now),false)
  assert.equal(canReply({last_inbound_at:new Date(now-86399999).toISOString()},now),true)
  assert.equal(canReply({last_inbound_at:new Date(now+120000).toISOString()},now),false)
  const snapshot=publicListingPost(listing,[],{},origin)
  assert.equal(snapshot.mode,'text');assert.ok(snapshot.caption.includes('Family home'))
  assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'))
  for(const url of ['http://example.com/a','https://evil.com/a','https://example.supabase.co/storage/v1/object/public/listing-media/a?token=secret']) {
    assert.throws(()=>publicListingPost(listing,[{id:id(9),media_type:'image',file_url:url}],{mode:'photo'},origin),/public listing photo/)
  }
  assert.throws(()=>publicListingPost({...listing,is_active:false}),/active listing/)
})

test('authorization precedes data access and connection management requires an admin',async()=>{
  let touched=false
  const db={from(){touched=true;throw Error('Unexpected access')}}
  const denied=createMetaIntegrationHandler({db,authorize:async()=>null})
  for(const action of ['workspace','inbox','reply','media','preview_post','publish_post','finish_whatsapp']) await assert.rejects(denied({organisationId:org,action},''),/membership/)
  const staff=createMetaIntegrationHandler({db,authorize:async()=>({userId:user,isAdmin:false})})
  for(const action of ['begin_whatsapp','exchange_whatsapp_code','finish_whatsapp','register_sender','disconnect_sender','health_sender']) await assert.rejects(staff({organisationId:org,action},''),/administrator/)
  assert.equal(touched,false)
})

async function fixture(){
  const db=new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table organisations(id uuid primary key);
    create table organisation_communication_channels(id uuid primary key,organisation_id uuid,branch_id uuid,provider text,channel_type text,waba_id text,phone_number_id text,meta_business_id text,display_phone_number text,business_display_name text,connection_status text,verification_status text,is_default boolean,connected_at timestamptz,disconnected_at timestamptz,last_error_message text,last_checked_at timestamptz,created_by uuid,created_at timestamptz default now(),updated_at timestamptz,meta_access_token text);
    create table meta_lead_ads_connections(id uuid primary key,organisation_id uuid,page_id text,page_name text,connection_status text,token_ciphertext text,last_error_message text,connected_at timestamptz default now());
    create table private_listings(id uuid primary key,organisation_id uuid);
    grant all on organisation_communication_channels to anon,authenticated;
    alter table organisation_communication_channels enable row level security;
    create policy org_read on organisation_communication_channels for select to authenticated using(organisation_id=current_setting('test.org',true)::uuid);`)
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261017172424_meta_inbox_and_listing_posts.sql',import.meta.url),'utf8'))
  await db.query('insert into organisations values($1),($2)',[org,other]);await db.query('insert into auth.users values($1)',[user]);await db.query('insert into private_listings values($1,$2)',[listingId,org])
  await db.query("insert into organisation_communication_channels(id,organisation_id,provider,channel_type,phone_number_id,waba_id,connection_status,meta_access_token) values($1,$2,'meta','whatsapp','100','200','connected','secret'),($3,$4,'meta','whatsapp','101','201','connected','foreign-secret')",[sender,org,foreign,other])
  await db.query("insert into meta_lead_ads_connections(id,organisation_id,page_id,page_name,connection_status,token_ciphertext,granted_scopes,page_tasks) values($1,$2,'300','Test Page','connected','encrypted',array['pages_manage_posts'],array['CREATE_CONTENT'])",[connection,org])
  return db
}

// Minimal PostgREST adapter: executes the real handler queries against PostgreSQL.
function sqlClient(db){return {rpc:async(name,args)=>{try{return {data:(await db.query(`select * from ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')})`,Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v))).rows,error:null}}catch(error){return {data:null,error}}},from:table=>{
  let columns='*',filters=[],values=[],mutation=null,mode='',order=[],limit=''
  const bind=v=>{values.push(v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v);return `$${values.length}`}
  const q={select(c='*'){columns=c;return q},eq(k,v){filters.push(`${k}=${bind(v)}`);return q},is(k,v){assert.equal(v,null);filters.push(`${k} is null`);return q},gt(k,v){filters.push(`${k}>${bind(v)}`);return q},lte(k,v){filters.push(`${k}<=${bind(v)}`);return q},order(k,o={}){order.push(`${k} ${o.ascending===false?'desc':'asc'}`);return q},limit(n){limit=` limit ${Number(n)}`;return q},single(){mode='single';return q},maybeSingle(){mode='maybe';return q},update(patch){mutation=`update ${table} set ${Object.entries(patch).map(([k,v])=>`${k}=${bind(v)}`).join(',')}`;return q},insert(row){mutation=`insert into ${table}(${Object.keys(row).join(',')}) values(${Object.values(row).map(bind).join(',')})`;return q},async then(resolve){try{const where=filters.length?` where ${filters.join(' and ')}`:'';const sql=mutation?`${mutation}${where} returning ${columns}`:`select ${columns} from ${table}${where}${order.length?` order by ${order.join(',')}`:''}${limit}`;const rows=(await db.query(sql,values)).rows;if(mode==='single'&&rows.length!==1)throw Error('Expected one row');return resolve({data:mode?rows[0]||null:rows,error:null})}catch(error){return resolve({data:null,error})}}};return q
}}}
const receive=(db,mid,at=time,phone='100',waba='200')=>db.query('select whatsapp_inbox_receive($1,$2,$3,$4,$5,$6,$7,$8,$9) id',[phone,waba,'27821234567',mid,at,mid,'text','{}','Customer'])

test('Meta lead ingestion accepts the CRM source constraint without weakening routing, deduplication or historical guards',async()=>{
  const db=new PGlite()
  try{
    await db.exec(`create role authenticated;create role service_role;
      create table meta_lead_ads_connections(id uuid primary key,organisation_id uuid,page_id text,connection_status text);
      create table meta_lead_ads_forms(id uuid primary key,organisation_id uuid,page_id text,form_id text,is_active boolean,lead_type text,branch_id uuid,assigned_agent_id uuid,form_name text);
      create table meta_lead_ads_imports(id uuid primary key,organisation_id uuid,connection_id uuid,form_mapping_id uuid,status text);
      create table organisation_branches(id uuid primary key,organisation_id uuid);
      create table organisation_users(user_id uuid,organisation_id uuid,status text);
      create table contacts(contact_id uuid primary key default gen_random_uuid(),organisation_id uuid,assigned_agent_id uuid,first_name text,last_name text,email text,phone text,contact_type text,notes text,updated_at timestamptz default now());
      create table leads(lead_id uuid primary key default gen_random_uuid(),organisation_id uuid,branch_id uuid,assigned_agent_id uuid,assigned_user_id uuid,contact_id uuid,lead_domain text,lead_category text,lead_type text,lead_direction text,lead_source text,source_channel text,stage text,status text,priority text,ownership_status text,assigned_at timestamptz,sla_due_at timestamptz,source_reference_id text,source_received_at timestamptz,raw_enquiry_payload jsonb,notes text,acknowledgement_status text,created_at timestamptz);
      create table lead_activities(organisation_id uuid,lead_id uuid,agent_id uuid,activity_type text,activity_note text,activity_date timestamptz,outcome text);`)
    const constraintSource=readFileSync(new URL('../../supabase/migrations/20260915173619_agent_profile_public_intake_source.sql',import.meta.url),'utf8')
    await db.exec(constraintSource.slice(0,constraintSource.indexOf('alter table if exists public.agency_public_intake_submissions')))
    const foundation=readFileSync(new URL('../../supabase/migrations/20260906175502_meta_lead_ads_backfill_foundation.sql',import.meta.url),'utf8')
    const start=foundation.indexOf('create function public.meta_ingest_lead_ad(')
    await db.exec(foundation.slice(start,foundation.indexOf('\nrevoke all on function public.meta_ingest_lead_ad',start)))
    const signature='public.meta_ingest_lead_ad(text,uuid,text,text,text,text,text,jsonb,text,timestamptz,uuid)'
    await db.exec(`revoke all on function ${signature} from public;grant execute on function ${signature} to service_role;`)
    await db.query("insert into meta_lead_ads_connections values($1,$2,'300','connected')",[connection,org])
    await db.query("insert into meta_lead_ads_forms values($1,$2,'300','400',true,'buyer',null,null,'Review form')",[id(80),org])
    const ingest=(leadgen='live-review',target=org,source='live',importId=null)=>db.query('select meta_ingest_lead_ad($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) id',[leadgen,target,'300','400','Sample Buyer',`${leadgen}@example.com`,'','{}',source,time,importId])
    await assert.rejects(ingest(),/leads_source_channel_check/)
    assert.equal((await db.query('select count(*)::int n from contacts')).rows[0].n,0)
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261017210140_meta_lead_ads_canonical_source_channel.sql',import.meta.url),'utf8'))
    const created=(await ingest()).rows[0].id
    assert.equal((await ingest()).rows[0].id,created)
    const live=(await db.query('select * from leads where lead_id=$1',[created])).rows[0]
    assert.equal(live.source_channel,'facebook');assert.equal(live.lead_source,'Facebook')
    assert.equal(live.source_reference_id,'meta-leadgen:live-review')
    assert.equal(live.raw_enquiry_payload.arch9_meta.ingestion_source,'live')
    assert.equal(new Date(live.created_at).toISOString(),time)
    assert.ok(live.sla_due_at)
    assert.deepEqual((await db.query('select (select count(*)::int from leads) leads,(select count(*)::int from contacts) contacts,(select count(*)::int from lead_activities) activities')).rows[0],{leads:1,contacts:1,activities:1})
    await assert.rejects(ingest('foreign',other),/not connected/)
    await db.query('insert into organisation_branches values($1,$2)',[id(82),other])
    await db.query('update meta_lead_ads_forms set branch_id=$1',[id(82)])
    await assert.rejects(ingest('foreign-branch'),/branch routing crosses organisation/)
    await db.exec('update meta_lead_ads_forms set branch_id=null')
    await assert.rejects(ingest('history',org,'historical'),/requires an import job/)
    await db.query("insert into meta_lead_ads_imports values($1,$2,$3,$4,'ready')",[id(81),org,connection,id(80)])
    await db.exec("update meta_lead_ads_forms set lead_type='seller'")
    const historicalId=(await ingest('history',org,'historical',id(81))).rows[0].id
    const historical=(await db.query('select * from leads where lead_id=$1',[historicalId])).rows[0]
    assert.equal(historical.source_channel,'facebook');assert.equal(historical.lead_type,'seller')
    assert.equal(historical.acknowledgement_status,'skipped');assert.equal(historical.sla_due_at,null)
    assert.equal(new Date(historical.source_received_at).toISOString(),time)
    assert.equal(historical.raw_enquiry_payload.arch9_meta.import_id,id(81))
    const privileges=(await db.query('select has_function_privilege($1,$2,\'execute\') staff,has_function_privilege($3,$2,\'execute\') server',['authenticated',signature,'service_role'])).rows[0]
    assert.deepEqual(privileges,{staff:false,server:true})
  }finally{await db.close()}
})

test('signed-event ingestion is idempotent, ordered and scoped; credentials and RPCs stay server-only',async()=>{
  const db=await fixture()
  try{
    await receive(db,'new');await receive(db,'new');await receive(db,'old','2026-10-16T12:00:00Z');await receive(db,'foreign',time,'101','200')
    const row=(await db.query('select * from whatsapp_inbox_conversations')).rows[0]
    assert.equal(row.organisation_id,org);assert.equal(row.unread_count,2);assert.equal(row.last_message_preview,'new');assert.equal(new Date(row.last_inbound_at).toISOString(),time)
    assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_messages')).rows[0].n,2)
    await applyWhatsAppInboxWebhook(sqlClient(db),{entry:[{id:'200',changes:[{field:'messages',value:{metadata:{phone_number_id:'100'},messages:[{id:'webhook',from:'27821234567',timestamp:String(Date.parse(time)/1000),type:'text',text:{body:'Hello'}}]}}]}]})
    assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_messages')).rows[0].n,3)
    await db.exec(`set role authenticated;set test.org='${org}';`)
    assert.equal((await db.query('select id,phone_number_id from organisation_communication_channels')).rows.length,1)
    for(const col of ['meta_access_token','token_ciphertext']) await assert.rejects(db.query(`select ${col} from organisation_communication_channels`),/permission denied/)
    await assert.rejects(db.query("update organisation_communication_channels set meta_access_token='forged'"),/permission denied/)
    await assert.rejects(db.query('select * from whatsapp_inbox_messages'),/permission denied/)
    await assert.rejects(receive(db,'forged'),/permission denied/)
  }finally{await db.close()}
})

test('real reply flow sends once under concurrency and never repeats an uncertain delivery',async()=>{
  const db=await fixture()
  try{
    const conversationId=(await receive(db,'incoming')).rows[0].id
    let sent=0,uncertain=false
    const handler=createMetaIntegrationHandler({db:sqlClient(db),authorize:async()=>({userId:user,isAdmin:true}),now:()=>new Date(time),decrypt:async()=>'',graph:async()=>{sent++;if(uncertain)throw Error('Response lost');return {messages:[{id:'wamid.sent'}]}}})
    const call=(requestId=id(10),extra={})=>handler({organisationId:org,action:'reply',conversationId,message:'Thanks',requestId,...extra},'Bearer test')
    await Promise.all([call(),call()]);assert.equal(sent,1)
    assert.equal((await call()).message.delivery_status,'sent');assert.equal(sent,1)
    await assert.rejects(call(id(10),{message:'Changed'}),/different message/)
    await assert.rejects(call(id(11),{organisationId:other}),/not found/)
    uncertain=true;assert.equal((await call(id(11))).message.delivery_status,'unknown');await call(id(11));assert.equal(sent,2)
    const callback=(status,phone='100')=>db.query('select whatsapp_inbox_status($1,$2,$3,$4,$5,$6,$7) ok',[phone,'200','wamid.late',`arch9-inbox:${id(11)}`,status,time,'failure'])
    assert.equal((await callback('read','101')).rows[0].ok,false)
    await callback('read');await callback('sent');await callback('failed')
    assert.equal((await db.query('select delivery_status from whatsapp_inbox_messages where id=$1',[id(11)])).rows[0].delivery_status,'read')
    await db.query("update whatsapp_inbox_conversations set last_inbound_at='2026-10-15' where id=$1",[conversationId])
    await assert.rejects(call(id(12)),/24-hour/)
  }finally{await db.close()}
})

test('phone activation is admin-only, scoped to a pending sender, and never stores the PIN',async()=>{
  const db=await fixture()
  try{
    const calls=[]
    await db.query("update organisation_communication_channels set connection_status='pending' where id=$1",[sender])
    const handler=createMetaIntegrationHandler({db:sqlClient(db),authorize:async()=>({userId:user,isAdmin:true}),now:()=>new Date(time),graph:async(token,path,payload)=>{calls.push({token,path,payload});return payload?{success:true}:{id:'100',status:'CONNECTED'}}})
    const call=(fields={})=>handler({organisationId:org,action:'register_sender',senderId:sender,pin:'123456',...fields},'Bearer test')
    await assert.rejects(call({senderId:foreign}),/not found/);await assert.rejects(call({pin:'123'}),/six-digit/);assert.equal(calls.length,0)
    assert.equal((await call()).sender.connection_status,'connected')
    assert.deepEqual(calls[0],{token:'secret',path:'100/register',payload:{messaging_product:'whatsapp',pin:'123456'}})
    assert.ok(!JSON.stringify((await db.query('select * from organisation_communication_channels where id=$1',[sender])).rows).includes('123456'))
    await assert.rejects(call(),/pending sender/);assert.equal(calls.length,2)
  }finally{await db.close()}
})

test('real listing preview and publishing preserve JSONB snapshots, reject stale/foreign listings and claim once',async()=>{
  const db=await fixture()
  try{
    let posts=0,stale=false,uncertain=false,reviewBlocked=false
    const handler=createMetaIntegrationHandler({db:sqlClient(db),authorize:async()=>({userId:user,isAdmin:true}),now:()=>new Date(time),config:{storageOrigin:origin},decrypt:async()=>'',assertPublishable:async()=>{if(reviewBlocked)throw Error('Review seller differences')},loadListing:async(_actor,target,id)=>target===org&&id===listingId?{listing:{...listing,updated_at:stale?'2026-10-18T10:00:00Z':time},media:[]}:null,graph:async()=>{posts++;if(uncertain)throw Error('Response lost');return {id:'300_400'}}})
    const call=(action,extra={})=>handler({organisationId:org,listingId,connectionId:connection,action,...extra},'Bearer test')
    await assert.rejects(call('preview_post',{organisationId:other}),/access/)
    reviewBlocked=true;await assert.rejects(call('preview_post'),/seller differences/);reviewBlocked=false
    const preview=(await call('preview_post')).post
    await Promise.all([call('publish_post',{postId:preview.id}),call('publish_post',{postId:preview.id})]);assert.equal(posts,1)
    assert.equal((await call('publish_post',{postId:preview.id})).post.status,'published');assert.equal(posts,1)
    const old=(await call('preview_post')).post;stale=true;await assert.rejects(call('publish_post',{postId:old.id}),/changed/);assert.equal(posts,1)
    stale=false;uncertain=true;const lost=(await call('preview_post')).post
    assert.equal((await call('publish_post',{postId:lost.id})).post.status,'unknown');await call('publish_post',{postId:lost.id});assert.equal(posts,2)
    await assert.rejects(db.query('insert into meta_listing_posts(organisation_id,listing_id,connection_id,snapshot_json,created_by) values($1,$2,$3,$4,$5)',[other,listingId,connection,'{}',user]),/foreign key/)
  }finally{await db.close()}
})
