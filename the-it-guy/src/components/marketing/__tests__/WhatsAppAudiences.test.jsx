// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WhatsAppAudiences, { CampaignAudiencePicker } from '../WhatsAppAudiences'
import MetaCampaignRoutes, { WhatsAppCampaignReplyNotice } from '../MetaCampaignRoutes'
import { CreateWhatsAppCampaign } from '../WhatsAppCampaigns'
import { audienceDraft, replyPlan } from '../../../../../supabase/functions/_shared/whatsappAudience.js'

const mocks=vi.hoisted(()=>({request:vi.fn(),campaign:vi.fn(),org:'agency-one',viewer:'manager-one',canManage:true}))
vi.mock('../../../services/metaIntegrationService',()=>({metaIntegrationRequest:mocks.request}))
vi.mock('../../../services/whatsappCampaignService',()=>({whatsappCampaignRequest:mocks.campaign}))
vi.mock('../../../hooks/useMetaWorkspace',()=>({useMetaWorkspace:()=>({organisationId:mocks.org,accessScope:`${mocks.org}:${mocks.viewer}`,canManage:mocks.canManage,loading:false,error:'',assignees:[{id:'agent-one',name:'Amy Agent'}]})}))
vi.mock('../../../context/AuthSessionContext',()=>({useAuthSession:()=>({authState:{currentWorkspace:{id:mocks.org}}})}))
const filters={kind:'buyer',areas:['claremont'],stages:[],agentId:null,includeClosed:false}
const audience={id:'audience-one',version:3,name:'Claremont buyers',filters}
const row={record_id:'record-one',kind:'buyer',contact_id:'contact-one',phone:'27821234567',name:'Test Buyer',stage:'qualified',owner_id:'agent-one',state:{org:'agency-one',phone:'27821234567',owner:'agent-one'},eligible:true,phone_matches:1}
const preview={matched:1,eligiblePhones:1,invalidPhones:0,ambiguousRecords:0,rows:[row],hasMore:false}
const form={id:'form-one',formId:'400',name:'Property enquiry',leadType:'buyer'}
beforeEach(()=>{
 mocks.org='agency-one';mocks.viewer='manager-one';mocks.canManage=true
 mocks.request.mockReset().mockImplementation(async(_org,action)=>action==='audience_list'?{audiences:[audience]}:action==='audience_preview'?preview:action==='meta_routes_list'?{routes:[],forms:[form]}:action==='campaign_reply_status'?{routes:[]}:{})
 mocks.campaign.mockReset().mockImplementation(async(_org,action,payload)=>action==='workspace'?{campaigns:[],contacts:[{id:row.contact_id,full_name:row.name,phone:row.phone,consent_status:'opted_in'}],senders:[]}:action==='save'?{campaign:{...payload.campaign,id:'draft-one',revision:1,status:'draft'}}:{templates:[]})
})
afterEach(()=>cleanup())

it('saves exact CRM filters without granting permission and previews current membership',async()=>{
 render(<WhatsAppAudiences/>)
 fireEvent.click(await screen.findByRole('button',{name:'New audience'}))
 fireEvent.change(screen.getByLabelText('Audience name'),{target:{value:'Northern buyers'}})
 fireEvent.change(screen.getByLabelText(/Areas \(comma separated\)/),{target:{value:'Sandton, Rosebank'}})
 fireEvent.change(screen.getByLabelText(/Stages \(comma separated\)/),{target:{value:'Qualified'}})
 fireEvent.click(screen.getByRole('button',{name:'Save audience'}))
 await waitFor(()=>expect(mocks.request).toHaveBeenCalledWith('agency-one','audience_save',expect.objectContaining({audience:{name:'Northern buyers',filters:{...filters,areas:['sandton','rosebank'],stages:['qualified']}}})))
 expect(mocks.request.mock.calls.some(call=>call[1]==='save_contact')).toBe(false)
 fireEvent.click(await screen.findByRole('button',{name:'Preview Claremont buyers'}))
 await screen.findByText(/1 CRM records · 1 phones with campaign permission/)
})

