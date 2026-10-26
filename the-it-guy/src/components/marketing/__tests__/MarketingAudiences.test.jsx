// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({load:vi.fn(),preview:vi.fn(),save:vi.fn(),archive:vi.fn(),link:vi.fn(),association:vi.fn()}))
vi.mock('../../../lib/supabaseClient',()=>({supabase:null}))
vi.mock('../../../lib/settingsApi',()=>({listOrganisationUsersForWorkspace:async()=>[]}))
vi.mock('../../../services/marketingAudienceService',async(importOriginal)=>({...(await importOriginal()),loadMarketingAudiences:mocks.load,previewMarketingAudience:mocks.preview,saveMarketingAudience:mocks.save,archiveMarketingAudience:mocks.archive,attachCampaignAudience:mocks.link,loadCampaignAudience:mocks.association}))
import MarketingAudiences, { CampaignAudience } from '../MarketingAudiences'
const id=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const org=id(1), definition={match:'all',rules:[{field:'role',operator:'in',values:['buyer']}],quietDays:0,excludeClosed:true}
const audience={id:id(2),name:'Ready buyers',description:'Local buyer relationships',visibility:'agency',created_by:id(3),revision:1,definition}
const library={audiences:[audience],actorId:id(3),canShare:true,total:1,subscriptionTypes:[{id:id(4),name:'Property updates'}]}
const preview={matched:3,emailEligible:1,whatsappEligible:2,recent:1,rows:[{contact_id:id(5),name:'Jane Doe',email:'jane@example.test',role:'buyer',stage:'New Lead',area:'Cape Town',email_reason:null,whatsapp_reason:'WhatsApp permission not recorded',last_contacted_at:null}],reviewHash:'hash',revision:1,audienceId:audience.id}
beforeEach(()=>{mocks.load.mockResolvedValue(library);mocks.preview.mockImplementation(async(args)=>args.resolve?{recipientIds:[id(20)],audienceId:audience.id,revision:1}:preview);mocks.save.mockResolvedValue(audience);mocks.association.mockResolvedValue(null)})
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('previews a shared live audience without running per-row audience queries',async()=>{
  render(<MarketingAudiences organisationId={org} />)
  await screen.findByText('Ready buyers')
  expect(mocks.preview).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Preview'}))
  await screen.findByText('Jane Doe')
  expect(screen.getByText('WhatsApp permission not recorded')).toBeTruthy()
  expect(screen.getByText('No recorded contact')).toBeTruthy()
  expect(mocks.preview).toHaveBeenCalledTimes(1)
})
it('requires reviewed eligibility, locks the Email category and resolves again before applying',async()=>{
  const apply=vi.fn()
  render(<MarketingAudiences organisationId={org} channel="email" subscriptionId={id(4)} onApply={apply} />)
  fireEvent.click(await screen.findByRole('button',{name:'Preview'}))
  await screen.findByText('Jane Doe')
  expect(screen.getByText('Property updates')).toBeTruthy()
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.getByRole('button',{name:'Use 1 recipient'}).disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'Use 1 recipient'}))
  await waitFor(()=>expect(apply).toHaveBeenCalledWith([id(20)],audience))
  expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({resolve:true,reviewHash:'hash',subscriptionId:id(4),channel:'email'}))
})
it('keeps a changed audience out of the draft and requires another preview',async()=>{
  const apply=vi.fn()
  mocks.preview.mockImplementation(async(args)=>{if(args.resolve) throw new Error('Audience membership changed. Refresh and review.');return preview})
  render(<MarketingAudiences organisationId={org} channel="whatsapp" onApply={apply} />)
  fireEvent.click(await screen.findByRole('button',{name:'Preview'}))
  await screen.findByText('Jane Doe')
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'Use 2 recipients'}))
  expect((await screen.findByRole('alert')).textContent).toContain('membership changed')
  expect(apply).not.toHaveBeenCalled()
  expect(screen.getByRole('checkbox').checked).toBe(false)
})
it('uses the current saved definition and revision returned by a fresh preview',async()=>{
  const updated={...audience,revision:2,name:'Updated buyers',definition:{...definition,quietDays:30}}
  const apply=vi.fn()
  mocks.preview.mockImplementation(async(args)=>args.resolve?{recipientIds:[id(20)],audienceId:audience.id,revision:2}:{...preview,audience:updated,revision:2})
  render(<MarketingAudiences organisationId={org} channel="whatsapp" onApply={apply} />)
  fireEvent.click(await screen.findByRole('button',{name:'Preview'}))
  await screen.findByRole('heading',{name:'Updated buyers'})
  expect(screen.getByText('Contacted in 30 days')).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'Use 2 recipients'}))
  await waitFor(()=>expect(apply).toHaveBeenCalledWith([id(20)],updated))
  expect(mocks.preview).toHaveBeenLastCalledWith(expect.objectContaining({audience:updated,resolve:true}))
})
it('does not allow zero recipients or an unchecked Email subscription category',async()=>{
  mocks.preview.mockResolvedValue({...preview,emailEligible:0})
  render(<MarketingAudiences organisationId={org} channel="email" onApply={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button',{name:'Preview'}))
  await screen.findByText('Jane Doe')
  expect(screen.getByRole('checkbox').disabled).toBe(true)
  expect(screen.getByRole('button',{name:'Use 0 recipients'}).disabled).toBe(true)
})
it('preserves spaces and comma-separated values while authoring rules and saves only definitions',async()=>{
  render(<MarketingAudiences organisationId={org} />)
  fireEvent.click(await screen.findByRole('button',{name:'Buyers Find the right property audience'}))
  fireEvent.change(screen.getByRole('combobox',{name:'Rule 1 field'}),{target:{value:'area'}})
  const input=screen.getByRole('textbox',{name:'Rule 1 value'})
  for(const value of ['Cape','Cape ','Cape Town','Cape Town, ','Cape Town, London']) fireEvent.change(input,{target:{value}})
  expect(input.value).toBe('Cape Town, London')
  fireEvent.click(screen.getByRole('button',{name:'Save audience'}))
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(org,expect.objectContaining({name:'Buyers',definition:expect.objectContaining({rules:[{field:'area',operator:'in',values:['Cape Town','London']}]})})))
})
it('discards previews and saved state when the agency changes',async()=>{
  let resolve
  mocks.preview.mockImplementation(()=>new Promise((done)=>{resolve=done}))
  const {rerender}=render(<MarketingAudiences organisationId={org} />)
  fireEvent.click(await screen.findByRole('button',{name:'Preview'}))
  await waitFor(()=>expect(mocks.preview).toHaveBeenCalled())
  mocks.load.mockResolvedValue({...library,audiences:[],total:0})
  rerender(<MarketingAudiences organisationId={id(99)} />)
  await screen.findByText('0 saved audiences')
  await act(async()=>resolve(preview))
  expect(screen.queryByText('Jane Doe')).toBeNull()
  expect(screen.queryByText('Ready buyers')).toBeNull()
})
it('does not apply an in-flight recipient resolution after the library unmounts',async()=>{
  let resolve
  const apply=vi.fn()
  mocks.preview.mockImplementation((args)=>args.resolve?new Promise(done=>{resolve=done}):Promise.resolve(preview))
  const {unmount}=render(<MarketingAudiences organisationId={org} channel="whatsapp" onApply={apply} />)
  fireEvent.click(await screen.findByRole('button',{name:'Preview'}))
  await screen.findByText('Jane Doe')
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button',{name:'Use 2 recipients'}))
  unmount()
  await act(async()=>resolve({recipientIds:[id(20)]}))
  expect(apply).not.toHaveBeenCalled()
})
it('reports missing storage and preserves campaign audience notes without inventing membership',async()=>{
  mocks.association.mockRejectedValue(new Error('Shared CRM audiences are not enabled in this workspace yet.'))
  render(<CampaignAudience campaign={{id:id(30),organisation_id:org,audience:'First-time buyers'}} canEdit />)
  expect((await screen.findByRole('alert')).textContent).toContain('not enabled')
  expect(screen.getByText('Audience notes: First-time buyers')).toBeTruthy()
})
