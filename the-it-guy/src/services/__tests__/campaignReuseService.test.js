import { expect, it, vi } from 'vitest'
vi.mock('../../lib/supabaseClient',()=>({supabase:null,isSupabaseConfigured:false}))
const profile=vi.hoisted(()=>vi.fn())
vi.mock('../agencyPublicIntakeLinkService',()=>({loadAgencyAgentCardLink:profile}))
import { copyCampaignToAgent, loadCampaignAgentIdentity, personaliseCampaignForAgent } from '../campaignReuseService'
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const source={id:id(1),organisation_id:id(2),revision:4,created_by:id(3),name:'Seller valuations',goal:'seller_leads',objective:'Find sellers in Gardens',audience:'Gardens homeowners',offer:'Free valuation',area:'Gardens',planned_channels:['email'],channel_content:{email:{title:'Alex · Gardens',body:'Alex in Gardens: alex@example.test',timing:'Tomorrow'}},campaign_builder:{source:{agentName:'Alex',destination:'alex@example.test'}}}
const form={name:'Sarah valuations',area:'Sea Point',agentName:'Sarah',response:{kind:'email',value:'sarah@example.test',label:'Book a valuation'}}
it('personalises copy, routing and area without carrying source ownership, assets or recipients',()=>{
 const draft=personaliseCampaignForAgent({...source,status:'active',recipientIds:[id(9)],cover_url:'https://image.test/p.jpg',planned_budget:100},form)
 expect(draft.channel_content.email).toMatchObject({title:'Sarah · Sea Point',body:'Sarah in Sea Point: sarah@example.test',timing:''})
 expect(draft.objective).toBe('Find sellers in Sea Point');expect(draft.start_date).toBeNull();expect(draft.end_date).toBeNull()
 expect(Object.keys(draft).sort()).toEqual(['area','audience','channel_content','end_date','name','objective','offer','start_date','playbook'].sort())
 expect(draft.playbook).toMatchObject({sourceRevision:0,response:{kind:'email',value:'sarah@example.test'}})
})
it('keeps reusable playbook steps but replaces the response destination and requires fresh review',()=>{
 const book={version:1,sourceRevision:4,response:{kind:'email',label:'Book a valuation',value:'alex@example.test'},steps:[{id:id(10),channel:'email',day:3,title:'Gardens insight',body:'Alex: alex@example.test'}],followUp:[{id:id(11),title:'Call {contact}',days:1}]}
 const draft=personaliseCampaignForAgent({...source,playbook:book},form)
 expect(draft.playbook.sourceRevision).toBe(0)
 expect(draft.playbook.response.value).toBe('sarah@example.test')
 expect(draft.playbook.steps[0]).toMatchObject({title:'Sea Point insight',body:'Sarah: {response}'})
 expect(draft.playbook.followUp[0].title).toBe('Call {contact}')
 expect(JSON.stringify(book)).toContain('alex@example.test')
})
it('validates the chosen response route, dates and bounded copy before persistence',()=>{
 expect(()=>personaliseCampaignForAgent(source,{...form,response:{...form.response,kind:'url',value:'javascript:alert(1)'}})).toThrow('HTTPS')
 expect(()=>personaliseCampaignForAgent(source,{...form,startDate:'2026-10-30',endDate:'2026-10-01'})).toThrow()
 expect(()=>personaliseCampaignForAgent(source,{...form,area:''})).toThrow('service area')
})
it('uses known directory identity for plain campaigns without replacing parts of other names',()=>{
 const plain={...source,campaign_builder:null,channel_content:{email:{title:'Alex in Gardens',body:'Ask Alex at alex@example.test about Alexandra Road in Gardens.'}}}
 const draft=personaliseCampaignForAgent(plain,{...form,sourceOwnerName:'Alex',sourceOwnerEmail:'alex@example.test'})
 expect(draft.channel_content.email.body).toBe('Ask Sarah at sarah@example.test about Alexandra Road in Sea Point.')
})
it('sends only reviewed portable fields with a stable request ID and verifies ownership in the receipt',async()=>{
 const draft=personaliseCampaignForAgent(source,form)
 const saved={id:id(5),organisation_id:id(2),created_by:id(4),copied_from_id:id(1),copied_from_revision:4,status:'draft'}
 const client={rpc:vi.fn().mockResolvedValue({data:saved})}
 const args={organisationId:id(2),source,targetId:id(4),requestId:id(5),draft:{...draft,recipients:[id(90)],campaign_builder:source.campaign_builder}}
 expect(await copyCampaignToAgent(args,{client})).toEqual(saved)
 expect(client.rpc).toHaveBeenCalledWith('marketing_campaign_copy',expect.objectContaining({p_target:id(4),p_id:id(5),p_revision:4,p_draft:draft}))
 client.rpc.mockResolvedValueOnce({data:{...saved,created_by:id(9)}})
 await expect(copyCampaignToAgent(args,{client})).rejects.toThrow('confirmed')
 client.rpc.mockResolvedValueOnce({error:{code:'PGRST202'}})
 await expect(copyCampaignToAgent(args,{client})).rejects.toThrow('not enabled')
})
it('reads public agent identity only when the card is active and belongs to the chosen agency and agent',async()=>{
 profile.mockResolvedValueOnce({link:{status:'active',organisationId:id(2),defaultAssignedAgentId:id(4),agentDigitalCard:{agent:{name:'Sarah',email:'sarah@example.test'},profile:{serviceAreas:['Sea Point']}}}})
 expect(await loadCampaignAgentIdentity(id(2),id(4))).toMatchObject({name:'Sarah',areas:['Sea Point']})
 profile.mockResolvedValueOnce({link:{status:'active',organisationId:id(9),defaultAssignedAgentId:id(4)}})
 expect(await loadCampaignAgentIdentity(id(2),id(4))).toBeNull()
})
