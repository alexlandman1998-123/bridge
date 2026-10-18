import { automationTemplate } from '../_shared/whatsappAutomation.js'
import { templateIdentity } from '../_shared/whatsappCampaign.js'

const result = async query => { const {data,error}=await query;if(error)throw new Error(error.message);return data }
export function createAutomationWorker({ db, meta, limit = 10, now = Date.now }) {
  return async () => {
    let processed=0
    const started=now()
    while(processed<Math.min(limit,20)&&now()-started<45000) {
      const job=await result(db.rpc('whatsapp_automation_next',{}))
      if(!job)break
      processed++
      let claimed=false
      const rpc=(name,fields={})=>result(db.rpc(name,{p_id:job.id,p_token:job.lease_token,...fields}))
      try {
        const prepared=await rpc('whatsapp_automation_prepare')
        if(!prepared.ready)continue
        const sender=await result(db.from('organisation_communication_channels').select('*').eq('organisation_id',job.organisation_id).eq('id',prepared.senderId).single())
        const config=prepared.rule.config,rows=[];let after=''
        for(let page=0;page<5;page++) {
          const response=await meta(sender,`${sender.waba_id}/message_templates?fields=id,name,language,status,category,components,parameter_format&limit=100${after?`&after=${encodeURIComponent(after)}`:''}`)
          rows.push(...(response.data||[]));after=String(response.paging?.cursors?.after||'')
          if(rows.some(row=>row.id===config.template.id)||!response.paging?.next||!after)break
          if(after.length>1000)throw new Error('Invalid template cursor')
        }
        const template=rows.find(row=>row.id===config.template.id)
        if(!template||templateIdentity(template)!==templateIdentity(config.template))throw new Error('Template changed')
        const message=automationTemplate(template,config.values,{phone:prepared.snapshot.phone,full_name:prepared.snapshot.name})
        // Repeat authorization, consent and stop checks after fetching Meta's template.
        const dispatch=await rpc('whatsapp_automation_prepare',{p_dispatch:true,p_body:message.preview,p_template:template})
        if(!dispatch.ready)continue
        claimed=true
        const response=await meta(sender,`${sender.phone_number_id}/messages`,{...message.provider,biz_opaque_callback_data:`arch9-inbox:${dispatch.messageId}`})
        const providerId=String(response.messages?.[0]?.id||'')
        if(!providerId)throw new Error('No provider receipt')
        await rpc('whatsapp_automation_finish',{p_status:'sent',p_provider_id:providerId})
      } catch(error) {
        // Fixed reasons keep provider credentials and database internals out of logs.
        await rpc('whatsapp_automation_finish',{p_status:claimed&&!error.definitive?'unknown':'failed'})
      }
    }
    return {processed}
  }
}
