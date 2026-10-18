import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { canReply, publicListingPost, applyWhatsAppInboxWebhook } from '../../supabase/functions/_shared/metaIntegrationCore.js'
import { createCampaignDelivery } from '../../supabase/functions/_shared/whatsappCampaignDelivery.js'
import { createCampaignHandler } from '../../supabase/functions/whatsapp-campaigns/handler.js'
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
