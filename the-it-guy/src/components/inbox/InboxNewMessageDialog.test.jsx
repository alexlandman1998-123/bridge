// @vitest-environment jsdom
import React from 'react'
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import InboxNewMessageDialog from './InboxNewMessageDialog'
const api=vi.hoisted(()=>({request:vi.fn()}))
vi.mock('../../services/metaIntegrationService',()=>({metaIntegrationRequest:api.request}))
const workspace={organisationId:'org',accessScope:'org:me',senders:[{id:'sender',business_display_name:'Fixture business',display_phone_number:'+27 00 000 0000',connection_status:'connected'}]}
beforeEach(()=>{api.request.mockReset()})
afterEach(cleanup)
async function prepare(){fireEvent.click(screen.getByRole('button',{name:/WhatsApp.*Start a conversation/}));fireEvent.click(screen.getByRole('button',{name:'Start a conversation with a new contact'}));fireEvent.change(screen.getByLabelText('Send from'),{target:{value:'sender'}});fireEvent.change(screen.getByLabelText('International phone number'),{target:{value:'+27 (82) 123-4567'}});fireEvent.change(screen.getByLabelText('Contact name'),{target:{value:'Fixture contact'}})}
it('opens a new contact through the protected create command without sending a message',async()=>{
 const onWhatsApp=vi.fn();api.request.mockResolvedValue({conversation:{id:'created'}})
 render(<InboxNewMessageDialog workspace={workspace} onClose={()=>{}} onWhatsApp={onWhatsApp}/>);await prepare();fireEvent.click(screen.getByRole('button',{name:'Open conversation'}))
 await waitFor(()=>expect(onWhatsApp).toHaveBeenCalledWith('whatsapp:created'))
 expect(api.request).toHaveBeenCalledExactlyOnceWith('org','inbox_work',{operation:'create',fields:{phone:'27821234567',name:'Fixture contact',senderId:'sender'}})
})
it('discards delayed creation results when the active workspace changes',async()=>{
 let finish;api.request.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));const onWhatsApp=vi.fn()
 const rendered=render(<InboxNewMessageDialog workspace={workspace} onClose={()=>{}} onWhatsApp={onWhatsApp}/>);await prepare();fireEvent.click(screen.getByRole('button',{name:'Open conversation'}))
 rendered.rerender(<InboxNewMessageDialog workspace={{...workspace,organisationId:'other',accessScope:'other:me'}} onClose={()=>{}} onWhatsApp={onWhatsApp}/>)
 await act(async()=>finish({conversation:{id:'old-workspace'}}));expect(onWhatsApp).not.toHaveBeenCalled();expect(screen.queryByLabelText('International phone number')).toBeNull()
})
