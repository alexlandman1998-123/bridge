// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WhatsAppInbox from '../WhatsAppInbox'
import ListingFacebookPostPanel from '../../listings/ListingFacebookPostPanel'
import { prepareFacebookSdk } from '../../../services/metaIntegrationService'
import SettingsWhatsAppPage from '../../../pages/settings/SettingsWhatsAppPage'
const mocks=vi.hoisted(()=>({request:vi.fn(),org:'org-one',senders:[],canManage:true,canConnectOwn:true,viewer:'user-one'}))
vi.mock('../../../hooks/useMetaWorkspace',()=>({useMetaWorkspace:()=>({organisationId:mocks.org,accessScope:`${mocks.org}:${mocks.viewer}`,currentUserId:mocks.viewer,loading:false,canManage:mocks.canManage,canConnectOwn:mocks.canConnectOwn,assignees:[{id:'agent-a',name:'Sam Agent'},{id:'user-one',name:'Agency Owner'}],refresh:async()=>{},senders:mocks.senders})}))
vi.mock('../../../services/metaIntegrationService',()=>({metaIntegrationRequest:mocks.request,launchWhatsAppSignup:vi.fn(),prepareFacebookSdk:vi.fn()}))
const conversation={id:'conversation-one',contact_phone:'27821234567',contact_name:'Customer One',last_message_preview:'Private customer message',status:'open',canReply:true,assigned_user_id:null,assignment_version:1}
const page={id:'page-one',page_name:'Agency Page',canPost:true}
beforeEach(()=>{mocks.org='org-one';mocks.viewer='user-one';mocks.canManage=true;mocks.canConnectOwn=true;vi.mocked(prepareFacebookSdk).mockResolvedValue({});mocks.senders=[{connection_status:'connected'}];mocks.request.mockImplementation(async(_org,action)=>{
  if(action==='inbox_page')return {conversations:[conversation]}
  if(action==='message_page')return {conversation,messages:[]}
  if(action==='crm_context')return {version:0,assignmentVersion:1,linked:null,candidates:[],campaigns:[]}
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
it('checks a lost send without submitting the message again',async()=>{
  const original=mocks.request.getMockImplementation()
  mocks.request.mockImplementation(async(org,action,fields)=>{
    if(action==='send_message')throw Error('Connection lost')
    if(action==='message_receipt')return {message:{delivery_status:'sent'}}
    return original(org,action,fields)
  })
  render(wrap(<WhatsAppInbox/>));fireEvent.click(await screen.findByRole('button',{name:/Customer One/}))
  fireEvent.change(await screen.findByLabelText('Reply'),{target:{value:'Thanks for contacting us'}})
  fireEvent.click(screen.getByRole('button',{name:'Send message'}));await screen.findByRole('button',{name:'Check message'})
  fireEvent.click(screen.getByRole('button',{name:'Check message'}));await waitFor(()=>expect(screen.getByLabelText('Reply').value).toBe(''))
  const sends=mocks.request.mock.calls.filter(c=>c[1]==='send_message'),checks=mocks.request.mock.calls.filter(c=>c[1]==='message_receipt')
  expect(sends).toHaveLength(1);expect(checks).toHaveLength(1);expect(checks[0][2].requestId).toBe(sends[0][2].requestId);expect(sends[0][2].requestId).toMatch(/^[0-9a-f-]{36}$/)
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
it('saves an assignment with the visible version and keeps the API scoped to the organisation',async()=>{
 const original=mocks.request.getMockImplementation()
 mocks.request.mockImplementation(async(org,action,fields)=>action==='assign_conversation'?{conversation:{...conversation,assigned_user_id:fields.assignedUserId,assignment_version:2}}:original(org,action,fields))
 render(wrap(<WhatsAppInbox/>));fireEvent.click(await screen.findByRole('button',{name:/Customer One/}))
 fireEvent.change(await screen.findByLabelText('Assign conversation'),{target:{value:'agent-a'}})
 fireEvent.click(screen.getByRole('button',{name:'Save assignment'}))
 await waitFor(()=>expect(mocks.request).toHaveBeenCalledWith('org-one','assign_conversation',{conversationId:'conversation-one',assignedUserId:'agent-a',assignmentVersion:1}))
})
it('offers personal connection controls to an agent without agency ownership or assignment controls',async()=>{
 mocks.canManage=false;mocks.senders=[{id:'own-sender',owner_user_id:'user-one',connection_status:'connected'}]
 const view=render(wrap(<SettingsWhatsAppPage/>))
 expect(screen.queryByRole('button',{name:'Change owner'})).toBeNull()
 expect(screen.queryByLabelText('Connect number for')).toBeNull()
 expect(screen.getByRole('button',{name:'Disconnect'})).toBeTruthy()
 mocks.request.mockResolvedValue({appId:'app',graphVersion:'v23.0',state:'state'})
 fireEvent.click(screen.getByRole('button',{name:'Connect my WhatsApp'}))
 await screen.findByText(/Connecting for: You/)
 expect(mocks.request).toHaveBeenCalledWith('org-one','begin_whatsapp',{ownerUserId:'user-one',coexistence:false})
 view.unmount()
 mocks.request.mockImplementation(async(_org,action)=>action==='inbox_page'?{conversations:[{...conversation,assigned_user_id:'user-one'}]}:{conversation:{...conversation,assigned_user_id:'user-one'},messages:[]})
 render(wrap(<WhatsAppInbox/>));fireEvent.click(await screen.findByRole('button',{name:/Customer One/}))
 await screen.findByText('Assigned to you')
 expect(screen.queryByLabelText('Assign conversation')).toBeNull()
})
it('changes number ownership with a version check and explains the effect on existing conversations',async()=>{
 mocks.senders=[{id:'agency-sender',owner_user_id:null,ownership_version:4,connection_status:'connected',display_phone_number:'+27 82 000 0000'}]
 mocks.request.mockResolvedValue({saved:true})
 render(wrap(<SettingsWhatsAppPage/>))
 fireEvent.click(screen.getByRole('button',{name:'Change owner'}))
 const modal=within(screen.getByRole('dialog',{name:'Change WhatsApp number owner'}))
 expect(modal.getByText(/moves all conversations/)).toBeTruthy()
 fireEvent.change(modal.getByLabelText('Number owner'),{target:{value:'agent-a'}})
 fireEvent.click(modal.getByRole('button',{name:'Save ownership'}))
 await screen.findByText(/Number ownership saved/)
 expect(mocks.request).toHaveBeenCalledWith('org-one','set_sender_owner',{senderId:'agency-sender',ownerUserId:'agent-a',ownershipVersion:4})
})
it('removes private messages and reply drafts immediately when the signed-in person changes in the same agency',async()=>{
 const view=render(wrap(<WhatsAppInbox/>));fireEvent.click(await screen.findByRole('button',{name:/Customer One/}))
 fireEvent.change(await screen.findByLabelText('Reply'),{target:{value:'Private draft'}})
 mocks.viewer='user-two';mocks.canManage=false;mocks.request.mockRejectedValue(Error('Conversation not found in your inbox'))
 view.rerender(wrap(<WhatsAppInbox/>))
 expect(screen.queryByText('Private customer message')).toBeNull()
 expect(screen.queryByDisplayValue('Private draft')).toBeNull()
 await screen.findAllByText('Conversation not found in your inbox')
})
it('clears a thread and unsent draft when a refresh removes its assignment',async()=>{
 render(wrap(<WhatsAppInbox/>));fireEvent.click(await screen.findByRole('button',{name:/Customer One/}))
 fireEvent.change(await screen.findByLabelText('Reply'),{target:{value:'Private draft'}})
 mocks.request.mockImplementation(async(_org,action)=>{if(action==='inbox_page')return {conversations:[]};throw Error('Conversation not found in your inbox')})
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}))
 await waitFor(()=>expect(screen.queryByDisplayValue('Private draft')).toBeNull())
 expect(screen.queryByText('Private customer message')).toBeNull()
 expect(screen.queryByRole('button',{name:'Send message'})).toBeNull()
})
