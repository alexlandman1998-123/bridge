// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WhatsAppBusinessAppSync from '../WhatsAppBusinessAppSync'
import SettingsWhatsAppPage from '../../../pages/settings/SettingsWhatsAppPage'
import WhatsAppInbox from '../WhatsAppInbox'
const mocks=vi.hoisted(()=>({request:vi.fn(),launch:vi.fn(),org:'agency-one',viewer:'agent-one',senders:[]}))
vi.mock('../../../services/metaIntegrationService',()=>({metaIntegrationRequest:mocks.request,launchWhatsAppSignup:mocks.launch,prepareFacebookSdk:vi.fn(async()=>({login:vi.fn()}))}))
vi.mock('../../../hooks/useMetaWorkspace',()=>({useMetaWorkspace:()=>({organisationId:mocks.org,currentUserId:mocks.viewer,accessScope:`${mocks.org}:${mocks.viewer}`,senders:mocks.senders,canManage:false,canConnectOwn:true,loading:false,refresh:vi.fn()})}))
const sender={id:'sender-one',ownership_version:4,onboarding_mode:'coexistence',business_app_session:'session-one',display_phone_number:'+27 82 000 0000',connection_status:'connected',owner_user_id:'agent-one'}
const status={history:'requested',progress:0,pendingUpdates:0,failedUpdates:0,requests:{history:{status:'requested'},smb_app_state_sync:{status:'requested'}}}
const wrap=node=><MemoryRouter>{node}</MemoryRouter>
const sync=(props={})=><WhatsAppBusinessAppSync organisationId="agency-one" sender={sender} {...props}/>
beforeEach(()=>{mocks.org='agency-one';mocks.viewer='agent-one';mocks.senders=[];mocks.request.mockReset();mocks.launch.mockReset();mocks.request.mockResolvedValue(status)})
afterEach(()=>{cleanup();vi.clearAllMocks()})

