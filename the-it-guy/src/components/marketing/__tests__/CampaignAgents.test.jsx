// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
const runtime=vi.hoisted(()=>({directory:vi.fn(),enquiries:vi.fn()}))
vi.mock('../../../services/organizationService',()=>({getOrganizationProfile:runtime.directory}))
vi.mock('../../../services/campaignEnquiryService',()=>({loadCampaignOverviewEnquiries:runtime.enquiries}))
vi.mock('../CampaignCopyDialog',()=>({default:({source})=><div role="dialog">Copy draft: {source.name}</div>}))
import CampaignAgents from '../CampaignAgents'
const campaign={id:'campaign',name:'Seller valuations',created_by:'creator',status:'active',planned_channels:['email'],revision:1}
const members=[{userId:'creator',fullName:'Alex Smith'},{userId:'handler',fullName:'Sarah Jacobs'},{userId:'empty',fullName:'New Agent'}]
const entry={campaign_id:'campaign',lead_id:'lead',name:'Jane',ownerId:'handler',ownerName:'Sarah Jacobs',responded_at:'2026-10-24T08:00:00Z',awaitingContact:true,lead:{stage:'New Lead'},nextTask:{title:'Call Jane',due_date:'2020-01-01'}}
const workspace={campaigns:[campaign],activities:[],channels:{email:{data:[]},whatsapp:{data:[]}},canManage:true,userId:'manager'}
const mount=(props={})=>render(<MemoryRouter><CampaignAgents organisationId="agency" workspace={workspace} renderCampaign={row=><h2>{row.name}</h2>} {...props}/></MemoryRouter>)
beforeEach(()=>{runtime.directory.mockResolvedValue({members});runtime.enquiries.mockResolvedValue({entries:[entry],warnings:[],activitiesAvailable:true,tasksAvailable:true})})
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('shows untouched and overdue work on the responsible agent and opens the exact enquiry',async()=>{
 mount();const card=await screen.findByRole('button',{name:'View campaigns for Sarah Jacobs'})
 expect(card.querySelector('.mc-agent-coaching-stats').textContent).toContain('Untouched1')
 fireEvent.click(card)
 expect(screen.getByRole('link',{name:'Review enquiry'}).getAttribute('href')).toContain('enquiry=lead')
 expect(screen.getByText('No matching agent campaigns')).toBeTruthy()
})
it('filters agents who need support and preserves inactive-agent coaching visibility',async()=>{
 mount();await screen.findByRole('button',{name:'View campaigns for Sarah Jacobs'})
 fireEvent.change(screen.getByLabelText('Agent coaching focus'),{target:{value:'untouched'}})
 expect(screen.getByRole('button',{name:'View campaigns for Sarah Jacobs'})).toBeTruthy()
 expect(screen.queryByRole('button',{name:'View campaigns for Alex Smith'})).toBeNull()
 fireEvent.change(screen.getByLabelText('Agent coaching focus'),{target:{value:'inactive'}})
 expect(screen.getByRole('button',{name:'View campaigns for New Agent'})).toBeTruthy()
})
it('offers reviewable reuse from actual enquiry results and opens an agency template or an agent copy',async()=>{
 const share=vi.fn();mount({onMakeTemplate:share})
 await screen.findByRole('button',{name:'View campaigns for Alex Smith'})
 const library=screen.getByRole('region',{name:'Campaigns to reuse'})
 fireEvent.click(within(library).getByRole('button',{name:'Make agency template'}))
 expect(share).toHaveBeenCalledWith(campaign)
 fireEvent.click(within(library).getByRole('button',{name:'Copy to another agent'}))
 expect(screen.getByRole('dialog').textContent).toContain('Seller valuations')
})
it('retains campaign cards with honest unavailable enquiry counts and no invented rankings',async()=>{
 runtime.enquiries.mockRejectedValue(new Error('Enquiries not enabled.'));mount()
 await screen.findByText(/Enquiries not enabled/)
 expect(screen.getByRole('button',{name:'View campaigns for Alex Smith'}).querySelector('.mc-agent-coaching-stats').textContent).toContain('Untouched—')
 expect(screen.getByText(/Enquiry comparisons are unavailable/)).toBeTruthy()
})
it('does not load agency enquiry or directory data without manager access',async()=>{
 mount({workspace:{...workspace,canManage:false}})
 expect(screen.getByText('Agency manager access required')).toBeTruthy()
 expect(runtime.enquiries).not.toHaveBeenCalled();expect(runtime.directory).not.toHaveBeenCalled()
})
