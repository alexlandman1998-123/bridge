import { expect, it } from 'vitest'
import { activeCampaignMember, buildCampaignAgentOversight } from '../campaignAgentModel'
const now=new Date('2026-10-25T22:30:00Z')
const campaign={id:'campaign',name:'Seller valuations',created_by:'creator',status:'active',planned_channels:['email'],revision:1}
const members=[{userId:'creator',fullName:'Alex Smith',membershipStatus:'active'},{userId:'handler',fullName:'Sarah Jacobs',membershipStatus:'accepted'},{userId:'empty',fullName:'New Agent',membershipStatus:'active'},{userId:'pending',fullName:'Pending Agent',membershipStatus:'pending'}]
const workspace=(extra={})=>({campaigns:[campaign],activities:[],channels:{email:{data:[]},whatsapp:{data:[]}},...extra})
const entry={campaign_id:'campaign',lead_id:'lead',name:'Jane',ownerId:'handler',responded_at:'2026-10-25T08:00:00Z',awaitingContact:true,lead:{stage:'New Lead'},nextTask:{title:'Call Jane',due_date:'2026-10-25'}}
it('attributes follow-up work to the current CRM owner rather than the campaign creator',()=>{
 const model=buildCampaignAgentOversight(workspace(),members,{entries:[entry]},now)
 const handler=model.agents.find(row=>row.id==='handler'),creator=model.agents.find(row=>row.id==='creator')
 expect(handler).toMatchObject({untouched:1,overdue:1,supportCount:1,canReceive:true})
 expect(handler.plans).toHaveLength(0);expect(creator.plans).toHaveLength(1);expect(creator.supportCount).toBe(0)
 expect(model.totalUntouched).toBe(1)
 expect(model.agents.some(row=>row.id==='empty')).toBe(true);expect(model.agents.some(row=>row.id==='pending')).toBe(false)
})
it('retains historical campaign owners, isolates unassigned enquiries and does not permit inactive targets',()=>{
 const data=workspace({campaigns:[campaign,{...campaign,id:'old',created_by:'inactive'}]})
 const model=buildCampaignAgentOversight(data,[...members,{userId:'inactive',fullName:'Former Agent',membershipStatus:'inactive'}],{entries:[{...entry,ownerId:null}]},now)
 expect(model.agents.find(row=>row.id==='inactive').canReceive).toBe(false)
 expect(model.agents.find(row=>row.id==='unassigned').supportCount).toBe(1)
 expect(activeCampaignMember({userId:'pending',membershipStatus:'pending',status:'active'})).toBe(false)
})
it('deduplicates shared responders using their latest response and excludes closed leads from coaching',()=>{
 const model=buildCampaignAgentOversight(workspace({campaigns:[campaign,{...campaign,id:'c2'}]}),members,{entries:[entry,{...entry,campaign_id:'c2',responded_at:'2026-10-20T08:00:00Z',awaitingContact:false},{...entry,lead_id:'closed',lead:{status:'Won'}}]},now)
 expect(model.agents.find(row=>row.id==='handler').entries).toHaveLength(1)
 expect(model.totalUntouched).toBe(1)
 expect(model.reuse.enquiries[0].count).toBe(2)
})
it('does not manufacture zero enquiry or follow-up counts when sources are unavailable',()=>{
 const model=buildCampaignAgentOversight(workspace(),members,{entries:[entry],error:'Unavailable',tasksAvailable:false,activitiesAvailable:false},now)
 expect(model.totalUntouched).toBeNull();expect(model.agents[0].overdue).toBeNull();expect(model.enquiriesAvailable).toBe(false)
 expect(model.reuse.enquiries).toEqual([])
})
it('compares complete actual results within a single channel with a minimum delivery sample',()=>{
 const data=workspace({activities:[{campaign_id:'campaign',channel:'email',email_campaign_id:'email'},{campaign_id:'campaign',channel:'whatsapp',whatsapp_campaign_id:'wa'}],channels:{email:{data:[{id:'email',delivered:100,clicked:15}]},whatsapp:{data:[{id:'wa',delivered:10,read:9}]}}})
 const model=buildCampaignAgentOversight(data,members,{entries:[]},now)
 expect(model.reuse.email[0]).toMatchObject({count:15,delivered:100,rate:15})
 expect(model.reuse.whatsapp).toEqual([])
 data.channels.email.metricsError='Unavailable'
 expect(buildCampaignAgentOversight(data,members,{entries:[]},now).reuse.email).toEqual([])
})
