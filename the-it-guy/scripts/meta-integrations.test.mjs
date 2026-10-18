import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { canReply, publicListingPost, applyWhatsAppInboxWebhook } from '../../supabase/functions/_shared/metaIntegrationCore.js'
import { createCampaignDelivery } from '../../supabase/functions/_shared/whatsappCampaignDelivery.js'
import { createCampaignHandler } from '../../supabase/functions/whatsapp-campaigns/handler.js'
import { createMetaIntegrationHandler } from '../../supabase/functions/meta-integrations/handler.js'
import { decodeInboxAttachment,readMetaIntegrationPayload } from '../../supabase/functions/_shared/whatsappInboxMessaging.js'

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
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;grant usage on schema auth to authenticated;create table organisation_users(organisation_id uuid,user_id uuid,role text,status text,first_name text,last_name text,email text);grant select on organisation_users to authenticated;create table organisations(id uuid primary key);
    create table organisation_communication_channels(id uuid primary key default gen_random_uuid(),organisation_id uuid,branch_id uuid,provider text,channel_type text,waba_id text,phone_number_id text,meta_business_id text,display_phone_number text,business_display_name text,connection_status text,verification_status text,is_default boolean,connected_at timestamptz,disconnected_at timestamptz,last_error_message text,last_checked_at timestamptz,created_by uuid,created_at timestamptz default now(),updated_at timestamptz,meta_access_token text);
    create table meta_lead_ads_connections(id uuid primary key,organisation_id uuid,page_id text,page_name text,connection_status text,token_ciphertext text,last_error_message text,connected_at timestamptz default now());
    create table private_listings(id uuid primary key,organisation_id uuid);
    grant all on organisation_communication_channels to anon,authenticated;
    alter table organisation_communication_channels enable row level security;
    create policy org_read on organisation_communication_channels for select to authenticated using(organisation_id=current_setting('test.org',true)::uuid);`)
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261017172424_meta_inbox_and_listing_posts.sql',import.meta.url),'utf8'))
  await db.exec(`create function bridge_is_active_member(uuid) returns boolean language sql as $$ select $1=current_setting('test.org',true)::uuid $$;`)
  await db.exec(readFileSync(new URL('../../supabase/migrations/20260913134659_whatsapp_campaigns.sql',import.meta.url),'utf8'))
  await db.exec(`create table whatsapp_campaign_jobs(id uuid primary key default gen_random_uuid(),campaign_id uuid,status text);grant select,insert,update on whatsapp_campaign_jobs to service_role;`)
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261018094503_whatsapp_inbox_agent_ownership.sql',import.meta.url),'utf8'))
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261018111956_whatsapp_inbox_messaging.sql',import.meta.url),'utf8'))
  await db.exec(readFileSync(new URL('../../supabase/migrations/20261018125856_whatsapp_business_app_sync.sql',import.meta.url),'utf8'))
  await db.query('insert into organisations values($1),($2)',[org,other]);await db.query('insert into auth.users values($1)',[user]);await db.query("insert into organisation_users(organisation_id,user_id,role,status,first_name,last_name) values($1,$2,'principal','active','Agency','Owner')",[org,user]);await db.query('insert into private_listings values($1,$2)',[listingId,org])
  await db.query("insert into organisation_communication_channels(id,organisation_id,provider,channel_type,phone_number_id,waba_id,connection_status,meta_access_token) values($1,$2,'meta','whatsapp','100','200','connected','secret'),($3,$4,'meta','whatsapp','101','201','connected','foreign-secret')",[sender,org,foreign,other])
  await db.query("insert into meta_lead_ads_connections(id,organisation_id,page_id,page_name,connection_status,token_ciphertext,granted_scopes,page_tasks) values($1,$2,'300','Test Page','connected','encrypted',array['pages_manage_posts'],array['CREATE_CONTENT'])",[connection,org])
  return db
}

// Minimal PostgREST adapter: executes the real handler queries against PostgreSQL.
function sqlClient(db){return {rpc:async(name,args)=>{try{const rows=(await db.query(`select * from ${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')})`,Object.values(args).map(v=>v&&typeof v==='object'?JSON.stringify(v):v))).rows;return {data:rows.length===1&&Object.keys(rows[0]).length===1&&Object.hasOwn(rows[0],name)?rows[0][name]:rows,error:null}}catch(error){return {data:null,error}}},from:table=>{
  let columns='*',filters=[],values=[],mutation=null,mode='',order=[],limit=''
  const bind=v=>{values.push(v&&typeof v==='object'&&!Array.isArray(v)?JSON.stringify(v):v);return `$${values.length}`}
  const q={select(c='*'){columns=c;return q},eq(k,v){filters.push(`${k}=${bind(v)}`);return q},is(k,v){assert.equal(v,null);filters.push(`${k} is null`);return q},gt(k,v){filters.push(`${k}>${bind(v)}`);return q},lte(k,v){filters.push(`${k}<=${bind(v)}`);return q},order(k,o={}){order.push(`${k} ${o.ascending===false?'desc':'asc'}`);return q},limit(n){limit=` limit ${Number(n)}`;return q},range(a,b){limit=` limit ${b-a+1} offset ${a}`;return q},single(){mode='single';return q},maybeSingle(){mode='maybe';return q},update(patch){mutation=`update ${table} set ${Object.entries(patch).map(([k,v])=>`${k}=${bind(v)}`).join(',')}`;return q},insert(row){mutation=`insert into ${table}(${Object.keys(row).join(',')}) values(${Object.values(row).map(bind).join(',')})`;return q},async then(resolve){try{const where=filters.length?` where ${filters.join(' and ')}`:'';const sql=mutation?`${mutation}${where} returning ${columns}`:`select ${columns} from ${table}${where}${order.length?` order by ${order.join(',')}`:''}${limit}`;const rows=(await db.query(sql,values)).rows;if(mode==='single'&&rows.length!==1)throw Error('Expected one row');return resolve({data:mode?rows[0]||null:rows,error:null})}catch(error){return resolve({data:null,error})}}};return q
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
    await db.exec(`set role authenticated;set test.org='${org}';set test.actor='${user}';`)
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
    await assert.rejects(call(id(11),{organisationId:other}),/not found|membership/)
    uncertain=true;assert.equal((await call(id(11))).message.delivery_status,'unknown');await call(id(11));assert.equal(sent,2)
    const callback=(status,phone='100')=>db.query('select whatsapp_inbox_status($1,$2,$3,$4,$5,$6,$7) ok',[phone,'200','wamid.late',`arch9-inbox:${id(11)}`,status,time,'failure'])
    assert.equal((await callback('read','101')).rows[0].ok,false)
    await callback('read');await callback('sent');await callback('failed')
    assert.equal((await db.query('select delivery_status from whatsapp_inbox_messages where id=$1',[id(11)])).rows[0].delivery_status,'read')
    await db.query("update whatsapp_inbox_conversations set last_inbound_at='2026-10-15' where id=$1",[conversationId])
    await assert.rejects(call(id(12)),/24-hour/)
  }finally{await db.close()}
})

