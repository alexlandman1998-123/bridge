// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WhatsAppInbox from '../WhatsAppInbox'
import ListingFacebookPostPanel from '../../listings/ListingFacebookPostPanel'
import SettingsWhatsAppPage from '../../../pages/settings/SettingsWhatsAppPage'
const mocks=vi.hoisted(()=>({request:vi.fn(),org:'org-one',senders:[]}))
vi.mock('../../../hooks/useMetaWorkspace',()=>({useMetaWorkspace:()=>({organisationId:mocks.org,loading:false,canManage:true,refresh:async()=>{},senders:mocks.senders})}))
vi.mock('../../../services/metaIntegrationService',()=>({metaIntegrationRequest:mocks.request,launchWhatsAppSignup:vi.fn(),prepareFacebookSdk:vi.fn()}))
const conversation={id:'conversation-one',contact_phone:'27821234567',contact_name:'Customer One',last_message_preview:'Private customer message',assignment_version:1,status:'open',canReply:true}
const page={id:'page-one',page_name:'Agency Page',canPost:true}
beforeEach(()=>{mocks.org='org-one';mocks.senders=[{connection_status:'connected'}];mocks.request.mockImplementation(async(_org,action,fields={})=>{
  if(action==='inbox_page')return {conversations:[conversation]}
  if(action==='message_page')return {conversation,messages:[]}
  if(action==='message_receipt')return {message:{delivery_status:'sent'}}
  if(action==='campaign_reply_status')return {}
  if(action==='crm_context')return {}
  if(action==='inbox_work')return fields.operation==='draft' ? {draft:{version:(fields.fields.version||0)+1}} : {draft:null,notes:[],presence:[],snippets:[]}
  if(action==='workspace')return {pages:[page]}
  if(action==='listing_posts')return {posts:[]}
  if(action==='preview_post')return {post:{id:'post-one',status:'draft',snapshot_json:{caption:'Reviewed listing caption',mode:'text'}}}
  if(action==='publish_post')return {post:{id:'post-one',status:'unknown',error_message:'Check the Page before posting again.'}}
  throw Error(`Unexpected ${action}`)
})})
afterEach(()=>{cleanup();vi.clearAllMocks()})
const wrap=node=><MemoryRouter>{node}</MemoryRouter>
it('hides the previous workspace conversation immediately when the next load fails',async()=>{
  const view=render(wrap(<WhatsAppInbox/>));await screen.findByText('Private customer message')
  mocks.org='org-two';mocks.request.mockRejectedValue(Error('Workspace unavailable'))
  view.rerender(wrap(<WhatsAppInbox/>))
  expect(screen.queryByText('Private customer message')).toBeNull();await screen.findByText('Workspace unavailable')
})
it('reconciles a lost reply with the same request identifier and body',async()=>{
  let attempts=0
  const original=mocks.request.getMockImplementation()
  mocks.request.mockImplementation(async(org,action,fields)=>{if(action!=='send_message')return original(org,action,fields);attempts++;if(attempts===1)throw Error('Connection lost');return {message:{delivery_status:'sent'}}})
  render(wrap(<WhatsAppInbox/>));fireEvent.click(await screen.findByRole('button',{name:/Customer One/}))
  fireEvent.change(await screen.findByLabelText('Reply'),{target:{value:'Thanks for contacting us'}})
  fireEvent.click(screen.getByRole('button',{name:'Send message'}));await screen.findByRole('button',{name:'Check message'})
  fireEvent.click(screen.getByRole('button',{name:'Check message'}));await waitFor(()=>expect(screen.getByLabelText('Reply').value).toBe(''))
  const sends=mocks.request.mock.calls.filter(c=>c[1]==='send_message');expect(sends).toHaveLength(1);const receipts=mocks.request.mock.calls.filter(c=>c[1]==='message_receipt');expect(receipts).toHaveLength(1);expect(receipts[0][2].requestId).toBe(sends[0][2].requestId)
})
it('previews before publishing and does not repeat an uncertain post',async()=>{
  render(wrap(<ListingFacebookPostPanel organisationId="org-one" listingId="listing-one"/>))
  fireEvent.click(await screen.findByRole('button',{name:'Preview Facebook post'}))
  await screen.findByRole('dialog',{name:'Review Facebook post'});expect(mocks.request.mock.calls.some(c=>c[1]==='publish_post')).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'Publish to Facebook'}));await screen.findByText('Check the Page before posting again.')
  expect(screen.queryByRole('button',{name:'Publish to Facebook'})).toBeNull();expect(mocks.request.mock.calls.filter(c=>c[1]==='publish_post')).toHaveLength(1)
})
it('requires a new preview after changing the caption',async()=>{
  render(wrap(<ListingFacebookPostPanel organisationId="org-one" listingId="listing-one"/>))
  fireEvent.click(await screen.findByRole('button',{name:'Preview Facebook post'}));await screen.findByRole('dialog',{name:'Review Facebook post'})
  fireEvent.keyDown(document,{key:'Escape'})
  fireEvent.change(screen.getByLabelText('Caption'),{target:{value:'A different caption'}})
  expect(screen.queryByRole('button',{name:'Publish to Facebook'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Preview Facebook post'}));await screen.findByRole('dialog',{name:'Review Facebook post'})
  expect(mocks.request.mock.calls.filter(c=>c[1]==='preview_post')[1][2].caption).toBe('A different caption')
})
it('checks history after a lost publish response without offering another publish request',async()=>{
  const original=mocks.request.getMockImplementation()
  let published=false
  mocks.request.mockImplementation(async(org,action,fields)=>{
    if(action==='publish_post') { published=true;throw Error('Connection lost') }
    if(action==='listing_posts'&&published)return {posts:[{id:'post-one',status:'published',public_url:'https://www.facebook.com/300_400',created_at:'2026-11-01T12:00:00Z'}]}
    return original(org,action,fields)
  })
  render(wrap(<ListingFacebookPostPanel organisationId="org-one" listingId="listing-one"/>))
  fireEvent.click(await screen.findByRole('button',{name:'Preview Facebook post'}))
  fireEvent.click(await screen.findByRole('button',{name:'Publish to Facebook'}))
  await screen.findByText(/Connection lost/)
  expect(screen.queryByRole('button',{name:'Publish to Facebook'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Check post status'}))
  const dialog=within(screen.getByRole('dialog',{name:'Review Facebook post'}))
  await dialog.findByText(/Meta accepted this post/)
  expect(dialog.getByText('Reviewed listing caption')).toBeTruthy()
  expect(dialog.getByRole('link',{name:'Open it on Facebook'}).getAttribute('href')).toBe('https://www.facebook.com/300_400')
  expect(mocks.request.mock.calls.filter(c=>c[1]==='publish_post')).toHaveLength(1)
})
it('keeps publishing disabled when history cannot confirm a lost request',async()=>{
  const original=mocks.request.getMockImplementation()
  mocks.request.mockImplementation(async(org,action,fields)=>{
    if(action==='publish_post')throw Error('Connection lost')
    return original(org,action,fields)
  })
  render(wrap(<ListingFacebookPostPanel organisationId="org-one" listingId="listing-one"/>))
  fireEvent.click(await screen.findByRole('button',{name:'Preview Facebook post'}))
  fireEvent.click(await screen.findByRole('button',{name:'Publish to Facebook'}))
  await screen.findByText(/Connection lost/)
  fireEvent.click(screen.getByRole('button',{name:'Check post status'}))
  await waitFor(()=>expect(screen.getByRole('button',{name:'Check post status'}).disabled).toBe(false))
  expect(screen.queryByRole('button',{name:'Publish to Facebook'})).toBeNull()
  expect(mocks.request.mock.calls.filter(c=>c[1]==='publish_post')).toHaveLength(1)
})
it('keeps the reviewed Page destination when connections refresh',async()=>{
  const original=mocks.request.getMockImplementation()
  mocks.request.mockImplementation(async(org,action,fields)=>action==='preview_post'
    ? {...await original(org,action,fields),pageName:'Reviewed Agency Page'}
    : original(org,action,fields))
  render(wrap(<ListingFacebookPostPanel organisationId="org-one" listingId="listing-one"/>))
  fireEvent.click(await screen.findByRole('button',{name:'Preview Facebook post'}))
  await screen.findByRole('dialog',{name:'Review Facebook post'})
  mocks.request.mockImplementation(async(org,action,fields)=>action==='workspace'
    ? {pages:[{id:'page-two',page_name:'Another Agency Page',canPost:true}]}
    : original(org,action,fields))
  fireEvent.click(screen.getByRole('button',{name:'Refresh'}))
  await screen.findByRole('option',{name:'Another Agency Page'})
  const dialog=within(screen.getByRole('dialog',{name:'Review Facebook post'}))
  expect(dialog.getByText('Publish will share this preview publicly on Reviewed Agency Page.')).toBeTruthy()
  expect(dialog.queryByText('Another Agency Page')).toBeNull()
})
it('requires the agency administrator to enter a PIN before activating a pending number',async()=>{
  mocks.senders=[{id:'sender-pending',connection_status:'pending',display_phone_number:'+27 82 999 8888'}]
  mocks.request.mockResolvedValue({sender:{connection_status:'connected'}})
  render(wrap(<SettingsWhatsAppPage/>))
  fireEvent.click(screen.getByRole('button',{name:'Activate number'}))
  const dialog=within(screen.getByRole('dialog',{name:'Activate WhatsApp number'}))
  expect(dialog.getByRole('button',{name:'Activate number'}).disabled).toBe(true)
  expect(mocks.request).not.toHaveBeenCalled()
  fireEvent.change(dialog.getByLabelText('Registration PIN'),{target:{value:'123456'}})
  fireEvent.click(dialog.getByRole('button',{name:'Activate number'}))
  await screen.findByText('Number activated. The inbox and campaigns can use this sender.')
  expect(mocks.request).toHaveBeenCalledWith('org-one','register_sender',{senderId:'sender-pending',pin:'123456'})
  expect(screen.queryByLabelText('Registration PIN')).toBeNull()
})
