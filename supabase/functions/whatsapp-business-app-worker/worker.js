import { businessAppItems } from '../_shared/whatsappBusinessApp.js'
const result=async query=>{const {data,error}=await query;if(error)throw Error(error.message);return data}
export function createBusinessAppWorker({db,now=Date.now,budgetMs=45000,limit=10}) {
  return async()=>{
    const started=now();let batches=0,failed=0
    while(batches<limit&&now()-started<budgetMs) {
      const job=(await result(db.rpc('whatsapp_business_app_claim_event',{})))?.[0]
      if(!job)break
      try {
        const items=businessAppItems(job.field,job.payload_json),batch=items.slice(job.cursor_position,job.cursor_position+100)
        await result(db.rpc('whatsapp_business_app_process',{p_id:job.id,p_token:job.lease_token,p_items:batch,p_next:job.cursor_position+batch.length,p_done:job.cursor_position+batch.length>=items.length}))
      } catch {
        failed++;await result(db.rpc('whatsapp_business_app_fail',{p_id:job.id,p_token:job.lease_token}))
      }
      batches++
    }
    return {batches,failed}
  }
}