test('phone activation is scoped to a permitted pending sender and never stores the PIN',async()=>{
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

const agentA=id(20),agentB=id(21),outsider=id(22)
async function teamFixture(){
 const db=await fixture()
 for(const [actor,target,name] of [[agentA,org,'Agent A'],[agentB,org,'Agent B'],[outsider,other,'Other Agent']]){
  await db.query('insert into auth.users values($1)',[actor])
  await db.query("insert into organisation_users(organisation_id,user_id,role,status,first_name) values($1,$2,'agent','active',$3)",[target,actor,name])
 }
 return db
}
const staffHandler=(db,actor=user,extra={})=>createMetaIntegrationHandler({db:sqlClient(db),authorize:async()=>({userId:actor,isAdmin:actor===user,canConnectOwn:true}),now:()=>new Date(time),graph:async()=>({messages:[{id:'wamid.staff-reply'}]}),...extra})
const request=(handler,action,fields={})=>handler({organisationId:org,action,...fields},'Bearer test')
const assign=(handler,conversationId,assignedUserId,assignmentVersion)=>request(handler,'assign_conversation',{conversationId,assignedUserId,assignmentVersion})
const own=(handler,ownerUserId,ownershipVersion=1)=>request(handler,'set_sender_owner',{senderId:sender,ownerUserId,ownershipVersion})

test('agency queue, agent assignment, handoff and attachment access execute against real permission SQL',async()=>{
 const db=await teamFixture()
 try{
  const admin=staffHandler(db),a=staffHandler(db,agentA),b=staffHandler(db,agentB),foreignAgent=staffHandler(db,outsider)
  const conversationId=(await receive(db,'assigned-incoming')).rows[0].id
  assert.equal((await request(admin,'inbox')).conversations.length,1)
  assert.equal((await request(a,'inbox',{actorUserId:user,isAdmin:true})).conversations.length,0)
  await assert.rejects(own(a,agentB),/management/)
  assert.equal((await assign(admin,conversationId,agentA,1)).conversation.assignment_version,2)
  assert.equal((await request(a,'inbox')).conversations[0].id,conversationId)
  assert.equal((await request(b,'inbox')).conversations.length,0)
  await assert.rejects(request(foreignAgent,'inbox'),/membership/)
  for(const action of ['messages','reply','conversation_status']) await assert.rejects(request(b,action,{conversationId,requestId:id(23),message:'forged',status:'closed',assignmentVersion:2}),/not found/)
  await assert.rejects(assign(a,conversationId,agentB,2),/management/)
  await assert.rejects(assign(admin,conversationId,outsider,2),/membership/)
  await assert.rejects(assign(admin,conversationId,agentB,1),/assignment changed/)
  const message=(await db.query("update whatsapp_inbox_messages set media_json='{\"id\":\"900\",\"filename\":\"private.pdf\"}' where conversation_id=$1 returning id",[conversationId])).rows[0]
  let downloads=0
  const files=staffHandler(db,agentB,{downloadMedia:async()=>{downloads++;return {base64:'ZmlsZQ==',mimeType:'application/pdf'}}})
  await assert.rejects(request(files,'media',{messageId:message.id}),/not found/);assert.equal(downloads,0)
  await assign(admin,conversationId,agentB,2)
  await assert.rejects(request(a,'messages',{conversationId}),/not found/)
  const thread=await request(b,'messages',{conversationId})
  assert.equal(thread.messages[0].body_text,'assigned-incoming')
  assert.equal(thread.conversation.assignment_version,3)
  await request(files,'media',{messageId:message.id});assert.equal(downloads,1)
  await request(b,'conversation_status',{conversationId,status:'closed',assignmentVersion:3})
  assert.equal((await db.query('select status from whatsapp_inbox_conversations where id=$1',[conversationId])).rows[0].status,'closed')
  assert.deepEqual((await db.query('select from_user_id,to_user_id,actor_user_id,assignment_version from whatsapp_inbox_assignments order by assignment_version')).rows,[{from_user_id:null,to_user_id:agentA,actor_user_id:user,assignment_version:2},{from_user_id:agentA,to_user_id:agentB,actor_user_id:user,assignment_version:3}])
 }finally{await db.close()}
})

test('number ownership moves history, assigns new inbound chats, preserves manual handoffs and hides other agent numbers',async()=>{
 const db=await teamFixture()
 try{
  const admin=staffHandler(db),a=staffHandler(db,agentA),b=staffHandler(db,agentB)
  const original=(await receive(db,'existing-history')).rows[0].id
  await own(admin,agentA)
  assert.equal((await db.query('select actor_user_id from whatsapp_inbox_assignments where conversation_id=$1',[original])).rows[0].actor_user_id,user)
  await assert.rejects(db.query('delete from auth.users where id=$1',[agentA]),/foreign key/)
  assert.equal((await db.query('select owner_user_id from organisation_communication_channels where id=$1',[sender])).rows[0].owner_user_id,agentA)
  await db.query("update organisation_communication_channels set connection_status='pending' where id=$1",[sender])
  const activation=[]
  const agentSetup=staffHandler(db,agentA,{graph:async(_token,path,payload)=>{activation.push({path,payload});return payload?{success:true}:{id:'100',status:'CONNECTED'}}})
  assert.equal((await request(agentSetup,'register_sender',{senderId:sender,pin:'654321'})).sender.connection_status,'connected')
  assert.equal(activation[0].payload.pin,'654321')
  assert.ok(!JSON.stringify((await db.query('select * from organisation_communication_channels where id=$1',[sender])).rows).includes('654321'))
  assert.equal((await request(a,'inbox')).conversations.length,1)
  const next=(await db.query("select whatsapp_inbox_receive('100','200','27821234568','new-owned',$1,'Hello','text','{}','Next Customer') id",[time])).rows[0].id
  assert.equal((await request(a,'messages',{conversationId:next})).conversation.assigned_user_id,agentA)
  await assign(admin,original,agentB,2)
  await receive(db,'handoff-stays-with-b')
  assert.equal((await request(b,'messages',{conversationId:original})).conversation.assigned_user_id,agentB)
  assert.equal((await request(a,'inbox')).conversations.length,1)
  await assert.rejects(request(b,'disconnect_sender',{senderId:sender}),/only your own/)
  const workspaceA=await request(a,'workspace'),workspaceB=await request(b,'workspace')
  assert.equal(workspaceA.senders[0].owner_user_id,agentA);assert.equal(workspaceA.assignees.length,0);assert.equal(workspaceA.currentUserId,agentA)
  assert.equal(workspaceB.senders.length,0)
  await assert.rejects(own(admin,agentB,1),/ownership changed/)
  await own(admin,null,2)
  assert.equal((await request(a,'inbox')).conversations.length,0);assert.equal((await request(b,'inbox')).conversations.length,0)
  assert.equal((await request(admin,'inbox')).conversations.length,2)
  const owner=(await db.query('select owner_user_id,ownership_version,is_default from organisation_communication_channels where id=$1',[sender])).rows[0]
  assert.deepEqual(owner,{owner_user_id:null,ownership_version:3,is_default:false})
  await own(admin,agentA,3)
  await db.exec(`set role authenticated;set test.org='${org}';set test.actor='${agentB}';`)
  assert.equal((await db.query('select id from organisation_communication_channels')).rows.length,0)
  await db.exec(`set test.actor='${agentA}';`)
  assert.equal((await db.query('select id from organisation_communication_channels')).rows[0].id,sender)
  await assert.rejects(db.query('select token_ciphertext from organisation_communication_channels'),/permission denied/)
  await assert.rejects(db.query('select whatsapp_inbox_request($1,$2,$3)',[org,user,'list']),/permission denied/)
  await assert.rejects(db.query('select whatsapp_sender_set_owner($1,$2,$3,$4,$5)',[org,user,sender,agentB,4]),/permission denied/)
  await assert.rejects(db.query('select * from whatsapp_inbox_assignments'),/permission denied/)
 }finally{await db.close()}
})

test('membership revocation blocks old inbox access; inbound messages fall back to agency oversight',async()=>{
 const db=await teamFixture()
 try{
  await own(staffHandler(db),agentA)
  await receive(db,'before-revocation')
  await db.query("update organisation_users set status='inactive' where user_id=$1",[agentA])
  await assert.rejects(request(staffHandler(db,agentA),'inbox'),/membership/)
  await assert.rejects(own(staffHandler(db),outsider,2),/membership/)
  const next=(await db.query("select whatsapp_inbox_receive('100','200','27821234569','after-revocation',$1,'Hello','text','{}','Next Customer') id",[time])).rows[0].id
  assert.equal((await request(staffHandler(db),'messages',{conversationId:next})).conversation.assigned_user_id,null)
  assert.equal((await request(staffHandler(db),'inbox')).conversations.length,2)
 }finally{await db.close()}
})

test('a reassignment after reply access prevents the outbound claim and never calls Meta',async()=>{
 const db=await teamFixture()
 try{
  const admin=staffHandler(db),conversationId=(await receive(db,'before-race')).rows[0].id
  await assign(admin,conversationId,agentA,1)
  const client=sqlClient(db),originalRpc=client.rpc
  client.rpc=async(name,args)=>{const response=await originalRpc(name,args);if(name==='whatsapp_inbox_request'&&args.p_action==='access')await assign(admin,conversationId,agentB,2);return response}
  let calls=0
  const agent=staffHandler(db,agentA,{db:client,graph:async()=>{calls++;return {messages:[{id:'wamid.should-not-send'}]}}})
  await assert.rejects(request(agent,'reply',{conversationId,message:'Old assignment',requestId:id(24)}),/assignment changed/)
  assert.equal(calls,0);assert.equal((await db.query("select count(*)::int n from whatsapp_inbox_messages where direction='outbound'")).rows[0].n,0)
 }finally{await db.close()}
})

test('embedded signup binds the owner on the server and an agent cannot claim an existing agency number',async()=>{
 const db=await teamFixture()
 try{
  const extra={now:()=>new Date(),config:{appId:'app',whatsappConfigId:'config',graphVersion:'v23.0'},hash:async value=>`hash:${value}`,encrypt:async()=> 'encrypted',decrypt:async()=> 'fake-token',exchangeCode:async()=> 'fake-token'}
  let phone='100',subscriptions=0
  extra.graph=async(_token,path,payload)=>{if(payload){subscriptions++;return {success:true}};if(path.startsWith('200/phone_numbers'))return {data:[{id:phone}]};if(path.startsWith('200?'))return {id:'200',name:'Business'};return {id:phone,display_phone_number:'+27 82 000 0000',verified_name:'Business',status:'CONNECTED'}}
  const a=staffHandler(db,agentA,extra)
  await assert.rejects(request(a,'begin_whatsapp',{ownerUserId:agentB}),/only your own/)
  const intent=await request(a,'begin_whatsapp')
  await request(a,'exchange_whatsapp_code',{state:intent.state,code:'fake-code'})
  await assert.rejects(request(a,'finish_whatsapp',{state:intent.state,wabaId:'200',phoneNumberId:'100'}),/administrator must transfer/)
  assert.equal(subscriptions,0)
  assert.equal((await db.query('select owner_user_id,consumed_at from meta_whatsapp_authorizations')).rows[0].owner_user_id,agentA)
  phone='102'
  const connected=(await request(a,'finish_whatsapp',{state:intent.state,wabaId:'200',phoneNumberId:phone,ownerUserId:agentB})).sender
  assert.equal(connected.owner_user_id,agentA);assert.equal(subscriptions,1)
  await assert.rejects(request(a,'finish_whatsapp',{state:intent.state,wabaId:'200',phoneNumberId:phone}),/expired/)
  const admin=staffHandler(db,user,extra),adminIntent=await request(admin,'begin_whatsapp',{ownerUserId:agentB})
  assert.equal((await db.query('select owner_user_id from meta_whatsapp_authorizations where state_hash=$1',[`hash:${adminIntent.state}`])).rows[0].owner_user_id,agentB)
 }finally{await db.close()}
})

test('agent numbers are excluded from campaign selection, provider delivery and database recipient claims',async()=>{
 const db=await audienceFixture()
 try{
  const admin=staffHandler(db),campaign=id(30),person=id(31)
  await db.query("insert into whatsapp_campaigns(id,organisation_id,name,sender_id) values($1,$2,'Agency campaign',$3)",[campaign,org,sender])
  await db.query("insert into whatsapp_campaign_jobs(campaign_id,organisation_id,scheduled_for,status) values($1,$2,now(),'queued')",[campaign,org])
  await assert.rejects(own(admin,agentA),/Complete or cancel active campaigns/)
  await db.exec("update whatsapp_campaign_jobs set status='completed'")
  await own(admin,agentA)
  const {sender:loadSender}=createCampaignDelivery({db:sqlClient(db),meta:async()=>{throw Error('No provider call permitted')}})
  await assert.rejects(loadSender(org,sender),/agency number/)
  const campaigns=createCampaignHandler({db:sqlClient(db),authorize:async()=>agentA,meta:async()=>({})})
  assert.equal((await campaigns({organisationId:org,action:'workspace'},'Bearer test')).senders.length,0)
  await db.query("insert into whatsapp_marketing_contacts(id,organisation_id,full_name,phone) values($1,$2,'Customer','27821234566')",[person,org])
  const recipient=()=>db.query("insert into whatsapp_campaign_recipients(organisation_id,campaign_id,contact_id,full_name,phone,payload,consent_snapshot) values($1,$2,$3,'Customer','27821234566','{}','{}') returning id",[org,campaign,person])
  await assert.rejects(recipient(),/Bulk campaigns require an agency number/)
  await own(admin,null,2)
  const rid=(await recipient()).rows[0].id
  await own(admin,agentA,3)
  await assert.rejects(db.query("update whatsapp_campaign_recipients set status='processing' where id=$1",[rid]),/Bulk campaigns require an agency number/)
 }finally{await db.close()}
})

test('the real service role can route and reply through server-only functions without table-owner privileges',async()=>{
 const db=await teamFixture()
 try{
  await db.exec('alter role service_role bypassrls;set role service_role;')
  const admin=staffHandler(db),a=staffHandler(db,agentA)
  await own(admin,agentA)
  const conversationId=(await receive(db,'service-role-incoming')).rows[0].id
  const thread=await request(a,'messages',{conversationId})
  assert.equal(thread.conversation.assigned_user_id,agentA)
  assert.equal(thread.messages[0].body_text,'service-role-incoming')
  const sent=await request(a,'reply',{conversationId,message:'Service role reply',requestId:id(35)})
  assert.equal(sent.message.delivery_status,'sent');assert.equal(sent.message.created_by,agentA)
  await assign(admin,conversationId,agentB,1)
  await assert.rejects(request(a,'messages',{conversationId}),/not found/)
 }finally{await db.close()}
})

const crmMigration = new URL('../../supabase/migrations/20261018110212_whatsapp_inbox_crm_links.sql',import.meta.url)
const buyerA=id(42),sellerA=id(43),buyerB=id(44),foreignLead=id(45),recruit=id(46)
async function crmFixture(){
 const db=await teamFixture()
 await db.exec(`alter table organisations add column type text default 'agency';
  alter table organisation_users add column id uuid default gen_random_uuid(),add column membership_status text,add column workspace_role text,add column organisation_role text,add column organization_role text;
  create table contacts(contact_id uuid primary key,organisation_id uuid,assigned_agent_id uuid,first_name text,last_name text,phone text);
  create table leads(lead_id uuid primary key,organisation_id uuid,contact_id uuid,assigned_user_id uuid,assigned_agent_id uuid,lead_category text,lead_source text,raw_enquiry_payload jsonb default '{}');
  create table recruitment_leads(id uuid primary key,organisation_id uuid,name text,phone text,source text);
  grant select on contacts,leads,recruitment_leads to authenticated;
  alter table contacts enable row level security;alter table leads enable row level security;alter table recruitment_leads enable row level security;
  alter role service_role bypassrls;`)
 // Execute the real agency scope helpers and restrictive lead policy, rather
 // than mocking their authorization decisions in JavaScript.
 const twoTier=readFileSync(new URL('../../supabase/migrations/20260913075746_agency_two_tier_access.sql',import.meta.url),'utf8')
 for(const [start,end] of [['create or replace function public.bridge_agency_open_operations','$$;'],['create or replace function public.bridge_agency_record_scope','$scope$;']]){
  const index=twoTier.indexOf(start);await db.exec(twoTier.slice(index,twoTier.indexOf(end,index)+end.length))
 }
 await db.exec(`create policy lead_member on leads for select to authenticated using(exists(select 1 from organisation_users m where m.organisation_id=leads.organisation_id and m.user_id=auth.uid() and m.status='active'));
  create policy contact_member on contacts for select to authenticated using(exists(select 1 from organisation_users m where m.organisation_id=contacts.organisation_id and m.user_id=auth.uid() and m.status='active'));
  create policy contact_assignment on contacts as restrictive for select to authenticated using(bridge_agency_record_scope(organisation_id,assigned_agent_id));`)
 const policyStart=twoTier.indexOf('create policy agency_two_tier_records on public.leads')
 await db.exec(twoTier.slice(policyStart,twoTier.indexOf(';',policyStart)+1))
 const recSource=readFileSync(new URL('../../supabase/migrations/20261005124526_recruitment_workspace.sql',import.meta.url),'utf8')
 const recStart=recSource.indexOf('create policy recruitment_leads_management')
 await db.exec(recSource.slice(recStart,recSource.indexOf(';',recStart)+1))
 await db.exec(readFileSync(crmMigration,'utf8'))
 await db.query("insert into contacts values($1,$2,$3,'Buyer','Seller','082 123 4567'),($4,$2,$5,'Other','Agent','+27 (82) 123-4567'),($6,$7,$8,'Foreign','Customer','27821234567')",[id(40),org,agentA,id(41),agentB,id(49),other,outsider])
 for(const [lead,contact,assigned,target,kind] of [[buyerA,id(40),agentA,org,'buyer'],[sellerA,id(40),agentA,org,'seller'],[buyerB,id(41),agentB,org,'buyer'],[foreignLead,id(49),outsider,other,'buyer']]){
  await db.query("insert into leads values($1,$2,$3,$4,$4,$5,'Facebook','{\"campaign_name\":\"Original Meta campaign\"}')",[lead,target,contact,assigned,kind])
 }
 await db.query("insert into recruitment_leads values($1,$2,'Recruitment Candidate','0027821234567','Facebook Lead Ads'),($3,$4,'Foreign Recruit','27821234567','Facebook Lead Ads')",[recruit,org,id(48),other])
 return db
}
function rpcRole(db,role,actor=user){return {rpc:(name,args)=>db.transaction(async tx=>{
 await tx.exec(`set local role ${role}`)
 await tx.query("select set_config('test.actor',$1,true),set_config('test.org',$2,true)",[actor,org])
 return sqlClient(tx).rpc(name,args)
})}}
const crmHandler=(db,actor=user,extra={})=>createMetaIntegrationHandler({
 db:rpcRole(db,'service_role',actor),authorize:async()=>({userId:actor,isAdmin:actor===user,userDb:rpcRole(db,'authenticated',actor)}),...extra,
})
const crmContext=(handler,conversationId)=>request(handler,'crm_context',{conversationId})
const crmLink=(handler,conversationId,kind,recordId,linkVersion=0,assignmentVersion=1)=>request(handler,'link_crm',{conversationId,kind,recordId,linkVersion,assignmentVersion})

test('CRM phone matching uses full canonical numbers and actual lead/contact/recruitment RLS',async()=>{
 const db=await crmFixture()
 try{
  for(const [value,expected] of [['+27 (82) 123-4567','27821234567'],['0027821234567','27821234567'],['0821234567','27821234567'],['+44821234567','44821234567'],['0821234567 ext 4',null],['',null]]){
   assert.equal((await db.query('select whatsapp_crm_phone($1) phone',[value])).rows[0].phone,expected)
  }
  const records=async actor=>(await rpcRole(db,'authenticated',actor).rpc('whatsapp_crm_records',{p_org:org,p_phone:'27821234567'})).data
  assert.deepEqual((await records(agentA)).map(x=>x.recordId).sort(),[buyerA,sellerA].sort())
  const management=await records(user)
  assert.equal(management.length,4);assert.ok(management.some(x=>x.recordId===recruit))
  assert.equal(management.some(x=>x.recordId===foreignLead),false)
  assert.deepEqual(await records(outsider),[])
  await db.query("update organisation_users set status='inactive' where user_id=$1",[agentA])
  assert.deepEqual(await records(agentA),[])
 }finally{await db.close()}
})

test('CRM links require an explicit matching choice, retain sources, audit changes and reject stale saves',async()=>{
 const db=await crmFixture()
 try{
  const conversationId=(await receive(db,'crm-choice')).rows[0].id,admin=crmHandler(db)
  const before=await crmContext(admin,conversationId)
  assert.equal(before.linked,null);assert.equal(before.version,0);assert.equal(before.candidates.length,4)
  await crmLink(admin,conversationId,'seller',sellerA)
  const linked=await crmContext(admin,conversationId)
  assert.equal(linked.linked.recordId,sellerA);assert.equal(linked.linked.path,`/pipeline/leads/${sellerA}`)
  await assert.rejects(crmLink(admin,conversationId,'buyer',buyerA),/link changed/)
  await assert.rejects(crmLink(admin,conversationId,'buyer',foreignLead,1),/unavailable/)
  await request(admin,'unlink_crm',{conversationId,linkVersion:1,assignmentVersion:1})
  assert.equal((await crmContext(admin,conversationId)).linked,null)
  const audit=(await db.query('select * from whatsapp_inbox_crm_link_events order by version')).rows
  assert.equal(audit.length,2);assert.equal(audit[1].previous_lead_id,sellerA);assert.equal(audit[1].lead_id,null)
  assert.equal((await db.query('select raw_enquiry_payload from leads where lead_id=$1',[sellerA])).rows[0].raw_enquiry_payload.campaign_name,'Original Meta campaign')
 }finally{await db.close()}
})

test('inbox access never grants recruitment or another agent CRM access, and CRM access never grants inbox access',async()=>{
 const db=await crmFixture()
 try{
  const conversationId=(await receive(db,'crm-private')).rows[0].id
  await assign(staffHandler(db),conversationId,agentA,1)
  const a=crmHandler(db,agentA),b=crmHandler(db,agentB),admin=crmHandler(db)
  await assert.rejects(crmContext(b,conversationId),/not found/)
  await assert.rejects(crmLink(a,conversationId,'buyer',buyerB,0,2),/unavailable/)
  await assert.rejects(crmLink(a,conversationId,'recruitment',recruit,0,2),/unavailable/)
  await crmLink(admin,conversationId,'recruitment',recruit,0,2)
  const hidden=await crmContext(a,conversationId)
  assert.equal(hidden.linked,null);assert.equal(hidden.linkedUnavailable,true)
  assert.equal(JSON.stringify(hidden).includes(recruit),false)
  assert.equal(JSON.stringify(hidden).includes('Recruitment Candidate'),false)
  await assert.rejects(request(a,'crm_conversations',{kind:'recruitment',recordId:recruit}),/unavailable/)
  assert.equal((await request(b,'crm_conversations',{kind:'buyer',recordId:buyerB})).conversations.length,0)
  assert.equal((await request(a,'crm_conversations',{kind:'buyer',recordId:buyerA})).conversations[0].id,conversationId)
  await request(a,'unlink_crm',{conversationId,linkVersion:1,assignmentVersion:2})
  await assert.rejects(rpcRole(db,'authenticated',agentA).rpc('whatsapp_crm_link_request',{p_org:org,p_actor:user,p_action:'context',p_conversation:conversationId}).then(result=>{if(result.error)throw result.error}),/permission denied/)
 }finally{await db.close()}
})

test('CRM linking rechecks handoffs and changed phone numbers after the visible-record lookup',async()=>{
 const db=await crmFixture()
 try{
  const conversationId=(await receive(db,'crm-race')).rows[0].id
  await assign(staffHandler(db),conversationId,agentA,1)
  const userDb=rpcRole(db,'authenticated',agentA),real=userDb.rpc
  let race='handoff'
  userDb.rpc=async(name,args)=>{
   const answer=await real(name,args)
   if(race==='handoff'){race='';await assign(staffHandler(db),conversationId,agentB,2)}
   else if(race==='phone'){race='';await db.query("update contacts set phone='0829999999' where contact_id=$1",[id(40)])}
   else if(race==='crm-assignment'){race='';await db.query('update leads set assigned_user_id=$1,assigned_agent_id=$1 where lead_id=$2',[agentB,buyerA])}
   return answer
  }
  const handler=crmHandler(db,agentA,{authorize:async()=>({userId:agentA,userDb})})
  await assert.rejects(crmLink(handler,conversationId,'buyer',buyerA,0,2),/not found/)
  await assign(staffHandler(db),conversationId,agentA,3);race='phone'
  await assert.rejects(crmLink(handler,conversationId,'buyer',buyerA,0,4),/phone no longer matches/)
  await db.query("update contacts set phone='0821234567' where contact_id=$1",[id(40)]);race='crm-assignment'
  await assert.rejects(crmLink(handler,conversationId,'buyer',buyerA,0,4),/record or permissions changed/)
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_crm_link_events')).rows[0].n,0)
 }finally{await db.close()}
})

test('CRM links persist through number transfers without widening record permissions',async()=>{
 const db=await crmFixture()
 try{
  await own(staffHandler(db),agentA)
  const conversationId=(await receive(db,'crm-transfer')).rows[0].id
  await crmLink(crmHandler(db,agentA),conversationId,'buyer',buyerA)
  await own(staffHandler(db),agentB,2)
  await assert.rejects(crmContext(crmHandler(db,agentA),conversationId),/not found/)
  const context=await crmContext(crmHandler(db,agentB),conversationId)
  assert.equal(context.linkedUnavailable,true);assert.equal(context.linked,null)
  assert.equal((await crmContext(crmHandler(db),conversationId)).linked.recordId,buyerA)
  await assert.rejects(crmLink(crmHandler(db),conversationId,'seller',sellerA,1,1),/assignment changed/)
 }finally{await db.close()}
})

test('linked records are re-read under current CRM permissions and phone changes do not erase the saved relationship',async()=>{
 const db=await crmFixture()
 try{
  await own(staffHandler(db),agentA)
  const conversationId=(await receive(db,'crm-current-record')).rows[0].id,a=crmHandler(db,agentA),admin=crmHandler(db)
  await crmLink(a,conversationId,'buyer',buyerA)
  assert.equal(JSON.stringify(await crmContext(a,conversationId)).includes('accessStamp'),false)
  await db.query("update contacts set phone='0829999999' where contact_id=$1",[id(40)])
  const changed=await crmContext(a,conversationId)
  assert.equal(changed.linked.recordId,buyerA);assert.equal(changed.linked.phoneMatches,false);assert.equal(changed.candidates.length,0)
  assert.equal((await request(a,'crm_conversations',{kind:'buyer',recordId:buyerA})).conversations[0].linked,true)
  await db.query('update leads set assigned_user_id=$1,assigned_agent_id=$1 where lead_id=$2',[agentB,buyerA])
  const hidden=await crmContext(a,conversationId)
  assert.equal(hidden.linked,null);assert.equal(hidden.linkedUnavailable,true);assert.equal(JSON.stringify(hidden).includes(buyerA),false)
  await assert.rejects(request(a,'crm_conversations',{kind:'buyer',recordId:buyerA}),/unavailable/)
  assert.equal((await crmContext(admin,conversationId)).linked.recordId,buyerA)
 }finally{await db.close()}
})

test('only an exact campaign reply context is attributed, with sender and recipient isolation and webhook deduplication',async()=>{
 const db=await crmFixture()
 try{
  const person=id(60),campaign=id(61),recipient=id(62)
  await db.query("insert into whatsapp_marketing_contacts(id,organisation_id,full_name,phone) values($1,$2,'Campaign Customer','27821234567')",[person,org])
  await db.query("insert into whatsapp_campaigns(id,organisation_id,name,sender_id) values($1,$2,'Seller campaign',$3)",[campaign,org,sender])
  await db.query("insert into whatsapp_campaign_recipients(id,organisation_id,campaign_id,contact_id,full_name,phone,payload,consent_snapshot,status,provider_message_id) values($1,$2,$3,$4,'Campaign Customer','27821234567','{}','{}','sent','wamid.campaign')",[recipient,org,campaign,person])
  const payload=(messageId,replyTo,from='27821234567',phone='100',waba='200')=>({entry:[{id:waba,changes:[{field:'messages',value:{metadata:{phone_number_id:phone},messages:[{id:messageId,from,timestamp:String(Date.parse(time)/1000),type:'text',text:{body:'Interested'},...(replyTo?{context:{id:replyTo}}:{})}]}}]}]})
  for(const body of [payload('campaign-reply','wamid.campaign'),payload('campaign-reply','wamid.campaign'),payload('no-context'),payload('wrong-context','wamid.other'),payload('other-person','wamid.campaign','27829999999'),payload('foreign-reply','wamid.campaign','27821234567','101','201')]) await applyWhatsAppInboxWebhook(sqlClient(db),body)
  const rows=(await db.query('select provider_message_id,campaign_recipient_id from whatsapp_inbox_messages order by provider_message_id')).rows
  assert.equal(rows.length,5);assert.equal(rows.filter(x=>x.campaign_recipient_id).length,1)
  assert.equal(rows.find(x=>x.provider_message_id==='campaign-reply').campaign_recipient_id,recipient)
  const thread=(await db.query("select id from whatsapp_inbox_conversations where channel_id=$1 and contact_phone='27821234567'",[sender])).rows[0]
  assert.deepEqual((await crmContext(crmHandler(db),thread.id)).campaigns,[{id:campaign,name:'Seller campaign'}])
  assert.equal((await db.query('select consent_status from whatsapp_marketing_contacts where id=$1',[person])).rows[0].consent_status,'unknown')
  await applyWhatsAppInboxWebhook(sqlClient(db),payload('late-callback','wamid.late'))
  await db.query("update whatsapp_campaign_recipients set provider_message_id='wamid.late',status='unknown' where id=$1",[recipient])
  // The recipient's callback can arrive after the inbound reply. The preserved
  // exact provider context still resolves without guessing or duplicate sends.
  await db.query('update whatsapp_inbox_messages set campaign_recipient_id=null where conversation_id=$1',[thread.id])
  assert.deepEqual((await crmContext(crmHandler(db),thread.id)).campaigns,[{id:campaign,name:'Seller campaign'}])
  assert.equal((await db.query("select reply_to_provider_message_id from whatsapp_inbox_messages where provider_message_id='late-callback'")).rows[0].reply_to_provider_message_id,'wamid.late')
  await applyWhatsAppInboxWebhook(sqlClient(db),payload('late-callback','wamid.changed-context'))
  assert.equal((await db.query("select reply_to_provider_message_id from whatsapp_inbox_messages where provider_message_id='late-callback'")).rows[0].reply_to_provider_message_id,'wamid.late')
 }finally{await db.close()}
})

async function messagingFixture(){return teamFixture()}
const approvedTemplate={id:'800',name:'agent_follow_up',language:'en',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Hello {{1}}, following up on your enquiry.'}]}
const pdf={mimeType:'application/pdf',filename:'property.pdf',base64:Buffer.from('%PDF-1.7\nFictional test document').toString('base64')}
const messagingHandler=(db,actor=user,extra={})=>staffHandler(db,actor,{hash:async bytes=>Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex'),uploadMedia:async()=>({id:'900'}),graph:async(_token,path)=>path.includes('/message_templates')?{data:[approvedTemplate]}:{messages:[{id:'wamid.inbox'}]},...extra})
const sendMessage=(handler,conversationId,requestId,fields={})=>request(handler,'send_message',{conversationId,assignmentVersion:1,requestId,kind:'text',message:'A direct reply',...fields})
const allowTemplates=(handler,conversationId,version=0,assignmentVersion=1,at=new Date(Date.parse(time)-60000).toISOString())=>request(handler,'message_permission',{conversationId,operation:'save',confirmed:true,source:'Recipient requested WhatsApp follow-up',consentAt:at,version,assignmentVersion})

test('inbox file validation rejects mismatched formats, oversized and malformed data and bounds JSON requests',async()=>{
 assert.equal(decodeInboxAttachment(pdf).mimeType,'application/pdf')
 assert.throws(()=>decodeInboxAttachment({...pdf,mimeType:'image/png'}),/contents/)
 assert.throws(()=>decodeInboxAttachment({...pdf,base64:'!!!='}),/invalid/)
 assert.throws(()=>decodeInboxAttachment({...pdf,mimeType:'text/html'}),/JPEG, PNG or PDF/)
 assert.throws(()=>decodeInboxAttachment({...pdf,base64:'A'.repeat(12*1024*1024)}),/larger than/)
 await assert.rejects(readMetaIntegrationPayload(new Request('https://example.test',{method:'POST',body:JSON.stringify({action:'send_message',message:'x'.repeat(60000)})})),/too large/)
 assert.equal((await readMetaIntegrationPayload(new Request('https://example.test',{method:'POST',body:JSON.stringify({action:'upload_attachment',file:pdf})}))).file.filename,pdf.filename)
})

test('inbox messages claim once under concurrency, checks never resend and request IDs cannot change intent',async()=>{
 const db=await messagingFixture()
 try{
  const conversationId=(await receive(db,'stage2-send')).rows[0].id;let sent=0
  const handler=messagingHandler(db,user,{graph:async()=>{sent++;return {messages:[{id:'wamid.once'}]}}})
  const fields=[handler,conversationId,id(100)]
  await Promise.all([sendMessage(...fields),sendMessage(...fields)])
  assert.equal(sent,1)
  assert.equal((await request(handler,'message_receipt',{conversationId,requestId:id(100)})).message.delivery_status,'sent')
  await assert.rejects(sendMessage(handler,conversationId,id(100),{message:'A changed request'}),/already used/)
  assert.equal(sent,1)
  assert.equal((await request(handler,'message_receipt',{conversationId,requestId:id(101)})).message,null)
  const uncertain=messagingHandler(db,user,{graph:async()=>{sent++;throw Error('Response lost')}})
  assert.equal((await sendMessage(uncertain,conversationId,id(102))).message.delivery_status,'unknown')
  await sendMessage(uncertain,conversationId,id(102));assert.equal(sent,2)
 }finally{await db.close()}
})

test('approved one-to-one templates require separate permission and remain available on private agent numbers outside the reply window',async()=>{
 const db=await messagingFixture()
 try{
  await own(staffHandler(db),agentA)
  const conversationId=(await receive(db,'stage2-template',new Date(Date.parse(time)-2*86400000).toISOString())).rows[0].id
  let sent=0;const handler=messagingHandler(db,agentA,{graph:async(_token,path,body)=>{if(path.includes('/message_templates'))return {data:[approvedTemplate]};sent++;assert.equal(body.template.language.code,'en');return {messages:[{id:'wamid.template'}]}}})
  await assert.rejects(sendMessage(handler,conversationId,id(103)),/24-hour/)
  const templateFields={kind:'template',message:'',template:approvedTemplate,values:{'body.1':{source:'text',text:'Sample Customer'}}}
  await assert.rejects(sendMessage(handler,conversationId,id(104),templateFields),/permission/)
  await allowTemplates(handler,conversationId)
  assert.equal((await sendMessage(handler,conversationId,id(104),templateFields)).message.delivery_status,'sent')
  assert.equal(sent,1)
  assert.equal((await db.query('select count(*)::int n from whatsapp_marketing_contacts')).rows[0].n,0)
  const changed={...approvedTemplate,components:[{type:'BODY',text:'Different wording'}]}
  await assert.rejects(sendMessage(handler,conversationId,id(105),{...templateFields,template:changed}),/template changed/)
  assert.equal(sent,1)
 }finally{await db.close()}
})

test('attachments stay bound to their conversation, actor and number and can supply an approved template header',async()=>{
 const db=await messagingFixture()
 try{
  const conversationId=(await receive(db,'stage2-attachment')).rows[0].id;let uploads=0;const sent=[]
  const template={...approvedTemplate,id:'801',components:[{type:'HEADER',format:'DOCUMENT'},...approvedTemplate.components]}
  const handler=messagingHandler(db,user,{uploadMedia:async(_token,phone,file)=>{uploads++;assert.equal(phone,'100');assert.equal(file.mimeType,'application/pdf');return {id:'900'}},graph:async(_token,path,body)=>{if(path.includes('/message_templates'))return {data:[template]};sent.push(body);return {messages:[{id:`wamid.media.${sent.length}`}]}}})
  const uploadFields={conversationId,assignmentVersion:1,requestId:id(106),file:pdf}
  const uploaded=await request(handler,'upload_attachment',uploadFields)
  await request(handler,'upload_attachment',uploadFields);assert.equal(uploads,1)
  assert.equal((await sendMessage(handler,conversationId,id(107),{kind:'document',uploadId:uploaded.upload.id,message:'Requested property details'})).message.media_json.id,'900')
  assert.equal(sent[0].document.id,'900');assert.equal(sent[0].document.link,undefined)
  await allowTemplates(handler,conversationId)
  await sendMessage(handler,conversationId,id(108),{kind:'template',uploadId:uploaded.upload.id,message:'',template,values:{'body.1':{source:'text',text:'Sample'}}})
  assert.equal(sent[1].template.components[0].parameters[0].document.id,'900')
  const otherThread=(await db.query("insert into whatsapp_inbox_conversations(organisation_id,channel_id,contact_phone) values($1,$2,'27829999999') returning id",[org,sender])).rows[0].id
  await assert.rejects(sendMessage(handler,otherThread,id(109),{kind:'document',uploadId:uploaded.upload.id}),/attachment/)
  await db.query("update whatsapp_inbox_uploads set expires_at='2020-01-01' where id=$1",[uploaded.upload.id])
  await assert.rejects(sendMessage(handler,conversationId,id(110),{kind:'document',uploadId:uploaded.upload.id}),/current attachment/)
  assert.equal(sent.length,2)
 }finally{await db.close()}
})

test('handoffs during provider template checks block the final claim and unconfirmed uploads never send',async()=>{
 const db=await messagingFixture()
 try{
  await own(staffHandler(db),agentA)
  const conversationId=(await receive(db,'stage2-race')).rows[0].id;let sent=0
  const handler=messagingHandler(db,agentA,{graph:async(_token,path)=>{if(path.includes('/message_templates')){await assign(staffHandler(db),conversationId,agentB,1);return {data:[approvedTemplate]}}sent++;return {messages:[{id:'unexpected'}]}}})
  await allowTemplates(handler,conversationId)
  await assert.rejects(sendMessage(handler,conversationId,id(111),{kind:'template',message:'',template:approvedTemplate,values:{'body.1':{source:'text',text:'Sample'}}}),/assignment|not found/)
  assert.equal(sent,0)
  const failedUpload=messagingHandler(db,agentB,{uploadMedia:async()=>{throw Error('Lost upload response')}})
  await assert.rejects(request(failedUpload,'upload_attachment',{conversationId,assignmentVersion:2,requestId:id(112),file:pdf}),/not confirmed/)
  assert.equal((await db.query('select status from whatsapp_inbox_uploads where id=$1',[id(112)])).rows[0].status,'unknown')
 }finally{await db.close()}
})

test('STOP revokes template permission idempotently and newer explicit agreement does not opt into bulk campaigns',async()=>{
 const db=await messagingFixture()
 try{
  const conversationId=(await receive(db,'stage2-stop')).rows[0].id,handler=messagingHandler(db)
  await allowTemplates(handler,conversationId)
  const stoppedAt=new Date(Date.parse(time)+1000).toISOString()
  await db.query('select whatsapp_inbox_optout($1,$2,$3,$4)',['100','200','27821234567',stoppedAt])
  await db.query('select whatsapp_inbox_optout($1,$2,$3,$4)',['100','200','27821234567',stoppedAt])
  assert.equal((await request(handler,'message_permission',{conversationId})).permission.version,2)
  await assert.rejects(sendMessage(handler,conversationId,id(113),{kind:'template',template:approvedTemplate,values:{'body.1':{source:'text',text:'Sample'}}}),/permission/)
  await assert.rejects(allowTemplates(handler,conversationId,2),/after their last opt-out/)
  await allowTemplates(handler,conversationId,2,1,new Date(Date.parse(stoppedAt)+1000).toISOString())
  assert.equal((await db.query('select count(*)::int n from whatsapp_marketing_contacts')).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_permission_events')).rows[0].n,3)
 }finally{await db.close()}
})

test('a newer bulk opt-out blocks direct templates, including legacy opt-outs without a timestamp',async()=>{
 const db=await messagingFixture()
 try{
  const conversationId=(await receive(db,'stage2-bulk-optout')).rows[0].id,handler=messagingHandler(db)
  await allowTemplates(handler,conversationId)
  const optedOutAt=new Date(Date.parse(time)+1000).toISOString()
  await db.query("insert into whatsapp_marketing_contacts(organisation_id,full_name,phone,consent_status,updated_at) values($1,'Fictional recipient','27821234567','opted_out',$2)",[org,optedOutAt])
  const fields={kind:'template',template:approvedTemplate,values:{'body.1':{source:'text',text:'Fictional'}}}
  await assert.rejects(sendMessage(handler,conversationId,id(117),fields),/permission/)
  await allowTemplates(handler,conversationId,1,1,new Date(Date.parse(time)+2000).toISOString())
  assert.equal((await sendMessage(handler,conversationId,id(117),fields)).message.delivery_status,'sent')
  const contact=(await db.query("select consent_status,opted_out_at from whatsapp_marketing_contacts where organisation_id=$1",[org])).rows[0]
  assert.equal(contact.consent_status,'opted_out');assert.equal(contact.opted_out_at,null)
 }finally{await db.close()}
})

test('conversation pages and search reach older assigned chats while excluding other agents',async()=>{
 const db=await messagingFixture()
 try{
  await own(staffHandler(db),agentA)
  await db.query("insert into whatsapp_inbox_conversations(id,organisation_id,channel_id,contact_phone,contact_name,last_message_at,assigned_user_id) select gen_random_uuid(),$1,$2,'2782000'||lpad(n::text,4,'0'),'Fictional customer '||n,$3::timestamptz-interval '1 second'*n,$4 from generate_series(1,106) n",[org,sender,time,agentA])
  const a=messagingHandler(db,agentA),b=messagingHandler(db,agentB)
  const first=await request(a,'inbox_page'),second=await request(a,'inbox_page',{cursor:first.nextCursor}),third=await request(a,'inbox_page',{cursor:second.nextCursor})
  assert.equal(new Set([...first.conversations,...second.conversations,...third.conversations].map(row=>row.id)).size,106)
  assert.equal(third.nextCursor,null);assert.equal(third.conversations.length,6)
  assert.equal((await request(a,'inbox_page',{search:'Fictional customer 106'})).conversations.length,1)
  assert.equal((await request(b,'inbox_page',{search:'Fictional customer 106'})).conversations.length,0)
 }finally{await db.close()}
})

test('history uses stable keyset pages, notifications obey current assignments and cached conversation IDs are re-authorized',async()=>{
 const db=await messagingFixture()
 try{
  await own(staffHandler(db),agentA)
  const conversationId=(await receive(db,'stage2-history')).rows[0].id,a=messagingHandler(db,agentA),b=messagingHandler(db,agentB)
  for(let index=0;index<105;index++)await db.query("insert into whatsapp_inbox_messages(id,organisation_id,conversation_id,channel_id,provider_message_id,direction,message_type,body_text,media_json,delivery_status,event_at) values($1,$2,$3,$4,$5,'inbound','text',$5,'{}','received',$6)",[id(200+index),org,conversationId,sender,`history-${index}`,time])
  assert.equal((await request(a,'inbox_notifications')).unreadCount,1);assert.equal((await request(b,'inbox_notifications')).unreadCount,0)
  const first=await request(a,'message_page',{conversationId}),second=await request(a,'message_page',{conversationId,cursor:first.nextCursor}),third=await request(a,'message_page',{conversationId,cursor:second.nextCursor})
  assert.equal(new Set([...first.messages,...second.messages,...third.messages].map(row=>row.id)).size,106)
  assert.equal(first.messages.length,50);assert.equal(third.nextCursor,null)
  assert.equal((await request(a,'inbox_notifications')).unreadCount,0)
  const cached=await request(a,'inbox_page',{knownIds:[conversationId]});assert.deepEqual(cached.visibleIds,[conversationId])
  await assign(staffHandler(db),conversationId,agentB,1)
  assert.deepEqual((await request(a,'inbox_page',{knownIds:[conversationId]})).visibleIds,[])
  await assert.rejects(request(a,'message_page',{conversationId,cursor:first.nextCursor}),/not found/)
  await assert.rejects(request(a,'inbox_page',{cursor:{at:time}}),/cursor/)
 }finally{await db.close()}
})

test('the real service role can send stage 2 messages and browser roles cannot call claims or read uploads',async()=>{
 const db=await messagingFixture()
 try{
  await db.exec('alter role service_role bypassrls;set role service_role')
  const conversationId=(await receive(db,'stage2-service-role')).rows[0].id,handler=messagingHandler(db)
  assert.equal((await sendMessage(handler,conversationId,id(114))).message.delivery_status,'sent')
  await allowTemplates(handler,conversationId)
  assert.equal((await request(handler,'upload_attachment',{conversationId,assignmentVersion:1,requestId:id(115),file:pdf})).upload.status,'ready')
  await db.exec('reset role;set role authenticated')
  await assert.rejects(db.query('select * from whatsapp_inbox_uploads'),/permission denied/)
  await assert.rejects(db.query('select whatsapp_inbox_claim($1,$2,$3,$4,$5,$6,$7)',[org,user,conversationId,id(116),'{}',1,1]),/permission denied/)
 }finally{await db.close()}
})



const businessAppCore=await import('../../supabase/functions/_shared/whatsappBusinessApp.js')
const {createBusinessAppWorker}=await import('../../supabase/functions/whatsapp-business-app-worker/worker.js')
const businessPhone='27820000000',customerPhone='27821234567'
const liveAt=()=>new Date(Date.now()-1000).toISOString()
const epoch=value=>String(Math.floor(Date.parse(value)/1000))
const appPayload=(field,value={},phoneId='100',waba='200')=>({object:'whatsapp_business_account',entry:[{id:waba,time:Math.floor(Date.now()/1000),changes:[{field,value:{messaging_product:'whatsapp',metadata:{phone_number_id:phoneId,display_phone_number:businessPhone},...value}}]}]})
const appMessage=(messageId,fields={})=>({id:messageId,from:customerPhone,timestamp:epoch(liveAt()),type:'text',text:{body:'Fictional phone app message'},...fields})
async function appFixture(){const db=await teamFixture();await own(staffHandler(db),agentA);await db.query("update organisation_communication_channels set onboarding_mode='coexistence',business_app_session=$2,business_app_connected_at=now()-interval '1 hour',display_phone_number=$3 where id=$1",[sender,id(600),businessPhone]);return db}
const drainApp=(db,options={})=>createBusinessAppWorker({db:sqlClient(db),...options})()
const appStatus=(db,actor=agentA)=>request(staffHandler(db,actor),'business_app_status',{senderId:sender})
const onboardingSetup=(db,{phones=[{id:'102',display_phone_number:'+27 82 333 4444',is_on_biz_app:true,platform_type:'CLOUD_API'}],sendSync,subscribe}={})=>{
 const calls=[]
 const graph=async(_token,path,payload)=>{
  calls.push({path,payload})
  if(path.includes('/smb_app_data'))return sendSync?sendSync(path,payload):{request_id:`request-${payload.sync_type}`}
  if(path.endsWith('/subscribed_apps')){if(subscribe)await subscribe();return {success:true}}
  if(path.startsWith('200/phone_numbers'))return {data:phones}
  if(path.startsWith('200?'))return {id:'200',name:'Fictional business'}
  const phone=phones.find(row=>path.startsWith(`${row.id}?`));return {...phone,verified_name:'Fictional phone app'}
 }
 return {calls,handler:staffHandler(db,agentA,{now:()=>new Date(),config:{appId:'app',whatsappConfigId:'v4-config',graphVersion:'v25.0'},hash:async value=>`hash:${value}`,encrypt:async()=> 'encrypted',decrypt:async()=> 'fake-token',exchangeCode:async()=> 'fake-token',graph})}
}
async function beginApp(handler){const intent=await request(handler,'begin_whatsapp',{coexistence:true});await request(handler,'exchange_whatsapp_code',{state:intent.state,code:'fake-code'});return intent}

test('phone app onboarding resolves WABA-only completion, verifies coexistence and requests contacts and history exactly once',async()=>{
 const db=await teamFixture()
 try{
  const {handler,calls}=onboardingSetup(db),intent=await beginApp(handler)
  const connected=await request(handler,'finish_whatsapp',{state:intent.state,wabaId:'200'})
  assert.equal(connected.sender.onboarding_mode,'coexistence');assert.equal(connected.sender.connection_status,'connected');assert.equal(connected.sender.owner_user_id,agentA)
  assert.equal(connected.sync.history,'requested')
  assert.deepEqual(calls.filter(call=>call.path.includes('smb_app_data')).map(call=>call.payload.sync_type),['smb_app_state_sync','history'])
  assert.equal(calls.some(call=>call.path.endsWith('/register')),false)
  assert.ok(!JSON.stringify(connected).includes('encrypted'));assert.ok(!JSON.stringify(connected).includes('fake-token'))
  await Promise.all([request(handler,'start_business_app_sync',{senderId:connected.sender.id,ownershipVersion:1}),request(handler,'start_business_app_sync',{senderId:connected.sender.id,ownershipVersion:1})])
  assert.equal(calls.filter(call=>call.path.includes('smb_app_data')).length,2)
  await db.query("update organisation_communication_channels set connection_status='pending' where id=$1",[connected.sender.id])
  await assert.rejects(request(handler,'register_sender',{senderId:connected.sender.id,pin:'123456'}),/already registered/)
 }finally{await db.close()}
})

test('multiple authorized phone app numbers require a choice and rejected or foreign assets cannot finish onboarding',async()=>{
 const db=await teamFixture()
 try{
  const phones=['102','103'].map(number=>({id:number,display_phone_number:number,is_on_biz_app:true,platform_type:'CLOUD_API'}))
  const {handler,calls}=onboardingSetup(db,{phones}),intent=await beginApp(handler)
  const choice=await request(handler,'finish_whatsapp',{state:intent.state,wabaId:'200'})
  assert.equal(choice.requiresPhoneSelection,true);assert.equal(choice.phones.length,2)
  assert.equal(calls.some(call=>call.path.endsWith('/subscribed_apps')),false)
  await assert.rejects(request(handler,'finish_whatsapp',{state:intent.state,wabaId:'200',phoneNumberId:'999'}),/does not belong/)
  const result=await request(handler,'finish_whatsapp',{state:intent.state,wabaId:'200',phoneNumberId:'103'})
  assert.equal(result.sender.phone_number_id,'103')
  const next=await beginApp(handler)
  const rejected=onboardingSetup(db,{phones:[{id:'104',is_on_biz_app:false,platform_type:'CLOUD_API'}]}).handler
  await assert.rejects(request(rejected,'finish_whatsapp',{state:next.state,wabaId:'200',phoneNumberId:'104'}),/not confirmed/)
 }finally{await db.close()}
})

test('a membership revocation during Meta verification blocks the final number save and all sync requests',async()=>{
 const db=await teamFixture()
 try{
  const {handler,calls}=onboardingSetup(db,{subscribe:()=>db.query("update organisation_users set status='suspended' where user_id=$1",[agentA])}),intent=await beginApp(handler)
  await assert.rejects(request(handler,'finish_whatsapp',{state:intent.state,wabaId:'200'}),/membership/)
  assert.equal((await db.query("select count(*)::int n from organisation_communication_channels where phone_number_id='102'")).rows[0].n,0)
  assert.equal(calls.filter(call=>call.path.includes('smb_app_data')).length,0)
 }finally{await db.close()}
})

test('an unconfirmed one-time contacts request is never repeated and does not prevent requesting history',async()=>{
 const db=await teamFixture()
 try{
  const {handler,calls}=onboardingSetup(db,{sendSync:(_path,payload)=>{if(payload.sync_type==='smb_app_state_sync')throw Error('Response lost');return {request_id:'history-request'}}}),intent=await beginApp(handler)
  const result=await request(handler,'finish_whatsapp',{state:intent.state,wabaId:'200'})
  assert.equal(result.sync.requests.smb_app_state_sync.status,'unknown');assert.equal(result.sync.requests.history.status,'requested')
  await request(handler,'start_business_app_sync',{senderId:result.sender.id,ownershipVersion:1})
  assert.equal(calls.filter(call=>call.path.includes('smb_app_data')).length,2)
 }finally{await db.close()}
})

test('phone app echoes enter the current private inbox once, without unread alerts, reply windows or provider sends',async()=>{
 const db=await appFixture()
 try{
  const payload=appPayload('smb_message_echoes',{message_echoes:[appMessage('wamid.app-echo',{from:businessPhone,to:customerPhone})]})
  await applyWhatsAppInboxWebhook(sqlClient(db),payload);await applyWhatsAppInboxWebhook(sqlClient(db),payload)
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_messages')).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from whatsapp_business_app_events')).rows[0].n,1)
  await drainApp(db)
  const conversation=(await db.query('select * from whatsapp_inbox_conversations')).rows[0]
  assert.equal(conversation.assigned_user_id,agentA);assert.equal(conversation.unread_count,0);assert.equal(conversation.last_inbound_at,null)
  const messages=await request(staffHandler(db,agentA),'message_page',{conversationId:conversation.id})
  assert.equal(messages.messages.length,1);assert.equal(messages.messages[0].message_origin,'business_app');assert.equal(messages.messages[0].created_by,null);assert.equal(messages.conversation.canReply,false)
  await assert.rejects(request(staffHandler(db,agentB),'message_page',{conversationId:conversation.id}),/not found/)
  await assert.rejects(appStatus(db,agentB),/own WhatsApp/)
 }finally{await db.close()}
})

test('history uses checkpoints for over a thousand messages, recovers a lost processing response and imports without consent side effects',async()=>{
 const db=await appFixture()
 try{
  const old=new Date(Date.now()-86400000).toISOString(),messages=Array.from({length:1600},(_,index)=>appMessage(`wamid.history-${index}`,{timestamp:epoch(old),text:{body:index===0?'STOP':`Fictional history ${index}`}}))
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{history:[{metadata:{phase:2,chunk_order:1,progress:100},threads:[{id:customerPhone,messages}]}]}))
  const adapter=sqlClient(db),rpc=adapter.rpc;let lost=false
  adapter.rpc=async(name,args)=>{const result=await rpc(name,args);if(name==='whatsapp_business_app_process'&&!lost&&!result.error){lost=true;return {data:null,error:Error('Lost response after committed checkpoint')}}return result}
  await createBusinessAppWorker({db:adapter,limit:1})()
  assert.equal((await db.query('select cursor_position from whatsapp_business_app_events')).rows[0].cursor_position,100)
  assert.notEqual((await appStatus(db)).history,'complete')
  await Promise.all([drainApp(db),drainApp(db)]);await drainApp(db)
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_messages')).rows[0].n,1600)
  assert.equal((await db.query('select unread_count,last_inbound_at from whatsapp_inbox_conversations')).rows[0].unread_count,0)
  assert.equal((await appStatus(db)).history,'complete')
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_permissions')).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from whatsapp_marketing_contacts')).rows[0].n,0)
  assert.deepEqual((await db.query('select payload_json from whatsapp_business_app_events')).rows[0].payload_json,{})
 }finally{await db.close()}
})

