// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CampaignFacebookPostPanel from '../CampaignFacebookPostPanel'

const runtime=vi.hoisted(()=>({request:vi.fn()}))
vi.mock('../../../services/metaIntegrationService',()=>({metaIntegrationRequest:runtime.request}))
const campaign={id:'campaign-one',revision:1},page={id:'page-one',page_name:'Oak Page',canPost:true}
const caption='Saved public title\n\nSaved terms and conditions. <b>Plain text</b>'
const link='https://agency.example.test/enquire'
const draft={id:'post-one',campaign_id:'campaign-one',campaign_revision:1,status:'draft',created_at:'2026-10-25T21:00:00Z',snapshot_json:{caption,link,mode:'link'}}
beforeEach(()=>{
  runtime.request.mockReset()
  runtime.request.mockImplementation(async(_org,action)=>{
    if(action==='workspace')return {pages:[page]}
    if(action==='campaign_posts')return {posts:[],canPublish:true,source:{caption,destinations:[{key:'response',label:'Campaign response link',url:link}]}}
    if(action==='preview_campaign_post')return {post:draft,pageName:page.page_name}
    if(action==='publish_campaign_post')return {post:{...draft,status:'published',provider_post_id:'300_900',public_url:'https://www.facebook.com/300_900'}}
    throw Error(`Unexpected action ${action}`)
  })
})
afterEach(cleanup)
const panel=(props={})=><MemoryRouter><CampaignFacebookPostPanel organisationId="org-one" userId="user-one" campaign={campaign} canEdit {...props}/></MemoryRouter>
async function preview(){fireEvent.click(await screen.findByRole('button',{name:'Preview Facebook post'}));return screen.findByRole('dialog',{name:'Review campaign Facebook post'})}

it('shows actual saved plain text and requires separate explicit Publish now before a provider action',async()=>{
  render(panel())
  await screen.findByLabelText('Saved Social wording')
  expect(screen.getByLabelText('Saved Social wording').readOnly).toBe(true)
  expect(screen.getByLabelText('Saved Social wording').value).toBe(caption)
  const dialog=await preview()
  expect(within(dialog).getByText(/Saved terms and conditions/).textContent).toBe(caption)
  expect(dialog.querySelector('b')).toBeNull()
  expect(runtime.request.mock.calls.filter(call=>call[1]==='publish_campaign_post')).toHaveLength(0)
  const prepare=runtime.request.mock.calls.find(call=>call[1]==='preview_campaign_post')
  expect(prepare[2]).toMatchObject({campaignId:'campaign-one',expectedRevision:1,connectionId:'page-one',mode:'link',destination:'response'})
  expect(prepare[2].requestId).toMatch(/^[0-9a-f-]{36}$/)
  fireEvent.click(within(dialog).getByRole('button',{name:'Publish now'}))
  await screen.findByText('Meta confirmed this Facebook post.')
  expect(runtime.request.mock.calls.find(call=>call[1]==='publish_campaign_post')[2]).toEqual({postId:'post-one',expectedRevision:1,confirmPublishNow:true})
  expect(screen.queryByRole('button',{name:'Publish now'})).toBeNull()
})

it('keeps the same preview request identity after a lost preparation response',async()=>{
  let attempts=0
  const original=runtime.request.getMockImplementation()
  runtime.request.mockImplementation(async(org,action,args)=>{
    if(action==='preview_campaign_post' && ++attempts===1)throw Error('Connection lost')
    return original(org,action,args)
  })
  render(panel())
  fireEvent.click(await screen.findByRole('button',{name:'Preview Facebook post'}))
  await screen.findByText(/Connection lost/)
  await preview()
  const calls=runtime.request.mock.calls.filter(call=>call[1]==='preview_campaign_post')
  expect(calls).toHaveLength(2);expect(calls[0][2]).toEqual(calls[1][2])
})

it('never offers to submit again after an uncertain result or lost publish response',async()=>{
  const original=runtime.request.getMockImplementation()
  runtime.request.mockImplementation(async(org,action,args)=>action==='publish_campaign_post'?{post:{...draft,status:'unknown',error_message:'Check the Facebook Page before creating another post.'}}:original(org,action,args))
  const view=render(panel());await preview();fireEvent.click(screen.getByRole('button',{name:'Publish now'}))
  await screen.findByText('Check the Facebook Page before creating another post.')
  expect(screen.queryByRole('button',{name:'Publish now'})).toBeNull()
  view.unmount()
  runtime.request.mockImplementation(async(org,action,args)=>{if(action==='publish_campaign_post')throw Error('Request interrupted');return original(org,action,args)})
  render(panel());await preview();fireEvent.click(screen.getByRole('button',{name:'Publish now'}))
  await screen.findByText(/Request interrupted/)
  expect(screen.queryByRole('button',{name:'Publish now'})).toBeNull()
})

it('hides previous previews and copy immediately after the campaign revision, actor or workspace changes',async()=>{
  const view=render(panel());await preview()
  runtime.request.mockRejectedValue(Error('Workspace unavailable'))
  view.rerender(panel({organisationId:'org-two',userId:'user-two',campaign:{id:'campaign-two',revision:2}}))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.queryByLabelText('Saved Social wording')).toBeNull()
  await screen.findByText('Workspace unavailable')
  expect(screen.queryByRole('button',{name:'Publish now'})).toBeNull()
})

it('requires server publishing permission and a capable Page, while retaining factual history',async()=>{
  runtime.request.mockImplementation(async(_org,action)=>action==='workspace'?{pages:[{...page,canPost:false}]}:{posts:[{...draft,status:'unknown'}],source:{caption,destinations:[]},canPublish:true})
  render(panel())
  await screen.findByRole('link',{name:'Connect Facebook Page'})
  expect(screen.queryByRole('button',{name:'Preview Facebook post'})).toBeNull()
  expect(screen.getByText(/Unconfirmed · check the Facebook Page/)).toBeTruthy()
  expect(screen.queryByRole('link',{name:'Open Facebook post'})).toBeNull()
  await waitFor(()=>expect(runtime.request.mock.calls).toHaveLength(2))
})
