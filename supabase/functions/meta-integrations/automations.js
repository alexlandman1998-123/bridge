import { automationDraft, automationTemplate } from '../_shared/whatsappAutomation.js'
import { isUuid, text } from '../_shared/metaIntegrationCore.js'

const result = async query => { const {data,error}=await query;if(error)throw new Error(error.message);return data }
export async function handleAutomations({ db, actor, org, action, payload, channel, graph, senderToken }) {
  if (!actor.isAdmin) throw new Error('Agency management must manage WhatsApp automations.')
  // SQL rechecks current membership, including after provider template requests.
  await result(db.rpc('whatsapp_staff_is_admin',{p_org:org,p_actor:actor.userId})).then(admin=>{if(!admin)throw new Error('Agency management must manage WhatsApp automations.')})
  async function templates(senderId) {
    const sender=await channel(org,senderId)
    if(sender.connection_status!=='connected')throw new Error('Reconnect this WhatsApp sender.')
    const rows=[];let after=''
    for(let page=0;page<5;page++) {
      const response=await graph(await senderToken(sender),`${sender.waba_id}/message_templates?fields=id,name,language,status,category,components,parameter_format&limit=100${after?`&after=${encodeURIComponent(after)}`:''}`)
      rows.push(...(response.data||[]));after=text(response.paging?.cursors?.after)
      if(!response.paging?.next||!after)return rows.filter(row=>row.status==='APPROVED')
      if(after.length>1000)break
    }
    throw new Error('The template library could not be completely loaded. Try again after narrowing it in WhatsApp Manager.')
  }
  if(action==='automation_templates')return {templates:await templates(payload.senderId)}
  const fields={p_org:org,p_actor:actor.userId,p_action:action.replace('automation_',''),p_id:payload.ruleId||null,p_version:payload.version??null}
  if(fields.p_id&&!isUuid(fields.p_id))throw new Error('Choose a saved automation rule.')
  if(action==='automation_save') {
    const draft=automationDraft(payload.rule)
    if(draft.assignAgentId&&!isUuid(draft.assignAgentId))throw new Error('Choose an active agent.')
    if(draft.action==='message') {
      const live=(await templates(draft.senderId)).find(row=>row.id===draft.template.id)
      if(!live||automationTemplate(live,draft.values).identity!==automationTemplate(draft.template,draft.values).identity)throw new Error('The template changed in Meta. Reload templates before saving.')
      draft.template=live
    }
    fields.p_config=draft
  }
  if(action==='automation_enable'&&payload.confirmed!==true)throw new Error('Confirm this rule may act on future leads and messages.')
  return result(db.rpc('whatsapp_automation_rules_request',fields))
}
