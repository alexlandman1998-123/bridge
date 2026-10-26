// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
const runtime=vi.hoisted(()=>({identity:vi.fn(),copy:vi.fn()}))
vi.mock('../../../lib/supabaseClient',()=>({supabase:null,isSupabaseConfigured:false}))
vi.mock('../../../services/campaignReuseService',async original=>({...await original(),loadCampaignAgentIdentity:runtime.identity,copyCampaignToAgent:runtime.copy}))
import CampaignCopyDialog from '../CampaignCopyDialog'
const source={id:'source',organisation_id:'agency',revision:1,created_by:'creator',name:'Gardens valuations',goal:'seller_leads',objective:'Find sellers',area:'Gardens',planned_channels:['email'],channel_content:{email:{title:'Gardens homeowners',body:'A free valuation in Gardens.'}}}
const members=[{userId:'creator',fullName:'Alex Smith'},{userId:'target',fullName:'Sarah Jacobs'},{userId:'other',fullName:'Other Agent'},{userId:'pending',fullName:'Pending Agent',membershipStatus:'pending'}]
const mount=(props={})=>render(<CampaignCopyDialog organisationId="agency" source={source} members={members} onClose={vi.fn()} onCopied={vi.fn()} {...props}/>)
beforeEach(()=>{runtime.identity.mockResolvedValue({name:'Sarah Jacobs',email:'sarah@example.test',areas:['Sea Point']});runtime.copy.mockResolvedValue({id:'new',created_by:'target'})})
afterEach(()=>{cleanup();vi.resetAllMocks()})
const choose=async()=>{fireEvent.change(screen.getByLabelText('Receiving agent'),{target:{value:'target'}});await screen.findByText(/Public agent details loaded/)}
it('requires a separate review, personalises content and saves only a receiving-agent draft',async()=>{
 const copied=vi.fn();mount({onCopied:copied});await choose()
 expect(screen.getByLabelText('Service area').value).toBe('Sea Point')
 expect(screen.queryByRole('option',{name:'Pending Agent'})).toBeNull();expect(screen.queryByRole('option',{name:'Alex Smith'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Review personalised copy'}))
 expect(runtime.copy).not.toHaveBeenCalled()
 expect(screen.getByLabelText('Message · Email').value).toContain('Sarah Jacobs')
 expect(screen.getByLabelText('Message · Email').value).toContain('Sea Point')
 fireEvent.change(screen.getByLabelText('Message · Email'),{target:{value:'A reviewed invitation from Sarah.'}})
 fireEvent.click(screen.getByRole('button',{name:'Create agent draft'}))
 await waitFor(()=>expect(copied).toHaveBeenCalled())
 expect(runtime.copy).toHaveBeenCalledWith(expect.objectContaining({targetId:'target',requestId:expect.any(String),draft:expect.objectContaining({channel_content:{email:expect.objectContaining({body:'A reviewed invitation from Sarah.'})}})}))
 expect(copied).toHaveBeenCalledWith({id:'new',created_by:'target'})
})
it('keeps reviewed content and request identity across a failed save and retry',async()=>{
 runtime.copy.mockRejectedValueOnce(new Error('Temporary failure'));mount();await choose()
 fireEvent.click(screen.getByRole('button',{name:'Review personalised copy'}));fireEvent.click(screen.getByRole('button',{name:'Create agent draft'}))
 await screen.findByText('Temporary failure')
 const request=runtime.copy.mock.calls[0][0].requestId
 fireEvent.click(screen.getByRole('button',{name:'Create agent draft'}))
 await act(async()=>{})
 expect(runtime.copy.mock.calls[1][0].requestId).toBe(request)
})
it('discards late public-profile results after a different receiving agent is selected',async()=>{
 let finish;runtime.identity.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValueOnce({name:'Other Agent',email:'other@example.test',areas:['City Bowl']})
 mount();fireEvent.change(screen.getByLabelText('Receiving agent'),{target:{value:'target'}});fireEvent.change(screen.getByLabelText('Receiving agent'),{target:{value:'other'}})
 await screen.findByText(/Public agent details loaded/)
 await act(async()=>finish({name:'Stale Name',email:'stale@example.test',areas:['Old Area']}))
 expect(screen.getByLabelText('Public agent name').value).toBe('Other Agent');expect(screen.getByLabelText('Service area').value).toBe('City Bowl')
})
it('allows explicitly reviewed public details when a public profile is unavailable',async()=>{
 runtime.identity.mockResolvedValue(null);mount();fireEvent.change(screen.getByLabelText('Receiving agent'),{target:{value:'target'}})
 await screen.findByText(/No active public agent card found/)
 fireEvent.change(screen.getByLabelText('Service area'),{target:{value:'Sea Point'}})
 fireEvent.change(screen.getByLabelText('Response destination'),{target:{value:'sarah@example.test'}})
 fireEvent.click(screen.getByRole('button',{name:'Review personalised copy'}))
 expect(screen.getByRole('button',{name:'Create agent draft'})).toBeTruthy()
})