it('requires an explicit choice for a shared phone and excludes unpermitted records',async()=>{
 const apply=vi.fn(),second={...row,record_id:'record-two',name:'Other matching lead',phone_matches:2}
 mocks.request.mockImplementation(async(_org,action)=>action==='audience_list'?{audiences:[audience]}:{...preview,matched:3,ambiguousRecords:1,rows:[{...row,phone_matches:2},second,{...row,record_id:'no-permission',contact_id:null,name:'Unpermitted lead',phone:'27820000000',eligible:false}]})
 render(<CampaignAudiencePicker onApply={apply}/>)
 fireEvent.change(await screen.findByLabelText('Saved audience'),{target:{value:audience.id}})
 fireEvent.click(screen.getByRole('button',{name:'Preview saved audience'}))
 await screen.findByText(/3 CRM records/)
 expect(screen.getByRole('button',{name:'Use 0 selected recipients'}).disabled).toBe(true)
 expect(screen.getByRole('checkbox',{name:/Unpermitted lead/}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('checkbox',{name:/Other matching lead/}))
 fireEvent.click(screen.getByRole('button',{name:'Use 1 selected recipients'}))
 expect(apply).toHaveBeenCalledWith({contact_ids:['contact-one'],audience_plan:{audienceId:audience.id,version:3,mode:'record_owner',agentId:null,targets:[{contactId:row.contact_id,recordId:second.record_id,kind:'buyer',state:row.state}]}})
})

it('never silently truncates a large audience and clears a preview when the search changes',async()=>{
 mocks.request.mockImplementation(async(_org,action)=>action==='audience_list'?{audiences:[audience]}:{...preview,matched:501,hasMore:false})
 render(<CampaignAudiencePicker onApply={vi.fn()}/>)
 fireEvent.change(await screen.findByLabelText('Saved audience'),{target:{value:audience.id}})
 fireEvent.click(screen.getByRole('button',{name:'Preview saved audience'}))
 await screen.findByText(/More than 500 records/)
 expect(screen.getByRole('button',{name:'Use 1 selected recipients'}).disabled).toBe(true)
 fireEvent.change(screen.getByLabelText('Narrow by name or phone'),{target:{value:'Test'}})
 expect(screen.queryByText(/501 CRM records/)).toBeNull()
 expect(screen.getByRole('button',{name:'Use 0 selected recipients'}).disabled).toBe(true)
})

it('keeps recruitment replies in management and creates a Meta campaign route with an exact ID',async()=>{
 render(<MetaCampaignRoutes organisationId="agency-one"/>)
 fireEvent.click(await screen.findByRole('button',{name:'Add campaign route'}))
 fireEvent.change(screen.getByLabelText(/Meta campaign ID/),{target:{value:'555555'}})
 fireEvent.change(screen.getByLabelText('Campaign label (optional)'),{target:{value:'Recruitment campaign'}})
 fireEvent.change(screen.getByLabelText('Route new leads to'),{target:{value:'agent-one'}})
 fireEvent.change(screen.getByLabelText('Lead destination'),{target:{value:'recruitment'}})
 expect(screen.queryByLabelText('Route new leads to')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Save campaign route'}))
 await waitFor(()=>expect(mocks.request).toHaveBeenCalledWith('agency-one','meta_routes_save',{routeId:null,version:null,route:{formMappingId:form.id,campaignId:'555555',campaignName:'Recruitment campaign',leadType:'recruitment',agentId:null,branchId:null}}))
})

it('discards old previews and routing notices on workspace or conversation changes',async()=>{
 let resolve
 mocks.request.mockImplementation((_org,action)=>action==='audience_list'?Promise.resolve({audiences:[audience]}):new Promise(done=>{resolve=done}))
 const view=render(<WhatsAppAudiences/>)
 fireEvent.click(await screen.findByRole('button',{name:'Preview Claremont buyers'}))
 await waitFor(()=>expect(resolve).toBeTypeOf('function'))
 mocks.org='agency-two';mocks.request.mockResolvedValue({audiences:[]})
 view.rerender(<WhatsAppAudiences/>)
 await screen.findByText('No saved audiences yet.')
 await act(async()=>resolve(preview))
 expect(screen.queryByText(/Test Buyer/)).toBeNull()
 cleanup()
 mocks.request.mockResolvedValue({routes:[{status:'needs_review',reason:'Existing CRM link preserved; review the campaign reply',created_at:'now'}]})
 const notice=render(<WhatsAppCampaignReplyNotice organisationId="agency-two" conversationId="one" accessScope="scope"/>)
 await screen.findByText('Existing CRM link preserved; review the campaign reply')
 mocks.request.mockResolvedValue({routes:[]})
 notice.rerender(<WhatsAppCampaignReplyNotice organisationId="agency-two" conversationId="two" accessScope="scope"/>)
 expect(screen.queryByText('Existing CRM link preserved; review the campaign reply')).toBeNull()
})

it('hides management controls after permission changes and keeps a failed save reviewable',async()=>{
 const view=render(<WhatsAppAudiences/>)
 fireEvent.click(await screen.findByRole('button',{name:'Edit Claremont buyers'}))
 mocks.request.mockRejectedValueOnce(Error('Audience changed. Refresh before saving'))
 fireEvent.click(screen.getByRole('button',{name:'Save audience'}))
 await screen.findByText('Audience changed. Refresh before saving')
 expect(screen.getByLabelText('Audience name').value).toBe(audience.name)
 mocks.canManage=false;view.rerender(<WhatsAppAudiences/>)
 expect(screen.queryByLabelText('Audience name')).toBeNull()
 expect(screen.getByText(/Agency management can create CRM audiences/)).toBeTruthy()
})

it('puts reviewed audience targets in the real campaign draft without template parameters',async()=>{
 render(<CreateWhatsAppCampaign onBack={vi.fn()}/>)
 fireEvent.change(await screen.findByLabelText('Campaign name'),{target:{value:'Audience campaign'}})
 fireEvent.click(screen.getByRole('button',{name:'Next'}))
 fireEvent.change(await screen.findByLabelText('Saved audience'),{target:{value:audience.id}})
 fireEvent.click(screen.getByRole('button',{name:'Preview saved audience'}))
 fireEvent.click(await screen.findByRole('button',{name:'Use 1 selected recipients'}))
 fireEvent.click(screen.getByRole('button',{name:'Save draft'}))
 await screen.findByText('Draft saved.')
 const saved=mocks.campaign.mock.calls.find(call=>call[1]==='save')[2].campaign
 expect(saved.contact_ids).toEqual(['contact-one'])
 expect(saved.audience_plan.targets[0].recordId).toBe('record-one')
 expect(saved.parameter_values).toEqual({})
})

it('normalizes audience definitions and rejects invalid routes or unsafe recipient counts',()=>{
 expect(audienceDraft({name:' Buyers ',filters:{...filters,areas:['Claremont','claremont']}}).filters.areas).toEqual(['claremont'])
 expect(()=>audienceDraft({name:'Recruitment',filters:{kind:'recruitment',agentId:'00000000-0000-4000-8000-000000000001'}})).toThrow(/management/)
 expect(()=>replyPlan({mode:'agent',targets:[]})).toThrow(/agent/)
 expect(()=>replyPlan({mode:'agency_queue',targets:Array(501).fill({})})).toThrow(/500/)
})
