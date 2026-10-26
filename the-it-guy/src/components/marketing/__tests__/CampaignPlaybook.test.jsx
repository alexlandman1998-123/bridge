// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
const mocks=vi.hoisted(()=>({save:vi.fn(),prepare:vi.fn(),brief:vi.fn()}))
vi.mock('../../../services/campaignPlaybookService',()=>({saveCampaignPlaybook:mocks.save}))
vi.mock('../../../services/campaignPackService',()=>({handoffCampaignDraft:mocks.prepare,loadCampaignChannelBrief:mocks.brief}))
vi.mock('../MarketingAudiences',()=>({CampaignAudience:()=> <div>Live campaign audience</div>}))
import CampaignPlaybook from '../CampaignPlaybook'
import { createCampaignPlaybook } from '../../../services/campaignPlaybookModel'
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const campaign={id:id(1),organisation_id:id(2),revision:1,name:'Seller valuations',goal:'seller_leads',objective:'Book valuation conversations',offer:'A complimentary valuation',area:'Gardens',start_date:'2026-10-25',end_date:'2026-11-24',planned_channels:['email','whatsapp'],channel_content:{email:{title:'Your next move',body:'Understand what your home is worth.'},whatsapp:{title:'Let’s talk',body:'Planning a move?'}}}
const mount=(props={})=>render(<MemoryRouter><CampaignPlaybook campaign={campaign} userId={id(3)} canEdit onSaved={vi.fn()} onEdit={vi.fn()} onTab={vi.fn()} {...props}/></MemoryRouter>)
beforeEach(()=>{mocks.save.mockResolvedValue({...campaign,revision:2});mocks.prepare.mockResolvedValue({id:id(20),status:'draft'})})
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals()})
it('proposes one coordinated sequence and blocks draft creation until it has been saved',async()=>{
  mount()
  expect(screen.getByText('Suggested plan · review and save')).toBeTruthy()
  expect(screen.getAllByRole('button',{name:'Prepare draft'})).toHaveLength(3)
  expect(screen.getAllByRole('button',{name:'Prepare draft'}).every(button=>button.disabled)).toBe(true)
  expect(await screen.findByText('Live campaign audience')).toBeTruthy()
  expect(mocks.prepare).not.toHaveBeenCalled()
})
it('saves personalised step copy, relative days and the shared response destination',async()=>{
  const saved=vi.fn()
  mount({onSaved:saved})
  fireEvent.change(screen.getByLabelText('Response route'),{target:{value:'url'}})
  fireEvent.change(screen.getByLabelText('Response destination'),{target:{value:'https://example.test/valuation'}})
  fireEvent.click(screen.getAllByRole('button',{name:'Personalise step'})[0])
  fireEvent.change(screen.getByLabelText('Step 1 day'),{target:{value:'1'}})
  fireEvent.change(screen.getByLabelText('Step 1 message'),{target:{value:'Your local valuation. {response}'}})
  fireEvent.click(screen.getByRole('button',{name:'Save playbook'}))
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(campaign.organisation_id,campaign,expect.objectContaining({response:expect.objectContaining({kind:'url',value:'https://example.test/valuation'}),steps:expect.arrayContaining([expect.objectContaining({day:1,body:'Your local valuation. {response}'})])})))
  expect(saved).toHaveBeenCalledTimes(1)
})
it('prepares a saved step once at a time and opens the existing channel review flow',async()=>{
  const stored={...campaign,playbook:createCampaignPlaybook(campaign)}
  mount({campaign:stored})
  fireEvent.click(screen.getAllByRole('button',{name:'Prepare draft'})[0])
  expect(await screen.findByRole('link',{name:'Open draft'})).toHaveProperty('href',expect.stringContaining('section=email&view=create'))
  expect(mocks.prepare).toHaveBeenCalledWith(campaign.organisation_id,id(3),stored,'email',stored.playbook.steps[0].id)
  expect(mocks.save).not.toHaveBeenCalled()
})
it('keeps failed saves and unsaved content visible for retry',async()=>{
  mocks.save.mockRejectedValue(new Error('Playbook storage is not enabled yet.'))
  mount()
  fireEvent.change(screen.getByLabelText('Call to action'),{target:{value:'Book my valuation'}})
  fireEvent.click(screen.getByRole('button',{name:'Save playbook'}))
  expect((await screen.findByRole('alert')).textContent).toContain('not enabled')
  expect(screen.getByLabelText('Call to action').value).toBe('Book my valuation')
  expect(screen.getAllByRole('button',{name:'Prepare draft'}).every(button=>button.disabled)).toBe(true)
})
it('preserves saved step copy while editing and requires saving before another handoff',async()=>{
  mount({campaign:{...campaign,playbook:createCampaignPlaybook(campaign)}})
  fireEvent.click(screen.getAllByRole('button',{name:'Personalise step'})[0])
  fireEvent.change(screen.getByLabelText('Step 1 title'),{target:{value:'Updated subject'}})
  expect(screen.getByText('Unsaved changes')).toBeTruthy()
  expect(screen.getAllByRole('button',{name:'Prepare draft'}).every(button=>button.disabled)).toBe(true)
})
it('allows read-only campaign members to inspect the copy without edit or send actions',async()=>{
  mount({campaign:{...campaign,playbook:createCampaignPlaybook(campaign)},canEdit:false})
  expect(screen.queryByRole('button',{name:'Save playbook'})).toBeNull()
  expect(screen.queryByRole('button',{name:'Prepare draft'})).toBeNull()
  fireEvent.click(screen.getAllByRole('button',{name:'View copy'})[0])
  expect(screen.getByLabelText('Step 1 message').value).toBe('Understand what your home is worth.')
  expect(screen.getByLabelText('Step 1 message').disabled).toBe(true)
})

it('opens a visible existing step draft for a read-only viewer without preparing another',async()=>{
  const {webcrypto}=await import('node:crypto')
  vi.stubGlobal('crypto',webcrypto)
  const {campaignHandoffId}=await import('../../../services/campaignPackModel')
  const book=createCampaignPlaybook(campaign), step=book.steps[0]
  const draftId=await campaignHandoffId(campaign.organisation_id,campaign.id,campaign.revision,`email:playbook:${step.id}`)
  mount({campaign:{...campaign,playbook:book},canEdit:false,workspace:{activities:[{campaign_id:campaign.id,channel:'email',email_campaign_id:draftId}],channels:{email:{data:[{id:draftId,status:'draft'}]},whatsapp:{data:[]}}}})
  expect((await screen.findByRole('link',{name:'Open draft'})).href).toContain(draftId)
  expect(mocks.prepare).not.toHaveBeenCalled()
})
it('does not refresh another workspace after an in-flight save finishes following navigation',async()=>{
  let finish
  mocks.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  const onSaved=vi.fn(),view=mount({onSaved})
  fireEvent.click(screen.getByRole('button',{name:'Save playbook'}))
  view.unmount()
  await act(async()=>finish({...campaign,revision:2}))
  expect(onSaved).not.toHaveBeenCalled()
})

it('requires a fresh review when the campaign brief changes after the playbook was saved',()=>{
  const book=createCampaignPlaybook(campaign)
  mount({campaign:{...campaign,revision:2,playbook:book}})
  expect(screen.getByText('Review required')).toBeTruthy()
  expect(screen.getByText(/Review the response route and every message/)).toBeTruthy()
  expect(screen.getAllByRole('button',{name:'Prepare draft'}).every(button=>button.disabled)).toBe(true)
  expect(screen.getByRole('button',{name:'Save playbook'}).disabled).toBe(false)
})