it('distinguishes a requested import, a declined history share and completion without sending messages',async()=>{
 render(wrap(sync()))
 await screen.findByText('History: Requested from Meta')
 expect(screen.getByText(/Keep WhatsApp Business open/)).toBeTruthy()
 expect(screen.queryByRole('button',{name:'Start initial phone app sync'})).toBeNull()
 mocks.request.mockResolvedValue({...status,history:'declined'})
 fireEvent.click(screen.getByRole('button',{name:'Refresh sync progress'}))
 await screen.findByText('History: History sharing declined')
 expect(screen.getByText(/New messages can still sync/)).toBeTruthy()
 mocks.request.mockResolvedValue({...status,history:'complete',progress:100})
 fireEvent.click(screen.getByRole('button',{name:'Refresh sync progress'}))
 await screen.findByText('History: Available history synced')
 expect(mocks.request.mock.calls.every(call=>call[1]==='business_app_status')).toBe(true)
})
it('retries saved processing with the visible ownership version instead of resubmitting the one-time Meta request',async()=>{
 mocks.request.mockResolvedValue({...status,history:'failed',failedUpdates:2})
 render(wrap(sync()))
 fireEvent.click(await screen.findByRole('button',{name:'Retry saved updates'}))
 await waitFor(()=>expect(mocks.request).toHaveBeenCalledWith('agency-one','retry_business_app_updates',{senderId:'sender-one',ownershipVersion:4}))
 expect(mocks.request.mock.calls.some(call=>call[1]==='start_business_app_sync'||call[1]==='send_message')).toBe(false)
})
it('allows requesting a missing initial sync but shows unconfirmed one-time requests without offering a repeat',async()=>{
 mocks.request.mockResolvedValue({...status,history:'not_started',requests:{}})
 render(wrap(sync()))
 fireEvent.click(await screen.findByRole('button',{name:'Start initial phone app sync'}))
 await waitFor(()=>expect(mocks.request).toHaveBeenCalledWith('agency-one','start_business_app_sync',{senderId:'sender-one',ownershipVersion:4}))
 mocks.request.mockResolvedValue({...status,history:'unconfirmed',requests:{history:{status:'unknown'},smb_app_state_sync:{status:'requested'}}})
 fireEvent.click(screen.getByRole('button',{name:'Refresh sync progress'}))
 await screen.findByText('History: Request not confirmed')
 expect(screen.queryByRole('button',{name:'Start initial phone app sync'})).toBeNull()
})
it('discards a previous workspace status when its component is replaced and the new workspace request fails',async()=>{
 let resolve
 mocks.request.mockReturnValueOnce(new Promise(done=>{resolve=done})).mockRejectedValueOnce(Error('Access revoked'))
 const view=render(wrap(<WhatsAppBusinessAppSync key="old" organisationId="agency-one" sender={sender}/>))
 await waitFor(()=>expect(resolve).toBeTypeOf('function'))
 view.rerender(wrap(<WhatsAppBusinessAppSync key="new" organisationId="agency-two" sender={sender}/>))
 await screen.findByText('Access revoked')
 await act(async()=>resolve({...status,history:'complete'}))
 expect(screen.queryByText('History: Available history synced')).toBeNull()
})
it('binds the phone-app option before starting authorization and provides number selection for WABA-only completion',async()=>{
 mocks.request.mockImplementation(async(_org,action)=>{
  if(action==='begin_whatsapp')return {state:'intent',appId:'app',graphVersion:'v25.0',coexistence:true}
  if(action==='finish_whatsapp')return {sender:{...sender,phone_number_id:'102'}}
  return status
 })
 mocks.launch.mockResolvedValue({requiresPhoneSelection:true,wabaId:'200',phones:[{id:'102',displayPhoneNumber:'+27 82 333 4444'},{id:'103',displayPhoneNumber:'+27 82 555 6666'}]})
 render(wrap(<SettingsWhatsAppPage/>))
 fireEvent.click(screen.getByLabelText('I already use this number in the WhatsApp Business phone app.'))
 fireEvent.click(screen.getByRole('button',{name:'Connect my WhatsApp'}))
 await screen.findByText(/Connecting for: You/)
 expect(mocks.request).toHaveBeenCalledWith('agency-one','begin_whatsapp',{ownerUserId:'agent-one',coexistence:true})
 fireEvent.click(screen.getByRole('button',{name:'Continue with Meta'}))
 const select=await screen.findByLabelText('WhatsApp number')
 expect(screen.getByRole('button',{name:'Connect selected number'}).disabled).toBe(true)
 fireEvent.change(select,{target:{value:'103'}})
 fireEvent.click(screen.getByRole('button',{name:'Connect selected number'}))
 await screen.findByText('Phone app connected. Keep WhatsApp Business open while initial sync finishes.')
 expect(mocks.request).toHaveBeenCalledWith('agency-one','finish_whatsapp',{state:'intent',wabaId:'200',phoneNumberId:'103'})
})
it('does not offer a registration PIN for a pending phone-app number',async()=>{
 mocks.senders=[{...sender,connection_status:'pending'}]
 render(wrap(<SettingsWhatsAppPage/>))
 await screen.findByText('WhatsApp Business phone app sync')
 expect(screen.queryByRole('button',{name:'Activate number'})).toBeNull()
 expect(screen.queryByLabelText('Registration PIN')).toBeNull()
})
it('labels phone-app messages and imported history, and hides revoked text and downloads',async()=>{
 const conversation={id:'thread-one',contact_name:'Fictional Customer',contact_phone:'27821234567',assignment_version:1,canReply:true,content_version:2}
 mocks.senders=[sender]
 mocks.request.mockImplementation(async(_org,action)=>{
  if(action==='inbox_page')return {conversations:[{...conversation,last_message_preview:'Latest preview'}]}
  if(action==='message_page')return {conversation,messages:[{id:'a',direction:'outbound',message_origin:'business_app',body_text:'A phone reply',event_at:'2026-10-18T10:00:00Z',delivery_status:'sent'},{id:'b',direction:'inbound',message_origin:'history',message_type:'media_placeholder',event_at:'2026-10-17T10:00:00Z',delivery_status:'received'},{id:'c',direction:'inbound',body_text:'REVOKED PRIVATE TEXT',revoked_at:'2026-10-18T11:00:00Z',media_json:{id:'900',filename:'private.pdf'},event_at:'2026-10-18T09:00:00Z',delivery_status:'received'}]}
  if(action==='crm_context')return {version:0,assignmentVersion:1,candidates:[],campaigns:[]}
  return status
 })
 render(wrap(<WhatsAppInbox/>))
 fireEvent.click(await screen.findByRole('button',{name:/Fictional Customer/}))
 await screen.findByText('WhatsApp Business app')
 expect(screen.getByText('A phone reply')).toBeTruthy()
 expect(screen.getByText('Media not supplied by Meta')).toBeTruthy()
 expect(screen.getByText('Imported WhatsApp history')).toBeTruthy()
 expect(screen.getByText('Message deleted in WhatsApp')).toBeTruthy()
 expect(screen.queryByText('REVOKED PRIVATE TEXT')).toBeNull()
 expect(screen.queryByRole('button',{name:'private.pdf'})).toBeNull()
})