test('late history and media hydrate placeholders without overwriting real content, reopening closed chats or duplicating live arrivals',async()=>{
 const db=await appFixture()
 try{
  const old=new Date(Date.now()-86400000).toISOString(),placeholder=appMessage('wamid.placeholder',{type:'media_placeholder',timestamp:epoch(old)})
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{history:[{metadata:{phase:1,chunk_order:2,progress:55},threads:[{id:customerPhone,messages:[placeholder]}]}]}));await drainApp(db)
  const conversation=(await db.query('select * from whatsapp_inbox_conversations')).rows[0]
  await db.query("update whatsapp_inbox_conversations set status='closed' where id=$1",[conversation.id])
  const media=appMessage('wamid.placeholder',{type:'image',image:{id:'900',mime_type:'image/jpeg',caption:'Fictional photo'},timestamp:epoch(old)})
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{messages:[media]}));await drainApp(db)
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{history:[{threads:[{id:customerPhone,messages:[placeholder]}]}]}));await drainApp(db)
  const message=(await db.query('select * from whatsapp_inbox_messages')).rows[0]
  assert.equal(message.message_type,'image');assert.equal(message.media_json.id,'900');assert.equal(message.body_text,'Fictional photo')
  const current=(await db.query('select * from whatsapp_inbox_conversations')).rows[0]
  assert.equal(current.status,'closed');assert.equal(current.unread_count,0);assert.equal(current.last_inbound_at,null);assert.ok(current.content_version>conversation.content_version)
  const live=appMessage('wamid.live-after-history')
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{history:[{threads:[{id:customerPhone,messages:[live]}]}]}));await drainApp(db)
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('messages',{messages:[live]}));await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('messages',{messages:[live]}))
  const opened=(await db.query('select * from whatsapp_inbox_conversations')).rows[0]
  assert.equal(opened.unread_count,1);assert.ok(opened.last_inbound_at);assert.equal(opened.status,'open')
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_messages')).rows[0].n,2)
 }finally{await db.close()}
})

