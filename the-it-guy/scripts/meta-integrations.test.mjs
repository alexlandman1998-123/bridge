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
  const extra={config:{appId:'app',whatsappConfigId:'config',graphVersion:'v23.0'},hash:async value=>`hash:${value}`,encrypt:async()=> 'encrypted',decrypt:async()=> 'fake-token',exchangeCode:async()=> 'fake-token'}
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
 const db=await teamFixture()
 try{
  const admin=staffHandler(db),campaign=id(30),person=id(31)
  await db.query("insert into whatsapp_campaigns(id,organisation_id,name,sender_id) values($1,$2,'Agency campaign',$3)",[campaign,org,sender])
  await db.query("insert into whatsapp_campaign_jobs(campaign_id,status) values($1,'queued')",[campaign])
  await assert.rejects(own(admin,agentA),/Complete or cancel active campaigns/)
  await db.exec("update whatsapp_campaign_jobs set status='completed'")
  await own(admin,agentA)
  const {sender:loadSender}=createCampaignDelivery({db:sqlClient(db),meta:async()=>{throw Error('No provider call permitted')}})
  await assert.rejects(loadSender(org,sender),/agency number/)
  const campaigns=createCampaignHandler({db:sqlClient(db),authorize:async()=>agentA,meta:async()=>({})})
  assert.equal((await campaigns({organisationId:org,action:'workspace'},'Bearer test')).senders.length,0)
  await db.query("insert into whatsapp_marketing_contacts(id,organisation_id,full_name,phone) values($1,$2,'Customer','27821234567')",[person,org])
  const recipient=()=>db.query("insert into whatsapp_campaign_recipients(organisation_id,campaign_id,contact_id,full_name,phone,payload,consent_snapshot) values($1,$2,$3,'Customer','27821234567','{}','{}') returning id",[org,campaign,person])
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

const messagingMigration=new URL('../../supabase/migrations/20261018111956_whatsapp_inbox_messaging.sql',import.meta.url)
async function messagingFixture(){const db=await teamFixture();await db.exec(readFileSync(messagingMigration,'utf8'));return db}
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
