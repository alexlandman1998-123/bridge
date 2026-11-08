// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const api=vi.hoisted(()=>({ org:'samlin', request:vi.fn(), load:vi.fn(), read:vi.fn(), refresh:vi.fn(), channels:vi.fn() }))
vi.mock('../../../context/OrganisationContext',()=>({useOrganisation:()=>({organisation:{id:api.org}})}))
vi.mock('../../../context/AuthSessionContext',()=>({useAuthSession:()=>({user:{id:'me'},profile:{fullName:'Samlin User'}})}))
vi.mock('../../../lib/supabaseClient',()=>({isSupabaseConfigured:false,supabase:null}))
vi.mock('../../../hooks/useMetaWorkspace',()=>({useMetaWorkspace:()=>({organisationId:api.org,accessScope:`${api.org}:me:admin`,senders:[{id:'sender',display_phone_number:'+27 68 643 9449',business_display_name:'Samlin WhatsApp',connection_status:'connected'}],assignees:[],canManage:true,currentUserId:'me',loading:false,error:'',refresh:api.refresh})}))
vi.mock('../../../services/metaIntegrationService',()=>({metaIntegrationRequest:api.request}))
vi.mock('../../../modules/revo/sharedInbox/revoSharedInboxService',()=>({loadRevoInbox:api.load,loadRevoInboxChannels:api.channels,markRevoInboxConversationRead:api.read,isSharedInboxSchemaUnavailable:()=>false,updateRevoInboxConversation:vi.fn(),saveRevoInboxPrivateMessage:vi.fn(),createRevoInboxWorkflowRequest:vi.fn()}))
vi.mock('../../../components/inbox/InboxEmailActions.jsx',()=>({default:({selected})=><span data-testid="email-actions">{selected?.channel==='email'?'Email reply available':'New email'}</span>}))
vi.mock('../../../components/inbox/InboxThreadMessages.jsx',()=>({default:()=> <div>Email history</div>}))
vi.mock('../../../components/marketing/MetaCampaignRoutes',()=>({WhatsAppCampaignReplyNotice:()=>null}))
vi.mock('../../../components/marketing/WhatsAppCrmLink',()=>({default:()=>null}))
import RevoSharedInboxPage from '../RevoSharedInboxPage'

const email={id:'same-id',channelId:'mailbox',channel:'email',providerKey:'google_workspace',channelAddress:'sales@example.test',contactName:'Email Customer',contactAddress:'client@example.test',subject:'Email enquiry',lastMessageAt:'2026-11-01T17:00:00Z',lastMessagePreview:'Email preview',status:'open',unreadCount:0}
const chat={id:'same-id',organisation_id:'samlin',channel_id:'sender',contact_name:'WhatsApp Customer',contact_phone:'27710000001',last_message_at:'2026-11-01T18:10:25Z',last_message_preview:'AARCH9 test',status:'open',unread_count:1,assignment_version:4,assigned_user_id:null,canReply:true}
const data=()=>({conversations:[email],messages:[],activity:[],associations:[]})
const open=(path='/inbox')=>render(<MemoryRouter initialEntries={[path]}><RevoSharedInboxPage/></MemoryRouter>)
beforeEach(()=>{vi.clearAllMocks();api.org='samlin';api.load.mockResolvedValue(data());api.channels.mockResolvedValue([{id:'mailbox',channel:'email',address:'sales@example.test',connectionStatus:'connected'}]);api.request.mockImplementation(async(org,action)=>{
 if(action==='inbox_page') return {conversations:org==='samlin'?[chat]:[],visibleIds:org==='samlin'?[chat.id]:[],nextCursor:null}
 if(action==='message_page') return {conversation:chat,sender:{display_phone_number:'+27 68 643 9449'},messages:[{id:'incoming',direction:'inbound',body_text:'AARCH9 test',event_at:chat.last_message_at,delivery_status:'received'}],nextCursor:null}
 if(action==='crm_context') return {linked:null,candidates:[],campaigns:[]}
 if(action==='send_message') return {message:{id:'reply',delivery_status:'delivered'}}
 throw Error(`Unexpected ${action}`)
})})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})

it('merges provider conversations, sorts by time, and replies using the real WhatsApp conversation identity',async()=>{
 open()
 await screen.findByRole('button',{name:/WhatsApp Customer/})
 expect(document.querySelectorAll('.revo-row')).toHaveLength(2)
 expect(document.querySelector('.revo-row').textContent).toContain('WhatsApp Customer')
 fireEvent.click(screen.getByRole('button',{name:/WhatsApp Customer/}))
 await screen.findByRole('button',{name:'Open contact details for WhatsApp Customer'})
 expect(screen.queryByLabelText('Reply draft')).toBeNull()
 expect(screen.queryByText('Message format')).toBeNull()
 fireEvent.change(screen.getByLabelText('Reply'),{target:{value:'Samlin reply from Arch9'}})
 fireEvent.click(screen.getByRole('button',{name:'Send message'}))
 await screen.findByText('Message sent.')
 expect(api.request).toHaveBeenCalledWith('samlin','send_message',expect.objectContaining({conversationId:'same-id',assignmentVersion:4,kind:'text',message:'Samlin reply from Arch9'}))
 expect(api.read).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:/Email Customer/}))
 expect(await screen.findByText('Email history')).toBeTruthy()
 expect(screen.getByLabelText('Reply draft')).toBeTruthy()
 expect(screen.queryByLabelText('Reply')).toBeNull()
})

