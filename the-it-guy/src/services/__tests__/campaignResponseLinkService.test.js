import { beforeEach, expect, it, vi } from 'vitest'
const runtime=vi.hoisted(()=>({auth:{getUser:vi.fn()},rpc:vi.fn(),from:vi.fn(),calls:[],data:{}}))
vi.mock('../../lib/supabaseClient',()=>({isSupabaseConfigured:true,supabase:runtime}))
vi.mock('../agencyPublicIntakeLinkService',()=>({buildAgencyPublicIntakeUrls:({slug})=>({intakeUrl:`https://app.arch9.co.za/intake/${slug}`})}))
import { loadCampaignResponseLinks, createCampaignResponseLink, revokeCampaignResponseLink } from '../campaignResponseLinkService'
const id=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const org=id(1),user=id(2),campaign={id:id(3),organisation_id:org,revision:2,created_by:user}
const intake={id:id(4),organisation_id:org,slug:'agency',heading:'Ask our agency',status:'active',enabled_intents:['buy','sell'],metadata_json:{},disabled_at:null}
const response={id:id(5),organisation_id:org,campaign_id:campaign.id,campaign_revision:1,intake_link_id:intake.id,purpose:'valuation',token:id(6),follow_up_days:1,created_at:'2026-10-25T08:00:00Z',disabled_at:null}
beforeEach(()=>{
  vi.clearAllMocks();runtime.calls=[]
  runtime.auth.getUser.mockResolvedValue({data:{user:{id:user}}})
  runtime.data={marketing_campaigns:{data:campaign},agency_public_intake_links:{data:[intake]},marketing_campaign_response_links:{data:[response]}}
  runtime.rpc.mockResolvedValue({data:{...response,campaign_revision:2,slug:intake.slug}})
  runtime.from.mockImplementation(table=>{
    const q={};let updating=false
    for(const method of ['select','eq','in','is','order','limit','update'])q[method]=(...args)=>{runtime.calls.push([table,method,...args]);if(method==='update')updating=true;return q}
    q.maybeSingle=async()=>updating?{data:{id:response.id,disabled_at:'2026-10-25T09:00:00Z'}}:runtime.data[table]
    q.then=(resolve,reject)=>Promise.resolve(runtime.data[table]).then(resolve,reject)
    return q
  })
})
it('loads eligible forms and current/earlier links with agency/user scope without creating a capability',async()=>{
  const result=await loadCampaignResponseLinks(org,user,campaign)
  expect(result.intakeLinks[0]).toMatchObject({id:intake.id,label:'Ask our agency',enabledIntents:['buy','sell']})
  expect(result.links[0]).toMatchObject({status:'active',campaignRevision:1})
  expect(result.links[0].url).toContain(`campaignResponse=${response.token}`)
  expect(result.links[0].url).toContain('intent=sell')
  expect(result.links[0].token).toBeUndefined()
  expect(runtime.rpc).not.toHaveBeenCalled()
  expect(runtime.calls).toContainEqual(['marketing_campaign_response_links','eq','organisation_id',org])
  expect(runtime.calls).toContainEqual(['marketing_campaign_response_links','eq','campaign_id',campaign.id])
})
it('filters out another agent digital card and foreign rows from form choices',async()=>{
  runtime.data.agency_public_intake_links={data:[intake,{...intake,id:id(7),default_assigned_agent_id:id(8),metadata_json:{surface:'agent_digital_card'}},{...intake,id:id(9),organisation_id:id(10)}]}
  expect((await loadCampaignResponseLinks(org,user,campaign)).intakeLinks.map(row=>row.id)).toEqual([intake.id])
})
it('creates only an explicit matching saved revision and returns a shareable response URL',async()=>{
  const result=await createCampaignResponseLink(org,user,campaign,{intakeLinkId:intake.id,purpose:'buyer',followUpDays:3})
  expect(runtime.rpc).toHaveBeenCalledWith('marketing_campaign_create_response_link',{p_org:org,p_campaign:campaign.id,p_revision:2,p_intake:intake.id,p_purpose:'buyer',p_followup_days:3})
  expect(result.url).toContain('campaignResponse=')
  await expect(createCampaignResponseLink(org,user,campaign,{intakeLinkId:'invalid',purpose:'buyer'})).rejects.toThrow('Choose an active')
})
it('rejects changed accounts/revisions and mismatched write results without exposing a URL',async()=>{
  runtime.auth.getUser.mockResolvedValueOnce({data:{user:{id:id(99)}}})
  await expect(loadCampaignResponseLinks(org,user,campaign)).rejects.toThrow('account changed')
  runtime.data.marketing_campaigns={data:{...campaign,revision:3}}
  await expect(createCampaignResponseLink(org,user,campaign,{intakeLinkId:intake.id,purpose:'seller'})).rejects.toThrow('campaign changed')
  expect(runtime.rpc).not.toHaveBeenCalled()
  runtime.data.marketing_campaigns={data:campaign}
  runtime.rpc.mockResolvedValue({data:{...response,campaign_revision:2,organisation_id:id(99),slug:'foreign'}})
  await expect(createCampaignResponseLink(org,user,campaign,{intakeLinkId:intake.id,purpose:'seller'})).rejects.toThrow('could not be matched')
})
it('revokes an earlier-revision response link under the current campaign scope without deleting CRM work',async()=>{
  const link={id:response.id,status:'active',campaignRevision:1,url:'https://example.test/form'}
  const result=await revokeCampaignResponseLink(org,user,campaign,link)
  expect(result.status).toBe('disabled')
  expect(runtime.calls).toContainEqual(['marketing_campaign_response_links','eq','campaign_id',campaign.id])
  expect(runtime.calls).toContainEqual(['marketing_campaign_response_links','eq','id',response.id])
  expect(runtime.calls.some(call=>['leads','tasks','marketing_campaign_enquiries'].includes(call[0]))).toBe(false)
})
it('reports missing response storage without a browser-storage fallback',async()=>{
  runtime.data.marketing_campaign_response_links={error:{code:'42P01'}}
  await expect(loadCampaignResponseLinks(org,user,campaign)).rejects.toThrow('not enabled')
})