test('contact sync labels existing chats, preserves removals against stale adds, and never creates CRM or campaign records',async()=>{
 const db=await appFixture()
 try{
  const timestamp=Math.floor(Date.now()/1000)-10
  const sync=(action,name,seconds=timestamp)=>appPayload('smb_app_state_sync',{state_sync:[{type:'contact',contact:{phone_number:customerPhone,full_name:name},action,metadata:{timestamp:String(seconds)}}]})
  await applyWhatsAppInboxWebhook(sqlClient(db),sync('add','Private phone book name'));await drainApp(db)
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_conversations')).rows[0].n,0)
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('messages',{contacts:[{wa_id:customerPhone,profile:{name:'Provider profile'}}],messages:[appMessage('wamid.contact-live')]}))
  assert.equal((await db.query('select contact_name from whatsapp_inbox_conversations')).rows[0].contact_name,'Private phone book name')
  await applyWhatsAppInboxWebhook(sqlClient(db),sync('remove','',timestamp+1));await drainApp(db)
  await applyWhatsAppInboxWebhook(sqlClient(db),sync('add','Stale private name',timestamp));await drainApp(db)
  assert.equal((await db.query('select contact_name from whatsapp_inbox_conversations')).rows[0].contact_name,'')
  assert.equal((await db.query('select count(*)::int n from whatsapp_marketing_contacts')).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_permissions')).rows[0].n,0)
 }finally{await db.close()}
})

