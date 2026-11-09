import {test} from 'node:test'
import assert from 'node:assert/strict'
import {verifyWebhookSignature} from '../../supabase/functions/_shared/whatsappWebhookSignature.js'
import {runWhatsAppWebhookRecovery,processVerifiedWhatsAppPayload} from '../../supabase/functions/_shared/whatsappWebhookRecovery.js'
import {fixture,sqlClient} from './lib/whatsappInboxFixture.mjs'
test('webhook signatures reject forged bodies, malformed headers and missing secrets',async()=>{
 const body='{"entry":[]}',secret='local-fixture-only-secret',key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
 const signature='sha256='+Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))).toString('hex')
 assert.equal(await verifyWebhookSignature(body,signature,secret),true)
 for(const header of ['','sha256=zz','sha256='+'z'.repeat(64),'sha256='+'0'.repeat(64)])assert.equal(await verifyWebhookSignature(body,header,secret),false)
 assert.equal(await verifyWebhookSignature(body+' ',signature,secret),false);assert.equal(await verifyWebhookSignature(body,signature,''),false)
})
test('a stored verified webhook recovers after interruption and duplicate retries never create a second message',async()=>{
 const db=await fixture({workspace:true});try{
  const hash='b'.repeat(64),payload={object:'whatsapp_business_account',entry:[{id:'200',changes:[{field:'messages',value:{metadata:{phone_number_id:'100'},messages:[{id:'wamid.recovery-fixture',from:'27821234567',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Local recovery fixture'}}]}}]}]}
  await db.query('select whatsapp_webhook_enqueue($1,$2)',[hash,JSON.stringify(payload)])
  const base=sqlClient(db),client={...base,rpc:async(name,args)=>name==='whatsapp_webhook_claim'?{data:(await db.query('select * from whatsapp_webhook_claim($1)',[args.p_hash])).rows,error:null}:base.rpc(name,args)}
  const failed=await runWhatsAppWebhookRecovery(client,{hash,process:async()=>{throw Error('simulated storage interruption')}});assert.equal(failed.failed,1)
  const recovered=await runWhatsAppWebhookRecovery(client,{hash});assert.equal(recovered.processed,1)
  await runWhatsAppWebhookRecovery(client,{hash});assert.equal((await db.query('select count(*)::integer n from whatsapp_inbox_messages')).rows[0].n,1)
  assert.equal((await db.query('select processing_status from notification_provider_webhook_events')).rows[0].processing_status,'processed')
 }finally{await db.close()}
})
test('large verified batches checkpoint progress so a retry resumes instead of restarting the entire payload',async()=>{
 const db=await fixture({workspace:true});try{
  const hash='c'.repeat(64),payload={entry:[{id:'200',changes:[{field:'messages',value:{metadata:{phone_number_id:'100'},messages:Array.from({length:60},(_,index)=>({id:`wamid.batch-${index}`,from:'27821234567',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:`Fixture ${index}`}}))}}]}]}
  await db.query('select whatsapp_webhook_enqueue($1,$2)',[hash,JSON.stringify(payload)])
  const base=sqlClient(db),client={...base,rpc:async(name,args)=>name==='whatsapp_webhook_claim'?{data:(await db.query('select * from whatsapp_webhook_claim($1)',[args.p_hash])).rows,error:null}:base.rpc(name,args)}
  await runWhatsAppWebhookRecovery(client,{hash,limit:1});assert.equal((await db.query('select recovery_cursor from notification_provider_webhook_events')).rows[0].recovery_cursor,1)
  assert.equal((await db.query('select count(*)::integer n from whatsapp_inbox_messages')).rows[0].n,25)
  await runWhatsAppWebhookRecovery(client,{hash,limit:5});assert.equal((await db.query('select count(*)::integer n from whatsapp_inbox_messages')).rows[0].n,60)
  assert.equal((await db.query('select processing_status from notification_provider_webhook_events')).rows[0].processing_status,'processed')
 }finally{await db.close()}
})

test('notification receipts accept sent-to-failed and never regress delivered or read receipts',async()=>{
 const db=await fixture({workspace:true});try{
  await db.exec("create table communication_deliveries(id uuid primary key,provider text,channel text,provider_message_id text,status text,notification_event_id uuid,updated_at timestamptz,sent_at timestamptz,failed_at timestamptz,delivered_at timestamptz,read_at timestamptz,error_message text);create table notification_events(id uuid primary key,status text,updated_at timestamptz,sent_at timestamptz,failed_at timestamptz,delivered_at timestamptz,read_at timestamptz,error_message text);insert into communication_deliveries values('00000000-0000-4000-8000-000000000090','meta','whatsapp','wamid.notification','sent','00000000-0000-4000-8000-000000000091',null,null,null,null,null,null);insert into notification_events(id,status) values('00000000-0000-4000-8000-000000000091','sent');")
  const client={...sqlClient(db),rpc:async()=>({data:null,error:null})}
  for(const [status,expected] of [['failed','failed'],['sent','failed'],['delivered','delivered'],['failed','delivered'],['read','read'],['sent','read'],['failed','read']]){
   await processVerifiedWhatsAppPayload(client,{entry:[{id:'200',changes:[{field:'messages',value:{metadata:{phone_number_id:'100'},statuses:[{id:'wamid.notification',status,timestamp:String(Math.floor(Date.now()/1000))}]}}]}]})
   assert.equal((await db.query('select status from communication_deliveries')).rows[0].status,expected)
   assert.equal((await db.query('select status from notification_events')).rows[0].status,expected)
   if(['delivered','read'].includes(expected)){assert.equal((await db.query('select error_message from communication_deliveries')).rows[0].error_message,null);assert.equal((await db.query('select error_message from notification_events')).rows[0].error_message,null)}
  }
 }finally{await db.close()}
})
