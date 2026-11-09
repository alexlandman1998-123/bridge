// @vitest-environment jsdom
import React from 'react'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import WhatsAppConversationWork from './WhatsAppConversationWork'
const api=vi.hoisted(()=>({request:vi.fn(),draft:{body:'Saved private draft',version:3},notes:[]}))
vi.mock('../../services/metaIntegrationService',()=>({metaIntegrationRequest:api.request}))
const workspace={organisationId:'org',accessScope:'org:me',currentUserId:'me',assignees:[{id:'me',name:'Me'}]},conversation={id:'thread',assignment_version:1,canReply:true,work_state:'active'}
beforeEach(()=>{api.draft={body:'Saved private draft',version:3};api.notes=[];api.request.mockReset();api.request.mockImplementation(async(_org,action,payload)=>{if(action==='inbox_work'){if(payload.operation==='draft')api.draft={body:payload.fields.body,version:payload.fields.version+1};if(payload.operation==='note')api.notes=[{id:payload.fields.requestId,body:payload.fields.body,created_at:'2026-11-09',created_by:'me'}];return{draft:api.draft,notes:payload.fields?.includeNotes?api.notes:[],presence:[],snippets:[]}}return{message:{delivery_status:'sent'}}})})
afterEach(()=>{cleanup();vi.useRealTimers()})
it('restores the server draft and saves subsequent edits with its current version',async()=>{
 render(<WhatsAppConversationWork workspace={workspace} conversation={conversation} compact/>);expect((await screen.findByLabelText('Reply')).value).toBe('Saved private draft')
 fireEvent.change(screen.getByLabelText('Reply'),{target:{value:'Changed draft'}})
 await waitFor(()=>expect(api.request).toHaveBeenCalledWith('org','inbox_work',expect.objectContaining({operation:'draft',fields:{body:'Changed draft',version:3}})))
 expect(api.request.mock.calls.some(call=>call[1]==='send_message')).toBe(false)
})
it('internal notes never use the WhatsApp send endpoint and load only when the note tab is opened',async()=>{
 render(<WhatsAppConversationWork workspace={workspace} conversation={conversation} compact/>);await screen.findByLabelText('Reply')
 expect(api.request).toHaveBeenCalledWith('org','inbox_work',expect.objectContaining({operation:'work',fields:{includeNotes:false}}))
 fireEvent.click(screen.getByRole('button',{name:'Internal note',exact:true}));fireEvent.change(screen.getByLabelText('Internal note'),{target:{value:'Private handover context'}});fireEvent.click(screen.getByRole('button',{name:'Save internal note'}))
 await screen.findByText('Private handover context',{selector:'p'})
 expect(api.request.mock.calls.some(call=>call[1]==='send_message')).toBe(false)
})
it('does not acknowledge hidden notes or permit unassigned conversations to send',async()=>{
 render(<WhatsAppConversationWork workspace={workspace} conversation={conversation} compact canSend={false} visible={false}/>);await screen.findByLabelText('Reply')
 expect(screen.getByRole('button',{name:'Send message'}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'Assign to me'}));await waitFor(()=>expect(api.request).toHaveBeenCalledWith('org','inbox_work',expect.objectContaining({operation:'take'})))
 expect(api.request.mock.calls.some(call=>call[2]?.operation==='read')).toBe(false)
})
