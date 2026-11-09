import {test} from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './lib/whatsappInboxFixture.mjs'
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const org=id(1),other=id(2),admin=id(3),sender=id(4),agent=id(20),peer=id(21)
const command=(db,actor,action,conversation=null,fields={})=>db.query('select whatsapp_workspace_command($1,$2,$3,$4,$5) data',[org,actor,action,conversation,JSON.stringify(fields)]).then(r=>r.rows[0].data)
const page=(db,actor,action='list',conversation=null,search='',view='all',before=null)=>db.query('select whatsapp_workspace_page($1,$2,$3,$4,$5,$6,$7,$8,$9) data',[org,actor,action,conversation,before?.at||null,before?.id||null,search,'[]',view]).then(r=>r.rows[0].data)
async function setup(){const db=await fixture({workspace:true});await db.query('insert into auth.users values($1),($2)',[agent,peer]);await db.query("insert into organisation_users(user_id,organisation_id,status,role) values($1,$3,'active','agent'),($2,$3,'active','agent')",[agent,peer,org]);return db}
async function incoming(db,key,at=new Date().toISOString()){return(await db.query("select whatsapp_inbox_receive('100','200','27821234567',$1,$2,'text',$1,'{}','Fixture buyer') id",[key,at])).rows[0].id}
test('read-only pages, visible acknowledgements, queue claims and actor-specific unread remain tenant-safe',async()=>{
 const db=await setup();try{
  const chat=await incoming(db,'one');await incoming(db,'two',new Date(Date.now()+500).toISOString())
  const first=await page(db,agent);assert.equal(first.conversations.length,1);assert.equal(first.counts.unread,2)
  const thread=await page(db,agent,'thread',chat);assert.equal(thread.messages.length,2);assert.equal((await page(db,agent)).counts.unread,2)
  await command(db,agent,'read',chat,{through:thread.messages.at(-1).created_at});assert.equal((await page(db,agent)).counts.unread,1);assert.equal((await page(db,peer)).counts.unread,2)
  const claims=await Promise.allSettled([command(db,agent,'take',chat,{assignmentVersion:thread.conversation.assignment_version}),command(db,peer,'take',chat,{assignmentVersion:thread.conversation.assignment_version})]);assert.equal(claims.filter(r=>r.status==='fulfilled').length,1)
  assert.equal((await page(db,peer)).conversations.length,0);await assert.rejects(page(db,peer,'thread',chat),/not found/)
  await db.query("update organisation_users set status='inactive' where user_id=$1",[agent]);await assert.rejects(page(db,agent,'thread',chat),/membership/)
  await db.exec('set role authenticated');await assert.rejects(db.query('select * from whatsapp_inbox_private_work'),/permission denied/);await assert.rejects(command(db,admin,'work',chat),/permission denied/)
 }finally{await db.close()}
})
test('draft conflicts, idempotent private notes, snooze and current ownership protect collaborative work',async()=>{
 const db=await setup();try{
  const chat=await incoming(db,'collaboration');await command(db,agent,'take',chat,{assignmentVersion:(await page(db,agent,'thread',chat)).conversation.assignment_version})
  const work=await command(db,agent,'draft',chat,{version:0,body:'Viewing arrangements'});assert.equal(work.draft.version,1)
  await assert.rejects(command(db,agent,'draft',chat,{version:0,body:'Overwrite'}),/another tab/);await assert.rejects(command(db,peer,'work',chat),/not found/)
  const fields={requestId:id(30),body:'Call before arranging a viewing.',mentions:[admin]};await command(db,agent,'note',chat,fields);await command(db,agent,'note',chat,fields);assert.equal((await command(db,agent,'work',chat,{includeNotes:true})).notes.length,1)
  await assert.rejects(command(db,agent,'note',chat,{...fields,body:'Different'}),/already used/)
  const current=(await page(db,agent,'thread',chat)).conversation;await command(db,agent,'state',chat,{assignmentVersion:current.assignment_version,state:'snoozed',until:new Date(Date.now()+3600000).toISOString()});assert.equal((await page(db,agent)).conversations.length,0);assert.equal((await page(db,agent,'list',null,'','snoozed')).conversations.length,1)
  await incoming(db,'new customer message');assert.equal((await page(db,agent)).conversations.length,1)
 }finally{await db.close()}
})
test('large fixtures keep pages bounded, search old message bodies and paginate without losing conversations',async()=>{
 const db=await setup();try{
  await db.exec(`insert into whatsapp_inbox_conversations(organisation_id,channel_id,contact_phone,contact_name,last_message_at,last_inbound_at) select '${org}','${sender}',('278'||lpad(n::text,8,'0')),'Fixture '||n,now()-n*interval '1 minute',now()-n*interval '1 minute' from generate_series(1,10000)n;
  insert into whatsapp_inbox_messages(organisation_id,conversation_id,channel_id,direction,message_type,body_text,delivery_status,event_at) select organisation_id,id,channel_id,'inbound','text',case when contact_name='Fixture 9999' then 'rare historical floorplan reference' else 'Fixture message' end,'received',last_message_at from whatsapp_inbox_conversations cross join generate_series(1,10) copy;`)
  const started=performance.now(),first=await page(db,admin);assert.equal(first.conversations.length,50);assert.equal(first.counts.all,10000);assert.ok(first.nextCursor)
  const second=await page(db,admin,'list',null,'','all',first.nextCursor);assert.equal(second.conversations.length,50);assert.equal(new Set([...first.conversations,...second.conversations].map(c=>c.id)).size,100)
  const found=await page(db,admin,'list',null,'rare historical floorplan');assert.equal(found.conversations.length,1);assert.equal(found.conversations[0].contact_name,'Fixture 9999')
  console.log(JSON.stringify({fixtureConversations:10000,fixtureMessages:100000,firstPageBytes:Buffer.byteLength(JSON.stringify(first)),threeReadsMs:Math.round(performance.now()-started)}))
  await assert.rejects(db.query('select whatsapp_workspace_page($1,$2,$3)',[other,admin,'list']),/membership/)
 }finally{await db.close()}
})
test('outbound contact setup is assigned safely, routing excludes away agents and preferences suppress badges',async()=>{
 const db=await setup();try{
  const created=await command(db,agent,'create',null,{phone:'27820000001',name:'Fictional contact',senderId:sender});assert.equal(created.conversation.assigned_user_id,agent)
  assert.equal((await command(db,agent,'create',null,{phone:'27820000001',senderId:sender})).conversation.id,created.conversation.id)
  await assert.rejects(command(db,peer,'create',null,{phone:'27820000001',senderId:sender}),/another agent/)
  const settings=(await command(db,admin,'settings')).settings;await command(db,admin,'save_settings',null,{version:settings.version,responseMinutes:30,autoAssign:true,snippets:[{title:'Viewing',body:'When would you like to view?'}]})
  await command(db,agent,'availability',null,{awayUntil:new Date(Date.now()+3600000).toISOString(),notify:false})
  const chat=await incoming(db,'new routed enquiry');assert.equal((await page(db,peer)).conversations[0].assigned_user_id,peer)
  assert.equal((await page(db,agent,'notifications')).unreadCount,0)
  await assert.rejects(command(db,peer,'save_settings',null,{version:2,responseMinutes:30}),/management/)
  await db.exec("update whatsapp_inbox_private_work set expires_at=now()-interval '1 day';select whatsapp_workspace_cleanup();")
  assert.ok(chat)
 }finally{await db.close()}
})
test('verified receiving is durable, leased, bounded and cannot be queued by browser roles',async()=>{
 const db=await setup();try{
  const hash='a'.repeat(64),payload={entry:[]};await db.query('select whatsapp_webhook_enqueue($1,$2)',[hash,JSON.stringify(payload)]);await db.query('select whatsapp_webhook_enqueue($1,$2)',[hash,JSON.stringify(payload)])
  assert.equal((await db.query('select count(*)::integer n from notification_provider_webhook_events')).rows[0].n,1)
  const first=(await db.query('select * from whatsapp_webhook_claim($1)',[hash])).rows[0];assert.ok(first.recovery_lease);assert.equal((await db.query('select * from whatsapp_webhook_claim($1)',[hash])).rows.length,0)
  await db.query('select whatsapp_webhook_finish($1,$2,false)',[first.id,first.recovery_lease]);const retry=(await db.query('select * from whatsapp_webhook_claim($1)',[hash])).rows[0];assert.equal(retry.recovery_attempts,2)
  await db.query('select whatsapp_webhook_finish($1,$2,true)',[retry.id,retry.recovery_lease]);assert.equal((await db.query('select * from whatsapp_webhook_claim($1)',[hash])).rows.length,0)
  await db.exec('set role authenticated');await assert.rejects(db.query('select whatsapp_webhook_enqueue($1,$2)',[hash,JSON.stringify(payload)]),/permission denied/)
 }finally{await db.close()}
})
test('different requests for the same reply are blocked while explicit send limits leave webhook imports unaffected',async()=>{
 const db=await setup();try{
  const chat=await incoming(db,'send-guard-fixture'),thread=(await page(db,admin,'thread',chat)).conversation
  const claim=(request,body)=>db.query("select whatsapp_inbox_claim(p_org=>$1,p_actor=>$2,p_conversation=>$3,p_request=>$4,p_intent=>$5,p_assignment_version=>$6,p_sender_version=>1,p_type=>'text',p_body=>$7)",[org,admin,chat,request,JSON.stringify({kind:'text',body}),thread.assignment_version,body])
  const attempts=await Promise.allSettled([claim(id(101),'Same deliberate reply'),claim(id(102),'Same deliberate reply')]);assert.equal(attempts.filter(row=>row.status==='fulfilled').length,1)
  const receipt=await claim(attempts[0].status==='fulfilled'?id(101):id(102),'Same deliberate reply');assert.equal(receipt.rows[0].whatsapp_inbox_claim.claimed,false)
  await db.exec("update whatsapp_inbox_messages set delivery_status='sent' where direction='outbound'")
  for(let n=0;n<29;n++){await claim(id(200+n),`Distinct fixture reply ${n}`);await db.query("update whatsapp_inbox_messages set delivery_status='sent' where id=$1",[id(200+n)])}
  await assert.rejects(claim(id(500),'One beyond the limit'),/Sending limit/)
  await incoming(db,'inbound still works');assert.equal((await page(db,admin,'thread',chat)).messages.filter(message=>message.direction==='inbound').length,2)
 }finally{await db.close()}
})
test('a departing personal-number owner cannot read or send but incoming messages remain stored for management handover',async()=>{
 const db=await setup();try{
  await db.query("insert into organisation_communication_channels(id,organisation_id,provider,channel_type,phone_number_id,waba_id,connection_status,owner_user_id) values($1,$2,'meta','whatsapp','300','200','connected',$3)",[id(600),org,agent])
  await db.query("update organisation_users set status='inactive' where user_id=$1",[agent])
  const chat=(await db.query("select whatsapp_inbox_receive('300','200','27820000009','wamid.departing',$1,'Still receiving','text','{}','Fixture') id",[new Date().toISOString()])).rows[0].id
  assert.ok(chat);const visible=await page(db,admin,'thread',chat);assert.equal(visible.conversation.assigned_user_id,agent)
  await assert.rejects(page(db,agent,'thread',chat),/membership/);await assert.rejects(page(db,peer,'thread',chat),/not found/)
  assert.equal((await command(db,admin,'report')).unavailableOwner,1)
 }finally{await db.close()}
})
test('mentions and internal note pages are visible only to authorised people and acknowledgement is separate from message reads',async()=>{
 const db=await setup();try{
  const chat=await incoming(db,'mention fixture');await command(db,agent,'take',chat,{assignmentVersion:(await page(db,agent,'thread',chat)).conversation.assignment_version})
  for(let n=0;n<25;n++)await command(db,agent,'note',chat,{requestId:id(700+n),body:`Internal handover ${n}`,mentions:[admin]})
  const first=await command(db,admin,'work',chat,{includeNotes:true});assert.equal(first.notes.length,20);assert.ok(first.notesNextCursor)
  const next=await command(db,admin,'work',chat,{includeNotes:true,beforeNotesAt:first.notesNextCursor.at,beforeNotesId:first.notesNextCursor.id});assert.equal(next.notes.length,5)
  assert.equal((await page(db,admin,'notifications')).mentionCount,25)
  await command(db,admin,'read',chat,{notesThrough:first.notes[0].created_at});assert.equal((await page(db,admin,'notifications')).mentionCount,0)
  await assert.rejects(command(db,agent,'note',chat,{requestId:id(800),body:'Must not expose a private chat',mentions:[peer]}),/cannot access/)
 }finally{await db.close()}
})
test('reviewing an uncertain send preserves its delivery truth and does not dispatch or erase the original message',async()=>{
 const db=await setup();try{
  const chat=await incoming(db,'uncertain fixture'),thread=(await page(db,admin,'thread',chat)).conversation
  const claim=(request,body)=>db.query("select whatsapp_inbox_claim(p_org=>$1,p_actor=>$2,p_conversation=>$3,p_request=>$4,p_intent=>$5,p_assignment_version=>$6,p_sender_version=>1,p_type=>'text',p_body=>$7)",[org,admin,chat,request,JSON.stringify({kind:'text',body}),thread.assignment_version,body])
  await claim(id(850),'Uncertain delivery');await db.query("update whatsapp_inbox_messages set delivery_status='unknown',created_at=now()-interval '2 minutes' where id=$1",[id(850)])
  await assert.rejects(claim(id(851),'New message'),/unconfirmed/)
  await command(db,admin,'review_send',chat,{messageId:id(850),confirmed:true,assignmentVersion:thread.assignment_version})
  const receipt=(await db.query('select * from whatsapp_inbox_messages where id=$1',[id(850)])).rows[0];assert.equal(receipt.delivery_status,'unknown');assert.equal(receipt.body_text,'Uncertain delivery');assert.ok(receipt.reviewed_at)
  await claim(id(851),'New message');assert.equal((await db.query('select count(*)::integer n from whatsapp_inbox_messages where direction=\'outbound\'')).rows[0].n,2)
 }finally{await db.close()}
})
test('historical chats return to active work after a live outgoing message and mentions use the right view',async()=>{
 const db=await setup();try{
  await db.query("update organisation_communication_channels set onboarding_mode='coexistence' where id=$1",[sender])
  const ingest=async(key,direction,source,at)=> (await db.query("select whatsapp_business_app_ingest('100','200','27821110000',$1,$2,$3,'text',$1,'{}','Fixture history',$4,'sent') id",[key,at,direction,source])).rows[0].id
  const chat=await ingest('history-only','inbound','history',new Date(Date.now()-86400000*3).toISOString())
  assert.equal((await page(db,admin)).counts.all,0);assert.equal((await page(db,admin)).counts.history,1)
  const report=await command(db,admin,'report');assert.equal(report.open,0);assert.equal(report.unassigned,0)
  await command(db,agent,'take',chat,{assignmentVersion:(await page(db,agent,'thread',chat)).conversation.assignment_version})
  await command(db,agent,'note',chat,{requestId:id(950),body:'Imported context for management',mentions:[admin]})
  assert.equal((await page(db,admin,'notifications')).notificationView,'history')
  await ingest('new-phone-app-reply','outbound','business_app',new Date().toISOString())
  const active=await page(db,admin);assert.equal(active.counts.all,1);assert.equal(active.counts.history,0);assert.equal(active.conversations[0].historical,false)
  assert.equal((await page(db,admin,'notifications')).notificationView,'all');assert.equal((await command(db,admin,'report')).open,1)
  const fresh=await command(db,agent,'create',null,{phone:'27821110001',senderId:sender})
  await command(db,agent,'note',fresh.conversation.id,{requestId:id(951),body:'New contact handover',mentions:[admin]})
  const notification=await page(db,admin,'notifications');assert.equal(notification.notificationConversationId,fresh.conversation.id);assert.equal(notification.notificationView,'all')
  const owned=(await page(db,agent,'thread',fresh.conversation.id)).conversation;await command(db,agent,'state',owned.id,{assignmentVersion:owned.assignment_version,state:'snoozed',until:new Date(Date.now()+3600000).toISOString()});assert.equal((await page(db,admin,'notifications')).notificationView,'snoozed')
 }finally{await db.close()}
})
test('optional routing ignores imported history and balances only active work',async()=>{
 const db=await setup();try{
  await db.query("update organisation_communication_channels set onboarding_mode='coexistence' where id=$1",[sender])
  const history=async n=>(await db.query("select whatsapp_business_app_ingest('100','200',$1,$2,now()-interval '3 days','inbound','text','Imported history','{}','Fixture','history','sent') id",[`2782222${String(n).padStart(4,'0')}`,`history-routing-${n}`])).rows[0].id
  for(let n=0;n<10;n++){const chat=await history(n);await db.query('update whatsapp_inbox_conversations set assigned_user_id=$1 where id=$2',[agent,chat])}
  await command(db,peer,'create',null,{phone:'27823330000',senderId:sender})
  const settings=(await command(db,admin,'settings')).settings;await command(db,admin,'save_settings',null,{version:settings.version,responseMinutes:60,autoAssign:true})
  const imported=await history(20);assert.equal((await page(db,admin,'thread',imported)).conversation.assigned_user_id,null)
  const live=await incoming(db,'workload routing fixture');assert.equal((await page(db,admin,'thread',live)).conversation.assigned_user_id,agent)
  assert.equal((await command(db,admin,'report')).open,2)
 }finally{await db.close()}
})
