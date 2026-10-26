import { expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient', () => ({ supabase: null }))
import { archiveMarketingAudience, attachCampaignAudience, emptyAudienceDefinition, loadMarketingAudiences, previewMarketingAudience, saveMarketingAudience, validateAudienceDefinition } from '../marketingAudienceService'
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const org=id(1), audience={id:id(2),revision:4}, campaign=id(3)
function clientFor(data={id:id(2)}) {
  const calls=[]
  const client={calls,rpc:vi.fn().mockResolvedValue({data}),from(table){
    const call={table,eq:[]}; calls.push(call)
    const q={update(value){call.update=value;return q},insert(value){call.insert=value;return q},delete(){call.delete=true;return q},eq(key,value){call.eq.push([key,value]);return q},is(key,value){call.is=[key,value];return q},select(){return q},maybeSingle:async()=>({data}),single:async()=>({data}),then(resolve){return Promise.resolve({data}).then(resolve)}}
    return q
  }}
  return client
}
it('validates bounded rules without accepting SQL fields, malformed numbers or owners',()=>{
  expect(validateAudienceDefinition(emptyAudienceDefinition())).toBeTruthy()
  for(const bad of [{}, {...emptyAudienceDefinition(),rules:[]}, {...emptyAudienceDefinition(),quietDays:366}, {...emptyAudienceDefinition(),rules:[{field:'raw_sql',operator:'in',values:['x']}]}, {...emptyAudienceDefinition(),rules:[{field:'budget',operator:'gte',values:['NaN']}]}, {...emptyAudienceDefinition(),rules:[{field:'owner',operator:'in',values:['arbitrary user']}]}, {...emptyAudienceDefinition(),rules:[{field:'area',operator:'in',values:[123]}]}]) expect(()=>validateAudienceDefinition(bad)).toThrow()
})
it('scopes definition writes and uses revision checks without changing ownership',async()=>{
  const client=clientFor(), draft={...audience,name:'  Local buyers  ',description:'CRM segment',visibility:'personal',definition:emptyAudienceDefinition(),created_by:id(99)}
  await saveMarketingAudience(org,draft,{client})
  expect(client.calls[0]).toMatchObject({table:'marketing_audiences',update:{name:'Local buyers',revision:5},is:['archived_at',null]})
  expect(client.calls[0].eq).toEqual([['organisation_id',org],['id',audience.id],['revision',4]])
  expect(client.calls[0].update.created_by).toBeUndefined()
  await archiveMarketingAudience(org,audience,{client})
  expect(client.calls[1].update.revision).toBe(5)
  await expect(saveMarketingAudience(org,draft,{client:clientFor(null)})).rejects.toThrow('changed')
})
it('queries the library on the server and reports unavailable storage honestly',async()=>{
  const client=clientFor({audiences:[]})
  await loadMarketingAudiences(org,'  buyers ',20,{client})
  expect(client.rpc).toHaveBeenCalledWith('marketing_audience_library',{p_org:org,p_search:'buyers',p_offset:20})
  client.rpc.mockResolvedValue({error:{code:'PGRST202'}})
  await expect(loadMarketingAudiences(org,'',0,{client})).rejects.toThrow('not enabled')
  await expect(loadMarketingAudiences('unknown','',0,{client})).rejects.toThrow('workspace')
})
it('requires a saved reviewed audience and rejects empty or wrong-scope recipient receipts',async()=>{
  const client=clientFor({recipientIds:[id(10)],audienceId:audience.id,revision:4})
  const args={organisationId:org,audience,channel:'email',subscriptionId:id(5),resolve:true,reviewHash:'fresh-hash'}
  await expect(previewMarketingAudience({...args,reviewHash:null},{client})).rejects.toThrow('review')
  expect(client.rpc).not.toHaveBeenCalled()
  const selected=await previewMarketingAudience(args,{client})
  expect(selected.recipientIds).toEqual([id(10)])
  expect(client.rpc).toHaveBeenCalledWith('marketing_audience_preview',expect.objectContaining({p_org:org,p_audience:audience.id,p_revision:4,p_review_hash:'fresh-hash',p_resolve:true,p_subscription:id(5)}))
  for(const data of [{recipientIds:[],audienceId:audience.id,revision:4},{recipientIds:[id(10)],audienceId:id(99),revision:4},{recipientIds:[id(10)],audienceId:audience.id,revision:3}]){
    client.rpc.mockResolvedValueOnce({data})
    await expect(previewMarketingAudience(args,{client})).rejects.toThrow('could not be confirmed')
  }
})
it('attaches only to the scoped campaign and confirms the association receipt',async()=>{
  const client=clientFor({audience_id:audience.id})
  await attachCampaignAudience(org,campaign,audience.id,{client})
  expect(client.calls[1]).toMatchObject({table:'marketing_campaign_audiences',update:{audience_id:audience.id},eq:[['organisation_id',org],['campaign_id',campaign],['audience_id',audience.id]]})
  expect(client.calls[1].update.organisation_id).toBeUndefined()
  await expect(attachCampaignAudience(org,campaign,audience.id,{client:clientFor(null)})).rejects.toThrow()
})
