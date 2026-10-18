export function audienceFilters(input = {}) {
  const kind=String(input.kind||'')
  if(!['buyer','seller','recruitment'].includes(kind))throw new Error('Choose Buyer, Seller or Recruitment.')
  const list=(value,label)=>{if(!Array.isArray(value)||value.length>30||value.some(item=>typeof item!=='string'||!item.trim()||item.length>120))throw new Error(`Choose up to 30 ${label}.`);return [...new Set(value.map(item=>item.trim().toLowerCase()))]}
  const agentId=input.agentId||null
  if(agentId&&!/^[0-9a-f-]{36}$/i.test(agentId))throw new Error('Choose an active agent.')
  if(kind==='recruitment'&&agentId)throw new Error('Recruitment stays in the management pipeline.')
  return {kind,areas:list(input.areas||[],'areas'),stages:list(input.stages||[],'stages'),agentId,includeClosed:input.includeClosed===true}
}
export function audienceDraft(input={}) {
  const name=String(input.name||'').trim()
  if(!name||name.length>100)throw new Error('Name this audience using up to 100 characters.')
  return {name,filters:audienceFilters(input.filters)}
}
export function replyPlan(input){
  if(input==null)return null
  if(!['record_owner','agent','agency_queue'].includes(input.mode))throw new Error('Choose how campaign replies should be assigned.')
  if(input.mode==='agent'&&!/^[0-9a-f-]{36}$/i.test(input.agentId||''))throw new Error('Choose a reply agent.')
  const targets=input.targets||[]
  if(!Array.isArray(targets)||targets.length>500)throw new Error('Select up to 500 CRM recipients.')
  return {audienceId:input.audienceId||null,version:input.version??null,mode:input.mode,agentId:input.mode==='agent'?input.agentId:null,targets:targets.map(row=>({contactId:row.contactId,kind:row.kind,recordId:row.recordId,state:row.state}))}
}
