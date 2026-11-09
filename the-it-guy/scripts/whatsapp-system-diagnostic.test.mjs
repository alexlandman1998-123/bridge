import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAutomationWorker } from '../../supabase/functions/whatsapp-automation-worker/worker.js'
import { createMetaIntegrationHandler } from '../../supabase/functions/meta-integrations/handler.js'
import { applyWhatsAppInboxWebhook } from '../../supabase/functions/_shared/metaIntegrationCore.js'
const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',user='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const template={id:'123',name:'hello',language:'en_US',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Hello {{1}}'}]}
function fixture({dispatchReady=true,providerError,liveTemplate=template}={}) {
 const calls=[],sent=[],finished=[];let next=true
 const prepared={ready:true,senderId:'sender',rule:{config:{template,values:{'body.1':{source:'first_name'}}}},snapshot:{phone:'27821234567',name:'Test Buyer'}}
 const db={rpc:async(name,args)=>{
  calls.push({name,args});let data
  if(name==='whatsapp_automation_next'){data=next?{id:'job',lease_token:'lease',organisation_id:org}:null;next=false}
  else if(name==='whatsapp_automation_prepare')data=args.p_dispatch?{ready:dispatchReady,messageId:'receipt'}:prepared
  else if(name==='whatsapp_automation_finish'){finished.push(args);data={}}
  else throw Error(`Unexpected RPC ${name}`)
  return {data,error:null}
 },from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:{waba_id:'100',phone_number_id:'200'},error:null})};return q}}
 const meta=async(_sender,path,payload)=>{if(path.includes('message_templates'))return {data:[liveTemplate]};sent.push(payload);if(providerError)throw providerError;return {messages:[{id:'wamid.receipt'}]}}
 return {run:createAutomationWorker({db,meta}),calls,sent,finished}
}
test('automation rechecks consent and rule state after template lookup before dispatch',async()=>{
 const f=fixture({dispatchReady:false});await f.run()
 assert.equal(f.calls.filter(c=>c.name==='whatsapp_automation_prepare').length,2);assert.equal(f.sent.length,0)
})
test('automation sends reviewed template with receipt correlation and records acceptance',async()=>{
 const f=fixture();await f.run();assert.equal(f.sent.length,1);assert.equal(f.sent[0].to,'27821234567')
 assert.equal(f.sent[0].template.components[0].parameters[0].text,'Test')
 assert.equal(f.sent[0].biz_opaque_callback_data,'arch9-inbox:receipt');assert.equal(f.finished[0].p_status,'sent');assert.equal(f.finished[0].p_provider_id,'wamid.receipt')
})
test('automation distinguishes uncertain sends, explicit rejection and revoked approval',async()=>{
 for(const [options,status,sends] of [[{providerError:Error('timeout')},'unknown',1],[{providerError:Object.assign(Error('rejected'),{definitive:true})},'failed',1],[{liveTemplate:{...template,status:'PAUSED'}},'failed',0]]){
  const f=fixture(options);await f.run();assert.equal(f.finished[0].p_status,status);assert.equal(f.sent.length,sends)
 }
})
test('Meta routes inbox, audiences and automations to actor-scoped handlers',async()=>{
 const calls=[];const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='whatsapp_staff_is_admin'?true:name==='whatsapp_workspace_page'?{conversations:[]}:name==='whatsapp_automation_rules_request'?{rules:[]}:{audiences:[]},error:null}}}
 const handle=createMetaIntegrationHandler({db,authorize:async()=>({userId:user,isAdmin:true})})
 for(const action of ['inbox_page','automation_list','audience_list'])await handle({organisationId:org,action},'Bearer test')
 assert.ok(calls.some(c=>c.name==='whatsapp_workspace_page'));assert.ok(calls.some(c=>c.name==='whatsapp_automation_rules_request'))
 assert.ok(calls.every(c=>c.args.p_org===org&&c.args.p_actor===user))
})
test('webhook records STOP and campaign replies; storage failures request redelivery',async()=>{
 const payload={entry:[{id:'100',changes:[{field:'messages',value:{metadata:{phone_number_id:'200'},messages:[{id:'wamid.inbound',from:'27821234567',timestamp:'1792570000',type:'text',text:{body:'STOP'},context:{id:'wamid.outbound'}}]}}]}]}
 const calls=[];await applyWhatsAppInboxWebhook({rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:null}}},payload)
 assert.ok(calls.some(c=>c.name==='whatsapp_inbox_optout'));assert.ok(calls.some(c=>c.name==='whatsapp_inbox_campaign_reply'&&c.args.p_reply_to==='wamid.outbound'))
 await assert.rejects(applyWhatsAppInboxWebhook({rpc:async(name)=>({data:null,error:name==='whatsapp_inbox_optout'?{message:'storage unavailable'}:null})},payload),/opt-out/)
})