test('edits and deletion tombstones arriving before the original survive older history and media without opening a reply window',async()=>{
 const db=await appFixture()
 try{
  const original=appMessage('wamid.edit-original',{timestamp:epoch(new Date(Date.now()-86400000).toISOString()),text:{body:'Old private content'}})
  const edit=appMessage('wamid.edit-event',{type:'edit',edit:{original_message_id:original.id,message:{type:'text',text:{body:'Updated private content'}}}})
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('messages',{messages:[edit]}));await drainApp(db)
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_messages')).rows[0].n,0)
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{history:[{threads:[{id:customerPhone,messages:[original]}]}]}));await drainApp(db)
  assert.equal((await db.query('select body_text from whatsapp_inbox_messages')).rows[0].body_text,'Updated private content')
  const revoke=appMessage('wamid.revoke-event',{type:'revoke',revoke:{original_message_id:original.id}})
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('messages',{messages:[revoke]}));await drainApp(db)
  const deleted=(await db.query('select * from whatsapp_inbox_messages')).rows[0]
  assert.equal(deleted.body_text,'');assert.deepEqual(deleted.media_json,{});assert.ok(deleted.revoked_at)
  const version=(await db.query('select content_version from whatsapp_inbox_conversations')).rows[0].content_version
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{messages:[original]}));await drainApp(db)
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('messages',{messages:[edit]}));await drainApp(db)
  assert.equal((await db.query('select body_text from whatsapp_inbox_messages')).rows[0].body_text,'')
  const conversation=(await db.query('select * from whatsapp_inbox_conversations')).rows[0]
  assert.equal(conversation.content_version,version);assert.equal(conversation.last_inbound_at,null);assert.equal(conversation.unread_count,0)
 }finally{await db.close()}
})

test('history refusal is visible, progress cannot regress, and a phone-app disconnect cancels queued work without restoring tokens on reconnect events',async()=>{
 const db=await appFixture()
 try{
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{history:[{errors:[{code:2593109}]}]}));await drainApp(db)
  assert.equal((await appStatus(db)).history,'declined')
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{history:[{metadata:{progress:100}}]}));await drainApp(db)
  assert.equal((await appStatus(db)).history,'declined')
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('smb_message_echoes',{message_echoes:[appMessage('wamid.cancelled',{from:businessPhone,to:customerPhone})]}))
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('account_update',{event:'PARTNER_REMOVED',phone_number:businessPhone,disconnection_info:{reason:'PRIMARY_INACTIVITY'}}))
  await drainApp(db)
  assert.equal((await db.query('select status from whatsapp_business_app_events order by created_at desc limit 1')).rows[0].status,'cancelled')
  await applyWhatsAppInboxWebhook(sqlClient(db),{...appPayload('account_update',{event:'ACCOUNT_RECONNECTED'}),entry:[{...appPayload('account_update').entry[0],time:Math.floor(Date.now()/1000)+1,changes:[{field:'account_update',value:{event:'ACCOUNT_RECONNECTED'}}]}]})
  const current=(await db.query('select connection_status,meta_access_token,token_ciphertext from organisation_communication_channels where id=$1',[sender])).rows[0]
  assert.equal(current.connection_status,'disconnected');assert.equal(current.meta_access_token,'');assert.equal(current.token_ciphertext,null)
 }finally{await db.close()}
})

test('foreign WABA/number combinations and non-coexistence numbers cannot import phone-app data, and browser roles cannot execute worker or import functions',async()=>{
 const db=await appFixture()
 try{
  const value={message_echoes:[appMessage('wamid.foreign',{from:businessPhone,to:customerPhone})]}
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('smb_message_echoes',value,'100','201'))
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('smb_message_echoes',value,'101','201'))
  assert.equal((await db.query('select count(*)::int n from whatsapp_business_app_events')).rows[0].n,0)
  await db.exec('alter role service_role bypassrls;set role service_role')
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('smb_message_echoes',value));await drainApp(db)
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_messages')).rows[0].n,1)
  await db.exec('reset role;set role authenticated')
  for(const table of ['whatsapp_business_app_events','whatsapp_business_app_contacts','whatsapp_business_app_requests','whatsapp_business_app_mutations'])await assert.rejects(db.query(`select * from ${table}`),/permission denied/)
  await assert.rejects(db.query('select * from whatsapp_business_app_claim_event()'),/permission denied/)
  await assert.rejects(db.query('select private.run_whatsapp_business_app_worker()'),/permission denied/)
  await db.exec('reset role')
  const checks=(await db.query("select c.relname,c.relrowsecurity,has_table_privilege('authenticated',c.oid,'SELECT') as browser_read from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'whatsapp_business_app_%'")).rows
  assert.equal(checks.length,4);assert.ok(checks.every(row=>row.relrowsecurity&&!row.browser_read))
  const functions=(await db.query("select p.proname,p.prosecdef,has_function_privilege('authenticated',p.oid,'EXECUTE') browser_call,has_function_privilege('anon',p.oid,'EXECUTE') public_call from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'whatsapp_business_app_%' or p.proname='whatsapp_finish_authorization')")).rows
  assert.ok(functions.length>=10);assert.ok(functions.every(row=>!row.prosecdef&&!row.browser_call&&!row.public_call))
 }finally{await db.close()}
})

test('saved update leases reject stale workers, retry failures safely and expire one-time requests after 24 hours',async()=>{
 const db=await appFixture()
 try{
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('smb_message_echoes',{message_echoes:[appMessage('wamid.retry',{from:businessPhone,to:customerPhone})]}))
  const job=(await db.query('select * from whatsapp_business_app_claim_event()')).rows[0]
  assert.equal((await db.query('select whatsapp_business_app_process($1,$2,$3,$4,$5) accepted',[job.id,id(699),'[]',0,true])).rows[0].accepted,false)
  await db.query("update whatsapp_business_app_events set attempts=5 where id=$1",[job.id]);await db.query('select whatsapp_business_app_fail($1,$2)',[job.id,job.lease_token])
  assert.equal((await appStatus(db)).failedUpdates,1)
  await assert.rejects(request(staffHandler(db,agentB),'retry_business_app_updates',{senderId:sender,ownershipVersion:2}),/own WhatsApp/)
  await request(staffHandler(db,agentA),'retry_business_app_updates',{senderId:sender,ownershipVersion:2});await drainApp(db)
  assert.equal((await appStatus(db)).failedUpdates,0);assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_messages')).rows[0].n,1)
  await db.query("update organisation_communication_channels set business_app_connected_at=now()-interval '25 hours' where id=$1",[sender])
  await assert.rejects(request(staffHandler(db,agentA),'start_business_app_sync',{senderId:sender,ownershipVersion:2}),/period expired/)
 }finally{await db.close()}
})

test('phone app normalization ignores group and malformed messages and bounds signed webhook capture',async()=>{
 const rows=businessAppCore.businessAppItems('history',{metadata:{display_phone_number:businessPhone},history:[{threads:[{id:'123@g.us',messages:[appMessage('group')]},{id:customerPhone,messages:[appMessage('good'),appMessage('',{timestamp:'not a time'})]}],metadata:{progress:100}}]})
 assert.deepEqual(rows.map(row=>row.kind),['message','progress'])
 const body=new Request('https://example.test',{method:'POST',body:'{}',headers:{'content-length':String(13*1024*1024)}})
 await assert.rejects(businessAppCore.readWhatsAppWebhookBody(body),/too large/)
 await assert.rejects(businessAppCore.readWhatsAppWebhookBody(new Request('https://example.test',{method:'POST',body:'x'.repeat(12*1024*1024+1)})),/too large/)
 const raw=JSON.stringify({message:'Fictional café customer ☀️'})
 assert.equal(await businessAppCore.readWhatsAppWebhookBody(new Request('https://example.test',{method:'POST',body:raw})),raw)
})

test('API sends, phone-app echoes and outbound history share one message identity and retain the actual staff author',async()=>{
 const db=await appFixture()
 try{
  const inbound=appMessage('wamid.api-context')
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('messages',{messages:[inbound]}))
  const conversationId=(await db.query('select id from whatsapp_inbox_conversations')).rows[0].id
  const handler=messagingHandler(db,agentA,{now:()=>new Date(),graph:async()=>({messages:[{id:'wamid.same-outbound'}]})})
  await sendMessage(handler,conversationId,id(710),{message:'API original'})
  const historical=appMessage('wamid.same-outbound',{from:businessPhone,history_context:{status:'READ'},text:{body:'History copy'}})
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{history:[{metadata:{progress:100},threads:[{id:customerPhone,messages:[historical]}]}]}));await drainApp(db)
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('smb_message_echoes',{message_echoes:[{...historical,to:customerPhone,history_context:{status:'SENT'}}]}));await drainApp(db)
  const rows=(await db.query("select * from whatsapp_inbox_messages where direction='outbound'")).rows
  assert.equal(rows.length,1);assert.equal(rows[0].created_by,agentA);assert.equal(rows[0].message_origin,'cloud_api');assert.equal(rows[0].body_text,'API original');assert.equal(rows[0].delivery_status,'read')
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{history:[{metadata:{progress:20}}]}));await drainApp(db)
  assert.equal((await appStatus(db)).progress,100)
 }finally{await db.close()}
})

test('new onboarding generations cancel old queued history and stale or malformed account events cannot disconnect a verified connection',async()=>{
 const db=await appFixture()
 try{
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('smb_message_echoes',{message_echoes:[appMessage('wamid.stale-session',{from:businessPhone,to:customerPhone})]}))
  await db.query('update organisation_communication_channels set business_app_session=$2,business_app_connected_at=now() where id=$1',[sender,id(601)])
  const old=appPayload('account_update',{event:'ACCOUNT_OFFBOARDED'});old.entry[0].time=Math.floor(Date.now()/1000)-7200
  await applyWhatsAppInboxWebhook(sqlClient(db),old)
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('account_update',{event:'PARTNER_REMOVED',phone_number:'invalid number'}))
  assert.equal((await db.query('select connection_status from organisation_communication_channels where id=$1',[sender])).rows[0].connection_status,'connected')
  await drainApp(db)
  assert.equal((await db.query('select status from whatsapp_business_app_events')).rows[0].status,'cancelled')
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_messages')).rows[0].n,0)
  await assert.rejects(db.query('select whatsapp_business_app_claim_request($1,$2,$3,$4,$5,$6)',[org,agentA,sender,2,'history',id(600)]),/Refresh/)
 }finally{await db.close()}
})

test('a caption edit before its media asset preserves the edit and can hydrate the later file without restoring deleted content',async()=>{
 const db=await appFixture()
 try{
  const timestamp=epoch(new Date(Date.now()-86400000).toISOString()),original='wamid.edited-media'
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{history:[{threads:[{id:customerPhone,messages:[appMessage(original,{type:'media_placeholder',timestamp})]}]}]}));await drainApp(db)
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('messages',{messages:[appMessage('wamid.caption-edit',{type:'edit',edit:{original_message_id:original,message:{type:'image',image:{caption:'Corrected caption'}}}})]}));await drainApp(db)
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{messages:[appMessage(original,{type:'image',timestamp,image:{id:'900',mime_type:'image/jpeg',caption:'Old caption'}})]}));await drainApp(db)
  const row=(await db.query('select * from whatsapp_inbox_messages')).rows[0]
  assert.equal(row.message_type,'image');assert.equal(row.body_text,'Corrected caption');assert.equal(row.media_json.id,'900');assert.ok(row.edited_at)
 }finally{await db.close()}
})

test('old media arriving on the normal message route retains history provenance and never opens a reply window',async()=>{
 const db=await appFixture()
 try{
  const timestamp=epoch(new Date(Date.now()-86400000).toISOString()),mid='wamid.normal-history-media'
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('history',{history:[{threads:[{id:customerPhone,messages:[{id:mid,from:customerPhone,timestamp,type:'media_placeholder'}]}]}]}));await drainApp(db)
  await applyWhatsAppInboxWebhook(sqlClient(db),appPayload('messages',{messages:[{id:mid,from:customerPhone,timestamp,type:'image',image:{id:'900',caption:'Historical photo',mime_type:'image/jpeg'}}]}))
  const row=(await db.query('select * from whatsapp_inbox_messages')).rows[0]
  assert.equal(row.message_origin,'history');assert.equal(row.media_json.id,'900');assert.equal(row.body_text,'Historical photo')
  const conversation=(await db.query('select * from whatsapp_inbox_conversations')).rows[0]
  assert.equal(conversation.unread_count,0);assert.equal(conversation.last_inbound_at,null)
 }finally{await db.close()}
})