it('applies channel, sender, search and ownership filters to the combined list',async()=>{
 open('/inbox?channel=whatsapp')
 await screen.findByRole('button',{name:/WhatsApp Customer/})
 expect(screen.queryByRole('button',{name:/Email Customer/})).toBeNull()
 fireEvent.change(screen.getByLabelText('Filter by channel'),{target:{value:'all'}})
 await screen.findByRole('button',{name:/Email Customer/})
 fireEvent.keyDown(screen.getByLabelText('Select inbox'),{key:'ArrowDown'})
 fireEvent.click(screen.getByRole('option',{name:/Samlin WhatsApp/}))
 expect(document.querySelectorAll('.revo-row')).toHaveLength(1)
 fireEvent.change(screen.getByLabelText('Search conversations'),{target:{value:'aarch9'}})
 expect(screen.getByRole('button',{name:/WhatsApp Customer/})).toBeTruthy()
 fireEvent.change(screen.getByLabelText('Conversation view'),{target:{value:'mine'}})
 expect(screen.queryByRole('button',{name:/WhatsApp Customer/})).toBeNull()
 fireEvent.change(screen.getByLabelText('Conversation view'),{target:{value:'unassigned'}})
 expect(screen.getByRole('button',{name:/WhatsApp Customer/})).toBeTruthy()
})

it('keeps email available when WhatsApp loading fails and does not silently show samples',async()=>{
 api.request.mockRejectedValue(Error('WhatsApp access unavailable'))
 open()
 await screen.findByRole('button',{name:/Email Customer/})
 expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('WhatsApp access unavailable'))
 expect(screen.queryByText(/Fictional conversations/)).toBeNull()
})

it('removes the previous workspace WhatsApp reader when switching organisations',async()=>{
 const ui=open()
 fireEvent.click(await screen.findByRole('button',{name:/WhatsApp Customer/}))
 await screen.findByLabelText('Reply')
 api.org='other-agency'
 ui.rerender(<MemoryRouter><RevoSharedInboxPage/></MemoryRouter>)
 await waitFor(()=>expect(screen.queryByRole('button',{name:/WhatsApp Customer/})).toBeNull())
 expect(screen.queryByLabelText('Reply')).toBeNull()
 expect(api.request).toHaveBeenCalledWith('other-agency','inbox_page',expect.anything())
})


it('keeps unsent WhatsApp text separate from email drafts while switching conversations',async()=>{
 open()
 fireEvent.click(await screen.findByRole('button',{name:/WhatsApp Customer/}))
 fireEvent.change(await screen.findByLabelText('Reply'),{target:{value:'Unsent WhatsApp draft'}})
 fireEvent.click(screen.getByRole('button',{name:/Email Customer/}))
 fireEvent.change(screen.getByLabelText('Reply draft'),{target:{value:'Unsent email draft'}})
 fireEvent.click(screen.getByRole('button',{name:/WhatsApp Customer/}))
 expect((await screen.findByLabelText('Reply')).value).toBe('Unsent WhatsApp draft')
 fireEvent.click(screen.getByRole('button',{name:/Email Customer/}))
 expect(screen.getByLabelText('Reply draft').value).toBe('Unsent email draft')
 expect(api.request.mock.calls.some(call=>call[1]==='send_message')).toBe(false)
})


it('does not download a previous workspace attachment after its reader is closed',async()=>{
 const original=api.request.getMockImplementation()
 let resolveMedia
 const media=new Promise(resolve=>{resolveMedia=resolve})
 api.request.mockImplementation(async(org,action,fields)=>{
  if(action==='media')return media
  const result=await original(org,action,fields)
  if(action==='message_page')return {...result,messages:[{id:'attachment',direction:'inbound',message_type:'image',media_json:{id:'meta-media'},event_at:chat.last_message_at,delivery_status:'received'}]}
  return result
 })
 const create=vi.fn(),OriginalURL=URL
 vi.stubGlobal('URL',class extends OriginalURL{static createObjectURL=create;static revokeObjectURL=vi.fn()})
 const ui=open()
 fireEvent.click(await screen.findByRole('button',{name:/WhatsApp Customer/}))
 fireEvent.click(await screen.findByRole('button',{name:'Download image'}))
 await waitFor(()=>expect(api.request).toHaveBeenCalledWith('samlin','media',{messageId:'attachment'}))
 ui.unmount()
 await act(async()=>resolveMedia({base64:'dGVzdA==',mimeType:'image/png'}))
 expect(create).not.toHaveBeenCalled()
})

