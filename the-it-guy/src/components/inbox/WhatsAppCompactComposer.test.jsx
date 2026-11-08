// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import WhatsAppMessageComposer from '../marketing/WhatsAppMessageComposer'
const api=vi.hoisted(()=>({request:vi.fn()}))
vi.mock('../../services/metaIntegrationService',()=>({metaIntegrationRequest:api.request}))
afterEach(cleanup)
beforeEach(()=>{api.request.mockReset();api.request.mockImplementation(async(_org,action)=>action==='inbox_templates'?{templates:[]}:action==='message_permission'?{permission:null}:{message:{delivery_status:'sent'}})})
const thread={id:'thread',assignment_version:2,canReply:true}
it('keeps message format controls out of the chat and sends text with the existing receipt flow',async()=>{
 render(<WhatsAppMessageComposer compact organisationId="org" conversation={thread} onSent={()=>{}}/>)
 expect(screen.queryByLabelText('Message format')).toBeNull();expect(api.request).not.toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('Reply'),{target:{value:'Hello'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}))
 await screen.findByText('Message sent.');expect(api.request).toHaveBeenCalledWith('org','send_message',expect.objectContaining({kind:'text',message:'Hello',assignmentVersion:2}))
})
it('shows a normal draft box without the closed-window banner and cannot send outside Meta’s window',()=>{
 render(<WhatsAppMessageComposer compact organisationId="org" conversation={{...thread,canReply:false}} onSent={()=>{}}/>)
 expect(screen.queryByText('The reply window has closed.')).toBeNull()
 expect(screen.queryByRole('button',{name:'Use approved template'})).toBeNull()
 fireEvent.change(screen.getByLabelText('Reply'),{target:{value:'A draft for later'}})
 expect(screen.getByLabelText('Reply').value).toBe('A draft for later')
 expect(screen.getByRole('button',{name:'Send message'}).disabled).toBe(true)
 expect(api.request).not.toHaveBeenCalled()
})
it('still opens template tools separately during an active conversation',async()=>{
 render(<WhatsAppMessageComposer compact organisationId="org" conversation={thread} onSent={()=>{}}/>)
 fireEvent.click(screen.getByRole('button',{name:'Use a template'}))
 await screen.findByRole('dialog',{name:'Compose WhatsApp message'});await screen.findByLabelText('Approved template and language')
 expect(within(screen.getByRole('dialog')).getByRole('button',{name:'Send message'}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'Close message editor'}));expect(screen.queryByRole('dialog')).toBeNull()
})
it('opens approved templates after the service window closes while keeping free-text sending blocked',async()=>{
 render(<WhatsAppMessageComposer compact organisationId="org" conversation={{...thread,canReply:false}} onSent={()=>{}}/>)
 expect(screen.getByRole('button',{name:'Send message'}).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'Use a template'}))
 await screen.findByLabelText('Approved template and language')
 expect(api.request).toHaveBeenCalledWith('org','inbox_templates',expect.objectContaining({conversationId:thread.id}))
 expect(within(screen.getByRole('dialog')).getByRole('button',{name:'Send message'}).disabled).toBe(true)
})