// Stage 4 exercises the actual migration, triggers and worker in PostgreSQL.
const autoTemplate={id:'900',name:'lead_ack',language:'en_US',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Hello {{1}}, thanks for your enquiry.'}]}
const autoConfig=(extra={})=>({name:'Buyer acknowledgement',kind:'buyer',trigger:'new_lead',action:'message',stage:'',delayMinutes:0,startMinute:0,endMinute:1440,days:[1,2,3,4,5,6,7],timezone:'Africa/Johannesburg',assignAgentId:agentA,senderId:sender,template:autoTemplate,values:{'body.1':{source:'first_name'}},taskTitle:'',...extra})
async function autoFixture(){
 const db=await crmFixture()
 await db.exec(`alter table leads add column stage text default 'New Lead',add column status text default 'open',add column lead_domain text default 'agency',add column created_at timestamptz default now(),add column ownership_status text,add column assigned_at timestamptz;
 alter table recruitment_leads add column status text default 'new',add column details_json jsonb default '{}',add column created_at timestamptz default now();
 create table tasks(task_id uuid primary key default gen_random_uuid(),organisation_id uuid,lead_id uuid,assigned_agent_id uuid,created_by uuid,title text,description text,due_date date,status text,priority text,metadata jsonb);
 alter table tasks enable row level security;grant select on tasks to authenticated;create policy task_org on tasks for select to authenticated using(organisation_id=current_setting('test.org')::uuid);`)
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261018131742_whatsapp_crm_automations.sql',import.meta.url),'utf8'))
 return db
}
const autoHandler=(db,extra={})=>staffHandler(db,user,{now:()=>new Date(),graph:async()=>({data:[autoTemplate]}),...extra})
async function autoRule(db,extra={},enable=true){
 const handler=autoHandler(db),{rule}=await request(handler,'automation_save',{rule:autoConfig(extra)})
 return enable?(await request(handler,'automation_enable',{ruleId:rule.id,version:rule.version,confirmed:true})).rule:rule
}
async function autoLead(db,n=900,extra={}){
 const row={lead_id:id(n),organisation_id:org,contact_id:id(40),lead_category:'buyer',...extra},columns=Object.keys(row)
 await db.query(`insert into leads(${columns.join(',')}) values(${columns.map((_,i)=>`$${i+1}`).join(',')})`,Object.values(row))
 return row.lead_id
}
async function autoPermission(db){
 const conversation=(await receive(db,'auto-inbound',new Date(Date.now()-3600000).toISOString())).rows[0].id
 await db.query('update whatsapp_inbox_conversations set assigned_user_id=$1 where id=$2',[agentA,conversation])
 await db.query("insert into whatsapp_inbox_permissions(conversation_id,organisation_id,status,source,consent_at,recorded_by) values($1,$2,'opted_in','Signed WhatsApp agreement',now()-interval '1 day',$3)",[conversation,org,user])
 return conversation
}
async function autoWorker(db,meta=async(_sender,path)=>path.includes('message_templates')?{data:[autoTemplate]}:{messages:[{id:`wamid.auto.${crypto.randomUUID()}`}]} ,limit=10){
 const {createAutomationWorker}=await import('../../supabase/functions/whatsapp-automation-worker/worker.js')
 return createAutomationWorker({db:sqlClient(db),meta,limit})()
}
const autoRuns=async db=>(await db.query('select * from whatsapp_automation_runs order by created_at,id')).rows

test('automation rules start disabled, affect future events only, and require current management access',async()=>{
 const db=await autoFixture()
 try{
  const disabled=await autoRule(db,{},false)
  assert.equal(disabled.enabled,false)
  await autoLead(db)
  assert.equal((await autoRuns(db)).length,0)
  await request(autoHandler(db),'automation_enable',{ruleId:disabled.id,version:disabled.version,confirmed:true})
  assert.equal((await autoRuns(db)).length,0)
  await autoLead(db,901)
  assert.equal((await autoRuns(db)).length,1)
  assert.equal((await db.query('select assigned_agent_id from leads where lead_id=$1',[id(901)])).rows[0].assigned_agent_id,agentA)
  await autoLead(db,902,{assigned_agent_id:agentB,assigned_user_id:agentB})
  assert.equal((await db.query('select assigned_agent_id from leads where lead_id=$1',[id(902)])).rows[0].assigned_agent_id,agentB)
  await autoLead(db,903,{raw_enquiry_payload:{arch9_meta:{ingestion_source:'historical'}}})
  assert.equal((await autoRuns(db)).length,2)
  await assert.rejects(request(staffHandler(db,agentA),'automation_list'),/management/)
  await assert.rejects(request(autoHandler(db),'automation_save',{ruleId:disabled.id,version:disabled.version,rule:autoConfig()}),/changed/)
  await assert.rejects(request(autoHandler(db),'automation_enable',{ruleId:disabled.id,version:2}),/Confirm/)
  await assert.rejects(request(autoHandler(db),'automation_save',{rule:autoConfig({senderId:foreign})}),/not found/)
 }finally{await db.close()}
})

test('new lead automation sends a personalized approved template once and links its receipt to CRM',async()=>{
 const db=await autoFixture()
 try{
  const thread=await autoPermission(db)
  await autoRule(db)
  const lead=await autoLead(db)
  let sends=0
  const meta=async(_sender,path,payload)=>{if(path.includes('message_templates'))return {data:[autoTemplate]};sends++;assert.equal(payload.to,'27821234567');assert.equal(payload.template.components[0].parameters[0].text,'Buyer');return {messages:[{id:'wamid.automation'}]}}
  await Promise.all([autoWorker(db,meta),autoWorker(db,meta)])
  await autoWorker(db,meta)
  assert.equal(sends,1)
  const [job]=await autoRuns(db);assert.equal(job.status,'sent')
  const message=(await db.query('select * from whatsapp_inbox_messages where automation_run_id=$1',[job.id])).rows[0]
  assert.equal(message.delivery_status,'sent');assert.equal(message.conversation_id,thread)
  assert.match((await db.query('select last_message_preview from whatsapp_inbox_conversations where id=$1',[thread])).rows[0].last_message_preview,/Hello Buyer/ )
  assert.equal((await db.query('select lead_id from whatsapp_inbox_crm_links where conversation_id=$1',[thread])).rows[0].lead_id,lead)
 }finally{await db.close()}
})

test('automatic messages skip absent consent; sending hours respect DST and weekends',async()=>{
 const db=await autoFixture()
 try{
  await autoRule(db)
  await autoLead(db)
  await autoWorker(db,async()=>{throw Error('No provider call expected')})
  assert.match((await autoRuns(db))[0].reason,/permission/)
  const config=autoConfig({timezone:'America/New_York',days:[1,2,3,4,5],startMinute:540,endMinute:1020})
  const at=async stamp=>new Date((await db.query('select private.whatsapp_automation_time($1,$2) at',[config,stamp])).rows[0].at).toISOString()
  assert.equal(await at('2026-10-30T21:00:00Z'),'2026-11-02T14:00:00.000Z')
  assert.equal(await at('2026-11-02T14:00:00Z'),'2026-11-02T14:00:00.000Z')
  assert.equal(await at('2026-11-02T22:00:00Z'),'2026-11-03T14:00:00.000Z')
 }finally{await db.close()}
})

test('automation follow-ups anchor to a sent message, ignore imported history and never chain themselves',async()=>{
 const db=await autoFixture()
 try{
  const thread=await autoPermission(db)
  await autoRule(db)
  await autoRule(db,{name:'One follow-up',trigger:'no_response',delayMinutes:60,assignAgentId:null})
  await autoLead(db)
  await autoWorker(db,undefined,1)
  let jobs=await autoRuns(db)
  assert.equal(jobs.length,2);assert.equal(jobs.filter(job=>job.status==='queued').length,1)
  const followup=jobs.find(job=>job.status==='queued')
  assert.ok(followup.anchor_message_id)
  await db.query("insert into whatsapp_inbox_messages(organisation_id,conversation_id,channel_id,direction,message_type,body_text,event_at,message_origin,live_received,delivery_status) values($1,$2,$3,'inbound','text','Old history',now(),'history',false,'received')",[org,thread,sender])
  assert.equal((await autoRuns(db)).find(job=>job.id===followup.id).status,'queued')
  await db.query("update whatsapp_automation_runs set due_at=now() where id=$1",[followup.id])
  await autoWorker(db)
  jobs=await autoRuns(db);assert.equal(jobs.length,2);assert.ok(jobs.every(job=>job.status==='sent'))
  await db.query("insert into whatsapp_inbox_messages(organisation_id,conversation_id,channel_id,direction,message_type,body_text,delivery_status,event_at,created_by) values($1,$2,$3,'outbound','text','Another manual message','sent',now(),$4)",[org,thread,sender,user])
  assert.equal((await autoRuns(db)).length,2)
 }finally{await db.close()}
})

test('pending automation stops on replies, opt-outs, stage changes, phone changes, reassignment and rule edits',async()=>{
 const db=await autoFixture()
 try{
  const thread=await autoPermission(db),rule=await autoRule(db,{delayMinutes:60})
  await autoLead(db,910)
  await receive(db,'auto-live-reply',new Date(Date.now()+1000).toISOString())
  assert.match((await autoRuns(db))[0].reason,/replied/)
  await autoLead(db,911)
  await db.query("update whatsapp_inbox_permissions set status='opted_out',opted_out_at=now() where conversation_id=$1",[thread])
  assert.match((await autoRuns(db)).find(job=>job.record_id===id(911)).reason,/opted out/)
  await autoLead(db,912)
  await db.query("update leads set stage='Contacted' where lead_id=$1",[id(912)])
  await db.query("update leads set stage='New Lead' where lead_id=$1",[id(912)])
  assert.equal((await autoRuns(db)).find(job=>job.record_id===id(912)).status,'skipped')
  await autoLead(db,913)
  await db.query("update contacts set phone='+27829999999' where contact_id=$1",[id(40)])
  assert.equal((await autoRuns(db)).find(job=>job.record_id===id(913)).status,'skipped')
  await db.query("update contacts set phone='27821234567' where contact_id=$1",[id(40)])
  await autoLead(db,914)
  await db.query('update whatsapp_inbox_conversations set assigned_user_id=$1 where id=$2',[agentB,thread])
  assert.match((await autoRuns(db)).find(job=>job.record_id===id(914)).reason,/assignment/)
  await autoLead(db,915)
  await request(autoHandler(db),'automation_disable',{ruleId:rule.id,version:rule.version})
  assert.match((await autoRuns(db)).find(job=>job.record_id===id(915)).reason,/switched off/)
 }finally{await db.close()}
})

test('automation rechecks consent after Meta template lookup and never retries an uncertain provider attempt',async()=>{
 const db=await autoFixture()
 try{
  const thread=await autoPermission(db)
  await autoRule(db)
  await autoLead(db,920)
  let sends=0
  await autoWorker(db,async(_sender,path)=>{
   if(path.includes('message_templates')){await receive(db,'reply-during-template-lookup',new Date(Date.now()+1000).toISOString());return {data:[autoTemplate]}}
   sends++;return {messages:[{id:'must-not-send'}]}
  })
  assert.equal(sends,0);assert.equal((await autoRuns(db))[0].status,'skipped')
  // A different number isolates the next event from the earlier reply.
  await db.query("update contacts set phone='27829999999' where contact_id=$1",[id(40)])
  const newThread=(await db.query("insert into whatsapp_inbox_conversations(organisation_id,channel_id,contact_phone,assigned_user_id) values($1,$2,'27829999999',$3) returning id",[org,sender,agentA])).rows[0].id
  await db.query("insert into whatsapp_inbox_permissions(conversation_id,organisation_id,status,source,consent_at,recorded_by) select $1,organisation_id,'opted_in',source,consent_at,recorded_by from whatsapp_inbox_permissions where conversation_id=$2",[newThread,thread])
  await db.query('update whatsapp_inbox_conversations set assigned_user_id=$1 where id=$2',[agentA,newThread])
  await autoLead(db,921)
  const uncertain=async(_sender,path)=>{if(path.includes('message_templates'))return {data:[autoTemplate]};sends++;throw Error('Lost response with secret token')}
  await autoWorker(db,uncertain);await autoWorker(db,uncertain)
  assert.equal(sends,1)
  let job=(await autoRuns(db)).find(row=>row.record_id===id(921));assert.equal(job.status,'unknown');assert.ok(!JSON.stringify(job).includes('secret token'))
  await db.query("select whatsapp_inbox_status('100','200','wamid.late',$1,'delivered',now(),null)",[`arch9-inbox:${job.message_id}`])
  job=(await autoRuns(db)).find(row=>row.id===job.id);assert.equal(job.status,'sent')
 }finally{await db.close()}
})

test('stage-change tasks are durable and recruitment stays restricted to its managers',async()=>{
 const db=await autoFixture()
 try{
  await autoRule(db,{name:'Seller stage task',kind:'seller',trigger:'stage_changed',stage:'contacted',action:'task',assignAgentId:null,taskTitle:'Call seller'})
  const lead=await autoLead(db,930,{lead_category:'seller',assigned_agent_id:agentA,assigned_user_id:agentA})
  await db.query("update leads set stage='Contacted' where lead_id=$1",[lead])
  await autoWorker(db,async()=>{throw Error('Tasks never call Meta')});await autoWorker(db)
  let tasks=(await db.query('select * from tasks')).rows;assert.equal(tasks.length,1);assert.equal(tasks[0].lead_id,lead);assert.equal(tasks[0].assigned_agent_id,agentA)
  await autoRule(db,{kind:'recruitment',trigger:'stage_changed',stage:'interview',action:'task',assignAgentId:null,taskTitle:'Arrange recruitment interview'})
  await db.query("update recruitment_leads set status='interview' where id=$1",[recruit])
  await autoWorker(db)
  tasks=(await db.query('select * from tasks')).rows;assert.equal(tasks.length,2);assert.equal(tasks.find(task=>!task.lead_id).metadata.recruitment_lead_id,recruit)
  await db.exec(`set role authenticated;set test.org='${org}';set test.actor='${agentA}';`)
  assert.equal((await db.query('select * from tasks')).rows.length,1)
  await assert.rejects(db.query('select * from whatsapp_automation_rules'),/permission/)
  await assert.rejects(db.query('select whatsapp_automation_next()'),/permission/)
  await db.exec('reset role')
  const acl=(await db.query("select bool_and(relrowsecurity) secured from pg_class where relname in ('whatsapp_automation_rules','whatsapp_automation_subjects','whatsapp_automation_runs')")).rows[0]
  assert.equal(acl.secured,true)
  await db.exec(`set role service_role;`)
  const listed=await sqlClient(db).rpc('whatsapp_automation_rules_request',{p_org:org,p_actor:user,p_action:'list'})
  assert.equal(listed.error,null);assert.equal(listed.data.rules.length,2)
  await db.exec('reset role')
 }finally{await db.close()}
})

test('automation leases recover before sending, while ownership, membership and template drift block dispatch',async()=>{
 const db=await autoFixture()
 try{
  await autoPermission(db);await autoRule(db);await autoLead(db,940)
  const first=(await db.query('select whatsapp_automation_next() job')).rows[0].job
  assert.equal((await db.query('select whatsapp_automation_next() job')).rows[0].job,null)
  await db.query("update whatsapp_automation_runs set lease_until=now()-interval '1 second' where id=$1",[first.id])
  const second=(await db.query('select whatsapp_automation_next() job')).rows[0].job
  assert.notEqual(first.lease_token,second.lease_token)
  assert.equal((await db.query('select whatsapp_automation_prepare($1,$2) result',[first.id,first.lease_token])).rows[0].result.ready,false)
  await db.query('update organisation_communication_channels set owner_user_id=$1 where id=$2',[agentB,sender])
  await db.query('select whatsapp_automation_prepare($1,$2)',[second.id,second.lease_token])
  assert.match((await autoRuns(db))[0].reason,/ownership|assignment/)
  await autoRule(db,{name:'Different stage task',trigger:'stage_changed',stage:'qualified',action:'task',assignAgentId:null,taskTitle:'Call buyer'})
  await db.query("update leads set stage='Qualified' where lead_id=$1",[id(940)])
  await db.query("update organisation_users set status='inactive' where user_id=$1",[user])
  await autoWorker(db)
  assert.match((await autoRuns(db)).find(job=>job.record_id===id(940)&&job.id!==first.id).reason,/management/)
  // Inactive rule owners cannot break ordinary lead capture or assign a new lead.
  await autoLead(db,941)
  assert.equal((await db.query('select assigned_user_id from leads where lead_id=$1',[id(941)])).rows[0].assigned_user_id,null)
 }finally{await db.close()}
})

test('automatic agency acknowledgements preserve an agency queue and current service-role SQL privileges',async()=>{
 const db=await autoFixture()
 try{
  const thread=await autoPermission(db)
  await db.query('update whatsapp_inbox_conversations set assigned_user_id=null where id=$1',[thread])
  await db.query('update contacts set assigned_agent_id=null where contact_id=$1',[id(40)])
  await autoRule(db);await autoLead(db,950)
  assert.equal((await db.query('select assigned_agent_id from contacts where contact_id=$1',[id(40)])).rows[0].assigned_agent_id,agentA)
  await db.exec('set role service_role')
  await autoWorker(db)
  assert.equal((await autoRuns(db))[0].status,'sent')
  assert.equal((await db.query('select assigned_user_id from whatsapp_inbox_conversations where id=$1',[thread])).rows[0].assigned_user_id,null)
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_crm_link_events')).rows[0].n,1)
  await db.exec('reset role')
  const exposed=(await db.query("select n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (p.proname like 'whatsapp_automation_%' or p.proname='run_whatsapp_automation_worker') and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'))")).rows
  assert.deepEqual(exposed,[])
 }finally{await db.close()}
})

test('automation rejects template drift and recovers a crashed provider claim without a second send',async()=>{
 const db=await autoFixture()
 try{
  await autoPermission(db);await autoRule(db);await autoLead(db,960)
  let sends=0
  await autoWorker(db,async(_sender,path)=>{if(path.includes('message_templates'))return {data:[{...autoTemplate,status:'PAUSED'}]};sends++;return {messages:[{id:'no'}]}})
  assert.equal(sends,0);assert.equal((await autoRuns(db))[0].status,'failed')
  await autoLead(db,961)
  const claimed=(await db.query('select whatsapp_automation_next() job')).rows[0].job
  await db.query('select whatsapp_automation_prepare($1,$2,true,$3,$4)',[claimed.id,claimed.lease_token,'Hello Buyer',autoTemplate])
  await db.query("update whatsapp_automation_runs set lease_until=now()-interval '1 second' where id=$1",[claimed.id])
  await autoWorker(db,async()=>{sends++;throw Error('Must not reach Meta')})
  assert.equal(sends,0)
  const job=(await autoRuns(db)).find(row=>row.id===claimed.id)
  assert.equal(job.status,'unknown')
  assert.equal((await db.query('select delivery_status from whatsapp_inbox_messages where id=$1',[job.id])).rows[0].delivery_status,'unknown')
 }finally{await db.close()}
})

test('automation hours defer real queued work, expired actions stop and overlapping enabled rules are rejected',async()=>{
 const db=await autoFixture()
 try{
  const today=Number((await db.query('select extract(isodow from now())::integer dow')).rows[0].dow)
  await autoRule(db,{action:'task',taskTitle:'Call buyer',days:[today===7?1:today+1]})
  await autoLead(db,970)
  await autoWorker(db,async()=>{throw Error('No Meta calls for deferred tasks')})
  let job=(await autoRuns(db))[0]
  assert.equal(job.status,'queued');assert.match(job.reason,/hours/);assert.ok(new Date(job.due_at)>new Date())
  assert.equal((await db.query('select count(*)::int n from tasks')).rows[0].n,0)
  const duplicate=await autoRule(db,{action:'task',taskTitle:'Another buyer task'},false)
  await assert.rejects(request(autoHandler(db),'automation_enable',{ruleId:duplicate.id,version:duplicate.version,confirmed:true}),/existing rule/)
  await db.query("update whatsapp_automation_runs set due_at=now(),expires_at=now()-interval '1 second' where id=$1",[job.id])
  await autoWorker(db);job=(await autoRuns(db))[0]
  assert.equal(job.status,'skipped');assert.match(job.reason,/expired/)
  // An administrator from one agency cannot list or change another agency's rules.
  const wrong=await sqlClient(db).rpc('whatsapp_automation_rules_request',{p_org:other,p_actor:user,p_action:'list'})
  assert.ok(wrong.error)
 }finally{await db.close()}
})

test('automation cancellation cannot obstruct CRM deletion or a category moving out of scope',async()=>{
 const db=await autoFixture()
 try{
  await autoRule(db,{action:'task',taskTitle:'Call buyer',delayMinutes:60})
  await autoLead(db,980)
  await db.query("update leads set lead_category='landlord' where lead_id=$1",[id(980)])
  assert.match((await autoRuns(db))[0].reason,/category/)
  await autoLead(db,981)
  await db.query('delete from leads where lead_id=$1',[id(981)])
  assert.match((await autoRuns(db)).find(job=>job.record_id===id(981)).reason,/deleted/)
 }finally{await db.close()}
})

test('delayed signed delivery confirmation can start a follow-up, while pre-enable sends cannot backfill it',async()=>{
 const db=await autoFixture()
 try{
  const thread=await autoPermission(db)
  const rule=await autoRule(db,{trigger:'no_response',delayMinutes:60,assignAgentId:null})
  await db.query("update whatsapp_automation_rules set enabled_at=now()-interval '1 day' where id=$1",[rule.id])
  await db.query('insert into whatsapp_inbox_crm_links(conversation_id,organisation_id,lead_id,linked_by) values($1,$2,$3,$4)',[thread,org,buyerA,user])
  for(const [n,age] of [[990,'10 minutes'],[991,'2 days']]){
   await db.query("insert into whatsapp_inbox_messages(id,organisation_id,conversation_id,channel_id,direction,message_type,body_text,delivery_status,event_at,created_by) values($1,$2,$3,$4,'outbound','text','Manual follow-up','unknown',now()-$5::interval,$6)",[id(n),org,thread,sender,age,user])
   await db.query("update whatsapp_inbox_messages set delivery_status='delivered' where id=$1",[id(n)])
  }
  const runs=await autoRuns(db)
  assert.equal(runs.length,1);assert.equal(runs[0].anchor_message_id,id(990))
 }finally{await db.close()}
})

test('direct automation permission can be renewed without re-subscribing to bulk campaigns',async()=>{
 const db=await autoFixture()
 try{
  const thread=await autoPermission(db)
  await autoRule(db,{trigger:'stage_changed',stage:'contacted',assignAgentId:null})
  await db.query("insert into whatsapp_marketing_contacts(organisation_id,full_name,phone,consent_status,opted_out_at) values($1,'Buyer Seller','27821234567','opted_out',now()-interval '10 minutes')",[org])
  await db.query("update leads set stage='Contacted' where lead_id=$1",[buyerA])
  await autoWorker(db,async()=>{throw Error('Old direct permission must not send')})
  assert.match((await autoRuns(db))[0].reason,/permission/)
  await db.query("update whatsapp_inbox_permissions set consent_at=now()-interval '5 minutes',source='New explicit one-to-one agreement' where conversation_id=$1",[thread])
  await db.query("update leads set stage='New Lead' where lead_id=$1",[buyerA])
  await db.query("update leads set stage='Contacted' where lead_id=$1",[buyerA])
  await autoWorker(db)
  assert.equal((await autoRuns(db)).filter(job=>job.status==='sent').length,1)
  assert.equal((await db.query("select consent_status from whatsapp_marketing_contacts where organisation_id=$1",[org])).rows[0].consent_status,'opted_out')
 }finally{await db.close()}
})

// Stage 5 uses the real campaign queue, CRM scope and routed Meta ingestion.
async function audienceFixture(){
 const db=await autoFixture()
 await db.exec(`drop table whatsapp_campaign_jobs;alter table contacts alter column contact_id set default gen_random_uuid();
 alter table contacts add column email text,add column contact_type text,add column notes text,add column updated_at timestamptz default now();
 alter table leads alter column lead_id set default gen_random_uuid();
 alter table leads add column branch_id uuid,add column lead_type text,add column lead_direction text,add column source_channel text,add column priority text,add column sla_due_at timestamptz,add column source_reference_id text,add column source_received_at timestamptz,add column notes text,add column acknowledgement_status text;
 alter table recruitment_leads alter column id set default gen_random_uuid();
 alter table recruitment_leads add column email text,add column area text default '',add column meta_leadgen_id text unique,add column meta_source_json jsonb default '{}',add column intake_channel text;
 create table organisation_branches(id uuid primary key,organisation_id uuid);
 create table meta_lead_ads_forms(id uuid primary key default gen_random_uuid(),organisation_id uuid,connection_id uuid,page_id text,form_id text,form_name text,lead_type text,is_active boolean,branch_id uuid,assigned_agent_id uuid);
 create table meta_lead_ads_imports(id uuid primary key,organisation_id uuid,connection_id uuid,form_mapping_id uuid,status text);
 create table lead_requirements(requirement_id uuid primary key default gen_random_uuid(),organisation_id uuid,lead_id uuid,areas text[],suburbs text[],city text,status text default 'active');
 create table lead_activities(organisation_id uuid,lead_id uuid,agent_id uuid,activity_type text,activity_note text,activity_date timestamptz,outcome text);`)
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261018082522_whatsapp_campaign_background_delivery.sql',import.meta.url),'utf8'))
 const ingestion=readFileSync(new URL('../../supabase/migrations/20261018092935_meta_lead_ads_recruitment_routing.sql',import.meta.url),'utf8')
 for(const signature of ['create or replace function public.meta_ingest_lead_ad(','create function public.meta_ingest_lead_ad_routed(']){
  const start=ingestion.indexOf(signature),end=ingestion.indexOf('$$;',start)+3
  await db.exec(ingestion.slice(start,end))
 }
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261018133534_whatsapp_campaign_audiences_and_routing.sql',import.meta.url),'utf8'))
 await db.query("insert into meta_lead_ads_forms values($1,$2,$3,'300','400','Property enquiry','buyer',true,null,null)",[id(1100),org,connection])
 await db.query("insert into lead_requirements(organisation_id,lead_id,areas,status) values($1,$2,array['Claremont'],'active'),($1,$3,array['Durban'],'active')",[org,buyerA,buyerB])
 await db.query("insert into whatsapp_marketing_contacts(id,organisation_id,full_name,phone,consent_status,consent_source,consent_at) values($1,$2,'Buyer Seller','27821234567','opted_in','Campaign agreement',now()-interval '1 day')",[id(1101),org])
 return db
}
const audienceFilters=(extra={})=>({kind:'buyer',areas:['claremont'],stages:[],agentId:null,includeClosed:false,...extra})
async function savedAudience(db,filters=audienceFilters()){
 return (await request(autoHandler(db),'audience_save',{audience:{name:'Claremont buyers',filters}})).audience
}
const audiencePreview=(db,filters=audienceFilters(),extra={})=>request(autoHandler(db),'audience_preview',{filters,...extra})
const planFor=(a,rows,extra={})=>({audienceId:a.id,version:a.version,mode:'record_owner',agentId:null,targets:rows.map(row=>({contactId:row.contact_id,recordId:row.record_id,kind:row.kind,state:row.state})),...extra})
async function savedAudienceCampaign(db,a,rows,extra={}){
 const fields={name:'Claremont campaign',sender_id:sender,template:autoTemplate,parameter_values:{'body.1':{source:'first_name'}},contact_ids:rows.map(row=>row.contact_id),scheduled_at:null,...extra}
 const result=await sqlClient(db).rpc('whatsapp_campaign_plan_request',{p_org:org,p_actor:user,p_action:'save',p_id:id(1110),p_fields:fields,p_plan:planFor(a,rows)})
 if(result.error)throw result.error
 return result.data.campaign
}

test('saved WhatsApp audiences preview current CRM areas without creating or assuming campaign consent',async()=>{
 const db=await audienceFixture()
 try{
  const a=await savedAudience(db),preview=await audiencePreview(db)
  assert.equal(a.filters.kind,'buyer');assert.equal(preview.matched,1);assert.equal(preview.eligiblePhones,1)
  assert.equal(preview.rows[0].record_id,buyerA);assert.equal(preview.rows[0].owner_id,agentA)
  assert.deepEqual(preview.rows[0].state,(await db.query('select private.whatsapp_automation_snapshot($1,$2) state',['buyer',buyerA])).rows[0].state)
  await db.query("update whatsapp_marketing_contacts set consent_status='opted_out',opted_out_at=now()")
  assert.equal((await audiencePreview(db)).eligiblePhones,0)
  assert.equal((await db.query('select count(*)::int n from whatsapp_marketing_contacts')).rows[0].n,1)
  await assert.rejects(request(staffHandler(db,agentA),'audience_list'),/management/)
 }finally{await db.close()}
})

test('audience campaign snapshots save atomically and stale CRM or audience changes block preparation',async()=>{
 const db=await audienceFixture()
 try{
  const a=await savedAudience(db),preview=await audiencePreview(db)
  const campaign=await savedAudienceCampaign(db,a,preview.rows)
  assert.equal(campaign.audience_plan.targets[0].recordId,buyerA)
  const same=await savedAudienceCampaign(db,a,preview.rows);assert.equal(same.id,campaign.id)
  await db.query("update leads set stage='Qualified' where lead_id=$1",[buyerA])
  const validation=await sqlClient(db).rpc('whatsapp_campaign_plan_request',{p_org:org,p_actor:user,p_action:'validate',p_id:campaign.id})
  assert.match(validation.error.message,/changed/)
  const payload=[{contact_id:id(1101),payload:{to:'27821234567'}}]
  await assert.rejects(db.query('select whatsapp_campaign_prepare($1,$2,1,$3,$4)',[campaign.id,org,autoTemplate,payload]),/changed/)
  assert.equal((await db.query('select count(*)::int n from whatsapp_campaign_recipients')).rows[0].n,0)
 }finally{await db.close()}
})

async function queuedAudienceCampaign(db,a,rows){
 const campaign=await savedAudienceCampaign(db,a,rows)
 await db.query('select whatsapp_campaign_enqueue($1,$2,$3,$4,$5)',[campaign.id,org,campaign.revision,autoTemplate,rows.map(row=>({contact_id:row.contact_id,payload:{messaging_product:'whatsapp',to:row.phone,type:'template',template:{name:autoTemplate.name,language:{code:'en_US'}}}}))])
 return campaign
}
async function claimedAudienceRecipient(db){
 const lease=(await db.query('select * from whatsapp_campaign_jobs_claim(1)')).rows[0]
 const recipient=(await db.query('select * from whatsapp_campaign_recipients order by id limit 1')).rows[0]
 const rows=(await db.query('select * from whatsapp_campaign_claim($1,$2,$3)',[recipient.id,org,lease.lease_token])).rows
 return {lease,recipient:rows[0],rows}
}

test('CRM target checks run again on the final bulk claim and a changed target never reaches Meta',async()=>{
 const db=await audienceFixture()
 try{
  const a=await savedAudience(db),preview=await audiencePreview(db)
  await queuedAudienceCampaign(db,a,preview.rows)
  await db.query("update lead_requirements set areas=array['Durban'] where lead_id=$1",[buyerA])
  const claimed=await claimedAudienceRecipient(db)
  assert.equal(claimed.rows.length,0)
  const recipient=(await db.query('select * from whatsapp_campaign_recipients')).rows[0]
  assert.equal(recipient.status,'skipped');assert.match(recipient.error_message,/CRM recipient|changed/)
  assert.equal((await db.query('select count(*)::int n from whatsapp_campaign_audience_plans')).rows[0].n,1)
 }finally{await db.close()}
})

test('exact campaign replies link the reviewed CRM record and its agent once, including callbacks arriving late',async()=>{
 const db=await audienceFixture()
 try{
  const a=await savedAudience(db),preview=await audiencePreview(db)
  await queuedAudienceCampaign(db,a,preview.rows)
  const {recipient}=await claimedAudienceRecipient(db)
  assert.ok(recipient.crm_route_snapshot.target)
  const thread=(await receive(db,'campaign-before-status',new Date().toISOString())).rows[0].id
  await db.query("select whatsapp_inbox_campaign_reply('100','200','27821234567','campaign-before-status','wamid.campaign-late')")
  assert.equal((await db.query('select count(*)::int n from whatsapp_campaign_reply_routes')).rows[0].n,0)
  await db.query("select whatsapp_campaign_status('wamid.campaign-late',$1,'100','200','delivered',now(),null)",[`arch9-wa:${recipient.id}`])
  await db.query("select whatsapp_campaign_status('wamid.campaign-late',$1,'100','200','read',now(),null)",[`arch9-wa:${recipient.id}`])
  assert.equal((await db.query('select count(*)::int n from whatsapp_campaign_reply_routes')).rows[0].n,1)
  assert.equal((await db.query('select assigned_user_id from whatsapp_inbox_conversations where id=$1',[thread])).rows[0].assigned_user_id,agentA)
  assert.equal((await db.query('select lead_id from whatsapp_inbox_crm_links where conversation_id=$1',[thread])).rows[0].lead_id,buyerA)
  const result=await request(staffHandler(db,agentA),'campaign_reply_status',{conversationId:thread})
  assert.equal(result.routes[0].status,'routed')
  await assert.rejects(request(staffHandler(db,agentB),'campaign_reply_status',{conversationId:thread}),/assignment|access|conversation/i)
 }finally{await db.close()}
})

test('campaign reply routing preserves manual handoffs and existing CRM links instead of guessing',async()=>{
 const db=await audienceFixture()
 try{
  const a=await savedAudience(db),preview=await audiencePreview(db)
  await queuedAudienceCampaign(db,a,preview.rows)
  const {recipient}=await claimedAudienceRecipient(db)
  await db.query("select whatsapp_campaign_status('wamid.manual',$1,'100','200','sent',now(),null)",[`arch9-wa:${recipient.id}`])
  const thread=(await receive(db,'manual-handoff-reply',new Date().toISOString())).rows[0].id
  await db.query('update whatsapp_inbox_conversations set assigned_user_id=$1 where id=$2',[agentB,thread])
  await db.query("select whatsapp_inbox_campaign_reply('100','200','27821234567','manual-handoff-reply','wamid.manual')")
  assert.equal((await db.query('select assigned_user_id from whatsapp_inbox_conversations where id=$1',[thread])).rows[0].assigned_user_id,agentB)
  assert.equal((await db.query('select status from whatsapp_campaign_reply_routes')).rows[0].status,'preserved')
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_crm_links')).rows[0].n,0)
  // A reply without Meta's exact context cannot attach itself by matching phone.
  await receive(db,'unattributed-reply',new Date().toISOString())
  assert.equal((await db.query('select count(*)::int n from whatsapp_campaign_reply_routes')).rows[0].n,1)
 }finally{await db.close()}
})

test('ambiguous audience phones require an explicit CRM record and one phone is queued only once',async()=>{
 const db=await audienceFixture()
 try{
  const duplicate=await autoLead(db,1120,{assigned_user_id:agentB,assigned_agent_id:agentB})
  await db.query("insert into lead_requirements(organisation_id,lead_id,areas) values($1,$2,array['Claremont'])",[org,duplicate])
  const a=await savedAudience(db),preview=await audiencePreview(db)
  assert.equal(preview.matched,2);assert.equal(preview.eligiblePhones,1);assert.ok(preview.rows.every(row=>row.phone_matches===2))
  await assert.rejects(savedAudienceCampaign(db,a,preview.rows),/once|distinct|phone/)
  await queuedAudienceCampaign(db,a,preview.rows.filter(row=>row.record_id===duplicate))
  const rows=(await db.query('select * from whatsapp_campaign_recipients')).rows
  assert.equal(rows.length,1);assert.equal(rows[0].crm_route_snapshot.target.recordId,duplicate)
 }finally{await db.close()}
})

const campaignRoute=(db,route,extra={})=>request(autoHandler(db),'meta_routes_save',{route:{formMappingId:id(1100),campaignId:'500',campaignName:'Seller campaign',leadType:'seller',agentId:agentB,branchId:null,...route},...extra})
async function metaIngest(db,leadgen,campaignId='500',extra={}){
 const result=await rpcRole(db,'service_role',user).rpc('meta_ingest_lead_ad_routed',{p_leadgen_id:leadgen,p_organisation_id:org,p_page_id:'300',p_form_id:'400',p_full_name:'Fictional Meta Enquiry',p_email:`${leadgen}@example.com`,p_phone:'27820007777',p_payload:{id:leadgen,form_id:'400',campaign_id:campaignId},p_ingestion_source:'live',p_meta_created_at:new Date().toISOString(),p_import_id:null,...extra})
 if(result.error)throw result.error;return result.data
}

test('exact Meta campaign IDs override form defaults for Buyer, Seller and Recruitment without reclassifying duplicates',async()=>{
 const db=await audienceFixture()
 try{
  const {route}=await campaignRoute(db)
  const seller=await metaIngest(db,'seller-override')
  assert.equal(seller.lead_type,'seller')
  const stored=(await db.query('select * from leads where lead_id=$1',[seller.crm_lead_id])).rows[0]
  assert.equal(stored.assigned_agent_id,agentB)
  const fallback=await metaIngest(db,'buyer-default','999');assert.equal(fallback.lead_type,'buyer')
  await campaignRoute(db,{leadType:'recruitment',agentId:null},{routeId:route.id,version:route.version})
  const recruitResult=await metaIngest(db,'recruitment-override');assert.equal(recruitResult.lead_type,'recruitment');assert.ok(recruitResult.recruitment_lead_id)
  const duplicate=await metaIngest(db,'seller-override');assert.equal(duplicate.crm_lead_id,seller.crm_lead_id);assert.equal(duplicate.lead_type,'seller')
  await db.query("insert into meta_lead_ads_imports values($1,$2,$3,$4,'ready')",[id(1121),org,connection,id(1100)])
  await assert.rejects(campaignRoute(db),/historical import/)
  await assert.rejects(metaIngest(db,'bad-historical','500',{p_ingestion_source:'historical'}),/import job/)
 }finally{await db.close()}
})

test('form routing saves all selections atomically, stops unchecked forms and rejects cross-agency agents',async()=>{
 const db=await audienceFixture()
 try{
  const call=forms=>sqlClient(db).rpc('meta_form_routes_save',{p_org:org,p_actor:user,p_connection:connection,p_forms:forms})
  const bad=await call([{id:'400',name:'Existing form',leadType:'seller',assignedAgentId:outsider,branchId:null}]);assert.ok(bad.error)
  assert.equal((await db.query('select lead_type from meta_lead_ads_forms')).rows[0].lead_type,'buyer')
  const saved=await call([{id:'400',name:'Existing form',leadType:'seller',assignedAgentId:agentA,branchId:null}]);assert.equal(saved.error,null)
  const stopped=await call([]);assert.equal(stopped.error,null)
  assert.equal((await db.query('select is_active from meta_lead_ads_forms')).rows[0].is_active,false)
  await assert.rejects(metaIngest(db,'disabled-form'),/not enabled/)
 }finally{await db.close()}
})

test('Recruitment audiences and prepared campaign CRM snapshots stay private under real browser roles',async()=>{
 const db=await audienceFixture()
 try{
  const a=await savedAudience(db,audienceFilters({kind:'recruitment',areas:[]})),preview=await audiencePreview(db,a.filters)
  assert.equal(preview.rows.length,1)
  await db.query("update recruitment_leads set status='agent_activated' where id=$1",[recruit]);assert.equal((await audiencePreview(db,a.filters)).matched,0)
  await db.query("update recruitment_leads set status='new' where id=$1",[recruit])
  await queuedAudienceCampaign(db,a,preview.rows)
  await db.exec(`set role authenticated;set test.org='${org}';set test.actor='${agentA}';`)
  assert.equal((await db.query('select id from whatsapp_campaigns')).rows.length,0)
  assert.equal((await db.query('select id,full_name from whatsapp_campaign_recipients')).rows.length,0)
  await assert.rejects(db.query('select crm_route_snapshot from whatsapp_campaign_recipients'),/permission/)
  for(const table of ['whatsapp_saved_audiences','whatsapp_campaign_audience_plans','whatsapp_campaign_reply_routes','meta_lead_ads_campaign_routes'])await assert.rejects(db.query(`select * from ${table}`),/permission/)
  await db.exec(`set test.actor='${user}';`)
  assert.equal((await db.query('select id from whatsapp_campaigns')).rows.length,1)
  await db.exec('reset role')
  const outsiderReply=await rpcRole(db,'service_role',agentA).rpc('whatsapp_audiences_request',{p_org:other,p_actor:agentA,p_action:'list'})
  assert.ok(outsiderReply.error)
  const acl=(await db.query("select bool_and(relrowsecurity) secured from pg_class where relname in ('whatsapp_saved_audiences','whatsapp_campaign_audience_plans','whatsapp_campaign_reply_routes','meta_lead_ads_campaign_routes')")).rows[0]
  assert.equal(acl.secured,true)
  const openFunctions=(await db.query("select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('whatsapp_audiences_request','whatsapp_campaign_plan_request','whatsapp_campaign_reply_status','meta_campaign_routes_request','meta_form_routes_save') and (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute'))")).rows;assert.deepEqual(openFunctions,[])
 }finally{await db.close()}
})

test('the real campaign worker sends reviewed targets once and skips changed CRM records without provider calls',async()=>{
 const db=await audienceFixture()
 try{
  const a=await savedAudience(db),preview=await audiencePreview(db)
  await queuedAudienceCampaign(db,a,preview.rows)
  await db.query('update leads set assigned_agent_id=$1,assigned_user_id=$1 where lead_id=$2',[agentB,buyerA])
  const {createCampaignWorker}=await import('../../supabase/functions/whatsapp-campaign-worker/worker.js')
  let sent=0
  const meta=async(_sender,path)=>{if(path.includes('message_templates'))return {data:[autoTemplate]};sent++;return {messages:[{id:'wamid.must-not-send'}]}}
  await db.exec('set role service_role')
  await createCampaignWorker({db:sqlClient(db),meta})()
  assert.equal(sent,0)
  assert.equal((await db.query('select status from whatsapp_campaign_recipients')).rows[0].status,'skipped')
  await db.exec('reset role')
 }finally{await db.close()}
})

test('campaign replies preserve an existing CRM link and reject matching message IDs on a foreign sender',async()=>{
 const db=await audienceFixture()
 try{
  const a=await savedAudience(db),preview=await audiencePreview(db)
  await queuedAudienceCampaign(db,a,preview.rows)
  const {recipient}=await claimedAudienceRecipient(db)
  await db.query("select whatsapp_campaign_status('wamid.bound',$1,'100','200','sent',now(),null)",[`arch9-wa:${recipient.id}`])
  const thread=(await receive(db,'existing-crm',new Date().toISOString())).rows[0].id
  await db.query('insert into whatsapp_inbox_crm_links(conversation_id,organisation_id,lead_id,linked_by) values($1,$2,$3,$4)',[thread,org,sellerA,user])
  await db.query("select whatsapp_inbox_campaign_reply('100','200','27821234567','existing-crm','wamid.bound')")
  assert.equal((await db.query('select lead_id from whatsapp_inbox_crm_links where conversation_id=$1',[thread])).rows[0].lead_id,sellerA)
  assert.equal((await db.query('select status from whatsapp_campaign_reply_routes')).rows[0].status,'needs_review')
  await receive(db,'foreign-route',new Date().toISOString(),'101','201')
  await db.query("select whatsapp_inbox_campaign_reply('101','201','27821234567','foreign-route','wamid.bound')")
  assert.equal((await db.query('select count(*)::int n from whatsapp_campaign_reply_routes')).rows[0].n,1)
 }finally{await db.close()}
})

test('a sender disconnect during Meta validation blocks the final audience recipient claim',async()=>{
 const db=await audienceFixture()
 try{
  const a=await savedAudience(db),preview=await audiencePreview(db)
  await queuedAudienceCampaign(db,a,preview.rows)
  const {createCampaignWorker}=await import('../../supabase/functions/whatsapp-campaign-worker/worker.js')
  let sent=0
  await createCampaignWorker({db:sqlClient(db),meta:async(_sender,path)=>{if(path.includes('message_templates')){await db.query("update organisation_communication_channels set connection_status='disconnected' where id=$1",[sender]);return {data:[autoTemplate]}}sent++;return {messages:[{id:'must-not-send'}]}}})()
  assert.equal(sent,0);const row=(await db.query('select status,attempted_at from whatsapp_campaign_recipients')).rows[0];assert.equal(row.status,'queued');assert.equal(row.attempted_at,null)
  assert.equal((await db.query('select connection_status from organisation_communication_channels where id=$1',[sender])).rows[0].connection_status,'disconnected')
 }finally{await db.close()}
})

test('campaign routing preserves historical suppression and freezes rules during active import previews',async()=>{
 const db=await audienceFixture()
 try{
  const {route}=await campaignRoute(db,{leadType:'recruitment',agentId:null})
  await db.query("insert into meta_lead_ads_imports values($1,$2,$3,$4,'ready')",[id(1130),org,connection,id(1100)])
  const lead=await metaIngest(db,'historical-campaign','500',{p_ingestion_source:'historical',p_import_id:id(1130),p_meta_created_at:'2026-09-01T12:00:00Z'})
  const candidate=(await db.query('select * from recruitment_leads where id=$1',[lead.recruitment_lead_id])).rows[0]
  assert.equal(candidate.meta_source_json.ingestion_source,'historical')
  assert.equal(candidate.meta_source_json.submitted_at,'2026-09-01T12:00:00+00:00')
  await assert.rejects(request(autoHandler(db),'meta_routes_disable',{routeId:route.id,version:route.version}),/historical import/)
  const attempt=await sqlClient(db).rpc('meta_form_routes_save',{p_org:org,p_actor:user,p_connection:connection,p_forms:[]});assert.match(attempt.error.message,/historical imports/)
  await db.query("update meta_lead_ads_imports set status='completed'")
  await request(autoHandler(db),'meta_routes_disable',{routeId:route.id,version:route.version})
  assert.equal((await metaIngest(db,'future-default')).lead_type,'buyer')
  // Existing destinations survive both later route edits and revocation of that route's manager.
  await db.query('update meta_lead_ads_campaign_routes set enabled=true')
  await db.query("update organisation_users set status='inactive' where user_id=$1",[user])
  const duplicate=await metaIngest(db,'historical-campaign');assert.equal(duplicate.recruitment_lead_id,lead.recruitment_lead_id)
 }finally{await db.close()}
})

test('manual campaigns can assign exact replies to an agent without inventing a CRM link',async()=>{
 const db=await audienceFixture()
 try{
  const fields={name:'Manual campaign',sender_id:sender,template:autoTemplate,parameter_values:{},contact_ids:[id(1101)],scheduled_at:null}
  const saved=await sqlClient(db).rpc('whatsapp_campaign_plan_request',{p_org:org,p_actor:user,p_action:'save',p_id:id(1140),p_fields:fields,p_plan:{audienceId:null,version:null,mode:'agent',agentId:agentA,targets:[]}})
  assert.equal(saved.error,null)
  const unauthorized=await sqlClient(db).rpc('whatsapp_campaign_plan_request',{p_org:org,p_actor:agentA,p_action:'save',p_id:id(1140),p_existing:true,p_version:1,p_fields:fields,p_plan:null});assert.match(unauthorized.error.message,/management/)
  const unreviewed=await sqlClient(db).rpc('whatsapp_campaign_plan_request',{p_org:org,p_actor:agentA,p_action:'validate',p_id:id(1140)});assert.match(unreviewed.error.message,/management/)
  await db.query('select whatsapp_campaign_enqueue($1,$2,1,$3,$4)',[id(1140),org,autoTemplate,[{contact_id:id(1101),payload:{to:'27821234567'}}]])
  const {recipient}=await claimedAudienceRecipient(db)
  await db.query("select whatsapp_campaign_status('wamid.manual-route',$1,'100','200','sent',now(),null)",[`arch9-wa:${recipient.id}`])
  const thread=(await receive(db,'manual-route-reply',new Date().toISOString())).rows[0].id
  await db.query("select whatsapp_inbox_campaign_reply('100','200','27821234567','manual-route-reply','wamid.manual-route')")
  assert.equal((await db.query('select assigned_user_id from whatsapp_inbox_conversations where id=$1',[thread])).rows[0].assigned_user_id,agentA)
  assert.equal((await db.query('select count(*)::int n from whatsapp_inbox_crm_links')).rows[0].n,0)
  assert.match((await db.query('select reason from whatsapp_campaign_reply_routes')).rows[0].reason,/assigned to the selected reply queue/)
 }finally{await db.close()}
})
