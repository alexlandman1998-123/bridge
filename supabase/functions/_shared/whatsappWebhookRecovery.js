import {applyWhatsAppCampaignWebhook} from './whatsappCampaignWebhook.js'
import {applyWhatsAppInboxWebhook} from './metaIntegrationCore.js'
const result=async query=>{const {data,error}=await query;if(error)throw Error('WhatsApp webhook storage unavailable');return data}
const rank={sent:1,failed:2,delivered:3,read:4}
export async function processVerifiedWhatsAppPayload(db,payload){
 await applyWhatsAppCampaignWebhook(db,payload)
 await applyWhatsAppInboxWebhook(db,payload)
 for(const entry of payload.entry||[])for(const change of entry.changes||[])for(const item of change.value?.statuses||[]){
  if(!item.id||!['sent','delivered','read','failed'].includes(item.status))continue
  const delivery=await result(db.from('communication_deliveries').select('id,status,notification_event_id').eq('provider','meta').eq('channel','whatsapp').eq('provider_message_id',item.id).maybeSingle())
  if(!delivery||(rank[delivery.status]||0)>(rank[item.status]||0)||delivery.status===item.status)continue
  const seconds=Number(item.timestamp),eventAt=Number.isFinite(seconds)&&seconds>0?new Date(seconds*1000).toISOString():new Date().toISOString()
  const patch={status:item.status,updated_at:new Date().toISOString(),[`${item.status}_at`]:eventAt,error_message:item.status==='failed'?String(item.errors?.[0]?.title||'Delivery failed').slice(0,500):null}
  const changed=await result(db.from('communication_deliveries').update(patch).eq('id',delivery.id).eq('status',delivery.status).select('id'))
  if(changed?.length&&delivery.notification_event_id)await result(db.from('notification_events').update(patch).eq('id',delivery.notification_event_id))
 }
}
export function whatsappWebhookSegments(payload){
 const segments=[]
 for(const entry of payload.entry||[])for(const change of entry.changes||[]){
  const value=change.value||{},messages=value.messages||[],statuses=value.statuses||[]
  if(!messages.length&&!statuses.length){segments.push({...payload,entry:[{...entry,changes:[change]}]});continue}
  const size=25,total=Math.max(messages.length,statuses.length)
  for(let offset=0;offset<total;offset+=size)segments.push({...payload,entry:[{...entry,changes:[{...change,value:{...value,messages:messages.slice(offset,offset+size),statuses:statuses.slice(offset,offset+size)}}]}]})
 }
 return segments.length?segments:[payload]
}
/** @param {any} db @param {{hash?:string|null,limit?:number,process?:(db:any,payload:any)=>Promise<void>}} options */
export async function runWhatsAppWebhookRecovery(db,{hash=null,limit=5,process=processVerifiedWhatsAppPayload}={}){
 let processed=0,failed=0;const started=Date.now()
 for(let index=0;index<limit&&Date.now()-started<45000;index++){
  const job=(await result(db.rpc('whatsapp_webhook_claim',{p_hash:hash})))?.[0]
  if(!job)break
  const segments=whatsappWebhookSegments(job.payload_json),cursor=Number(job.recovery_cursor)||0
  let success=false
  try{await process(db,segments[cursor]||job.payload_json);success=true;processed++}catch{failed++}
  await result(db.rpc('whatsapp_webhook_finish',{p_id:job.id,p_lease:job.recovery_lease,p_success:success,p_next:cursor+1,p_done:cursor+1>=segments.length}))
  if(failed)break
 }
 return {processed,failed}
}