it('opens contact context from the compact header and keeps it out of the message history',async()=>{
 open()
 fireEvent.click(await screen.findByRole('button',{name:/WhatsApp Customer/}))
 const header=await screen.findByRole('button',{name:'Open contact details for WhatsApp Customer'})
 expect(screen.queryByRole('complementary',{name:'Contact information'})).toBeNull()
 expect(screen.queryByText('Message format')).toBeNull()
 fireEvent.click(header)
 expect(await screen.findByRole('complementary',{name:'Contact information'})).toBeTruthy()
 expect(screen.getByText('Tags')).toBeTruthy();expect(screen.getByText('Business number')).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Close contact details'}))
 expect(screen.queryByRole('complementary',{name:'Contact information'})).toBeNull()
 expect(api.request.mock.calls.some(call=>call[1]==='send_message')).toBe(false)
})

it('resizes the WhatsApp contact panel with the shared divider and remembers its width',async()=>{
 const previous=localStorage.getItem('arch9.inbox.panel-widths.v1')
 try {
  open()
  fireEvent.click(await screen.findByRole('button',{name:/WhatsApp Customer/}))
  fireEvent.click(await screen.findByRole('button',{name:'Open contact details for WhatsApp Customer'}))
  const divider=screen.getByRole('separator',{name:'Resize contact details'})
  const before=Number(divider.getAttribute('aria-valuenow'))
  fireEvent.keyDown(divider,{key:before===18?'ArrowLeft':'ArrowRight'})
  const after=Number(divider.getAttribute('aria-valuenow'))
  expect(after).toBe(before+(before===18?1:-1))
  expect(JSON.parse(localStorage.getItem('arch9.inbox.panel-widths.v1')).details).toBe(after)
  expect(document.querySelector('.wa-clean-reader').style.getPropertyValue('--wa-contact-width')).toContain(`${after}cqw`)
 } finally {if(previous===null)localStorage.removeItem('arch9.inbox.panel-widths.v1');else localStorage.setItem('arch9.inbox.panel-widths.v1',previous)}
})

it('keeps assignment in the header across contact-panel tabs without losing the reply draft',async()=>{
 open()
 fireEvent.click(await screen.findByRole('button',{name:/WhatsApp Customer/}))
 fireEvent.change(await screen.findByLabelText('Reply'),{target:{value:'Draft stays here'}})
 fireEvent.click(screen.getByRole('button',{name:'Open contact details for WhatsApp Customer'}))
 expect(screen.getByLabelText('Assign conversation to').closest('.wa-chat-header')).toBeTruthy()
 fireEvent.click(screen.getByRole('tab',{name:'Manage'}))
 expect(screen.getByLabelText('Assign conversation to').closest('.wa-chat-header')).toBeTruthy()
 expect(screen.getByLabelText('Reply').value).toBe('Draft stays here')
 fireEvent.keyDown(screen.getByRole('tab',{name:'Manage'}),{key:'Home'})
 expect(screen.getByRole('tab',{name:'Overview'}).getAttribute('aria-selected')).toBe('true')
 expect(screen.getByLabelText('Assign conversation to').closest('.wa-chat-header')).toBeTruthy()
 expect(api.request.mock.calls.some(call=>call[1]==='send_message'||call[1]==='assign_conversation')).toBe(false)
})

it('provides Overview, Profile, Activity and Manage with recorded chat history',async()=>{
 open()
 fireEvent.click(await screen.findByRole('button',{name:/WhatsApp Customer/}))
 fireEvent.click(await screen.findByRole('button',{name:'Open contact details for WhatsApp Customer'}))
 expect(screen.getAllByRole('tab').map(tab=>tab.textContent)).toEqual(['Overview','Profile','Activity','Manage'])
 expect(screen.getByRole('tab',{name:'Overview'}).getAttribute('aria-selected')).toBe('true')
 fireEvent.click(screen.getByRole('tab',{name:'Profile'}))
 expect(screen.getByRole('tabpanel',{name:'Profile'}).textContent).toContain('27710000001')
 fireEvent.click(screen.getByRole('tab',{name:'Activity'}))
 expect(screen.getByRole('tabpanel',{name:'Activity'}).textContent).toContain('WhatsApp received')
 expect(screen.getByRole('tabpanel',{name:'Activity'}).textContent).toContain('AARCH9 test')
 fireEvent.keyDown(screen.getByRole('tab',{name:'Activity'}),{key:'ArrowRight'})
 expect(screen.getByRole('tab',{name:'Manage'}).getAttribute('aria-selected')).toBe('true')
 expect(api.request.mock.calls.some(call=>call[1]==='send_message')).toBe(false)
})
