// @vitest-environment jsdom
import React from 'react'
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import InboxEmailActions from '../InboxEmailActions.jsx'
const api=vi.hoisted(()=>({mailboxes:vi.fn(),queue:vi.fn(),upload:vi.fn(),outgoing:vi.fn(),action:vi.fn(),reply:vi.fn()}))
vi.mock('../../../modules/sharedInbox/outgoingMailService.js',()=>({loadReplyContext:api.reply,loadSendingMailboxes:api.mailboxes,queueOutgoingEmail:api.queue,uploadOutgoingAttachment:api.upload,loadOutgoingEmails:api.outgoing,changeOutgoingEmail:api.action}))
const org='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',user='11111111-1111-4111-8111-111111111111'
const one={id:'22222222-2222-4222-8222-222222222222',address:'one@example.test',displayName:'Mailbox One',providerKey:'google_workspace',connected:true,signature:{name:'Signature One',body:[]},signatureRevision:3,useForNew:true,useForReplies:false}
const two={...one,id:'33333333-3333-4333-8333-333333333333',address:'two@example.test',displayName:'Mailbox Two',signature:{name:'Signature Two',body:[]},signatureRevision:9,useForNew:false,useForReplies:true}
const props={organisationId:org,userId:user,onQueued:vi.fn()}
const deferred=()=>{let resolve;let reject;return{promise:new Promise((a,b)=>{resolve=a;reject=b}),resolve:v=>resolve(v),reject:v=>reject(v)}}
const open=async()=>{render(<InboxEmailActions {...props}/>);const button=await screen.findByRole('button',{name:'New email'});await waitFor(()=>expect(button.disabled).toBe(false));fireEvent.click(button);await screen.findByRole('dialog',{name:'New email'})}
const compose=()=>{fireEvent.change(screen.getByLabelText('To'),{target:{value:'client@example.test'}});fireEvent.change(screen.getByLabelText('Subject'),{target:{value:'Offer update'}});fireEvent.change(screen.getByLabelText('Message'),{target:{value:'Body <safe>'}})}
beforeEach(()=>{vi.resetAllMocks();api.mailboxes.mockResolvedValue([one,two]);api.queue.mockResolvedValue({id:'job',status:'queued',conversationId:'conversation'});api.outgoing.mockResolvedValue([]);api.reply.mockResolvedValue(null);props.onQueued.mockReset()})
afterEach(cleanup)
it('selects the sender and signature independently for multiple mailboxes',async()=>{
 await open();expect(screen.getByLabelText('From mailbox').value).toBe(one.id);expect(screen.getByLabelText(/Include this mailbox/).checked).toBe(true)
 fireEvent.change(screen.getByLabelText('From mailbox'),{target:{value:two.id}})
 expect(screen.getByLabelText(/Include this mailbox/).checked).toBe(false)
 fireEvent.click(screen.getByLabelText(/Include this mailbox/));compose();fireEvent.change(screen.getByLabelText('Cc'),{target:{value:'copy@example.test'}});fireEvent.change(screen.getByLabelText('Bcc'),{target:{value:'private@example.test'}})
 fireEvent.click(screen.getByRole('button',{name:'Send email'}));await waitFor(()=>expect(api.queue).toHaveBeenCalledOnce())
 expect(api.queue.mock.calls[0][0]).toEqual(expect.objectContaining({organisationId:org,channelId:two.id,requestId:expect.any(String),email:expect.objectContaining({to:['client@example.test'],cc:['copy@example.test'],bcc:['private@example.test'],body:'Body <safe>',useSignature:true,signatureRevision:9})}))
 expect(props.onQueued).toHaveBeenCalledWith(expect.objectContaining({status:'queued'}));expect(screen.queryByRole('dialog')).toBeNull()
})
it('keeps a reply on its original mailbox with reply signature defaults and a draft copy',async()=>{
 render(<InboxEmailActions {...props} selected={{id:'44444444-4444-4444-8444-444444444444',channelId:two.id,channel:'email',address:'reply@example.test',subject:'Viewing'}} replyDraft="Existing private draft"/>);
 fireEvent.click(await screen.findByRole('button',{name:'Reply by email'}));await screen.findByRole('dialog',{name:'Reply by email'});expect(screen.getByLabelText('From mailbox').disabled).toBe(true);expect(screen.getByLabelText('From mailbox').value).toBe(two.id);expect(screen.getByLabelText(/Include this mailbox/).checked).toBe(true);expect(screen.getByLabelText('To').value).toBe('reply@example.test');expect(screen.getByLabelText('Message').value).toBe('Existing private draft')
 await waitFor(()=>expect(screen.getByRole('button',{name:'Send email'}).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Send email'}));await waitFor(()=>expect(api.queue).toHaveBeenCalled())
 expect(api.queue.mock.calls[0][0].email.conversationId).toBe('44444444-4444-4444-8444-444444444444')
})
it('blocks viewer sending and sending from disconnected or unconfigured SMTP mailboxes',async()=>{
 api.mailboxes.mockResolvedValueOnce([]);const first=render(<InboxEmailActions {...props}/>);await waitFor(()=>expect(api.mailboxes).toHaveBeenCalled());expect(screen.getByRole('button',{name:'New email'}).disabled).toBe(true);first.unmount()
 api.mailboxes.mockResolvedValue([{...one,providerKey:'other_email',smtpConfigured:false}]);await open();expect(screen.getByRole('button',{name:'Send email'}).disabled).toBe(true);expect(screen.getByText(/configure SMTP.*before sending/)).toBeTruthy()
})
it('validates addresses without queuing a forged header',async()=>{
 await open();compose();fireEvent.change(screen.getByLabelText('To'),{target:{value:'not-an-address'}});fireEvent.click(screen.getByRole('button',{name:'Send email'}));await screen.findByRole('alert');expect(api.queue).not.toHaveBeenCalled()
})
it('uploads attachments before queueing and clears them when changing sender',async()=>{
 await open();const file=new File(['data'],'offer.pdf',{type:'application/pdf'});fireEvent.change(screen.getByLabelText('Attachments'),{target:{files:[file]}});expect(screen.getByRole('button',{name:'Remove offer.pdf'})).toBeTruthy()
 fireEvent.change(screen.getByLabelText('From mailbox'),{target:{value:two.id}});expect(screen.queryByRole('button',{name:'Remove offer.pdf'})).toBeNull()
 fireEvent.change(screen.getByLabelText('Attachments'),{target:{files:[file]}});api.upload.mockResolvedValue({id:'55555555-5555-4555-8555-555555555555'});compose();fireEvent.click(screen.getByRole('button',{name:'Send email'}));await waitFor(()=>expect(api.queue).toHaveBeenCalled());expect(api.upload).toHaveBeenCalledWith({organisationId:org,channelId:two.id,file});expect(api.queue.mock.calls[0][0].email.attachmentIds).toEqual(['55555555-5555-4555-8555-555555555555'])
})
it('blocks double clicks and reuses one request ID after an unconfirmed queue response',async()=>{
 const pending=deferred();api.queue.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({id:'job',status:'queued'});await open();compose();fireEvent.click(screen.getByRole('button',{name:'Send email'}));fireEvent.submit(document.querySelector('[role=dialog] form'));expect(api.queue).toHaveBeenCalledOnce()
 await act(async()=>pending.reject(Error('network failed')));expect(screen.getByLabelText('Message').disabled).toBe(true);expect(screen.getByRole('button',{name:'Check queue status'})).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Retry same email request'}));await waitFor(()=>expect(api.queue).toHaveBeenCalledTimes(2));expect(api.queue.mock.calls[0][0]).toEqual(api.queue.mock.calls[1][0])
})
it('can resolve an uncertain queue request without submitting it again',async()=>{
 api.queue.mockRejectedValueOnce(Error('network'));api.outgoing.mockResolvedValue([{id:'existing-job',status:'submitting',conversationId:'thread'}]);await open();compose();fireEvent.click(screen.getByRole('button',{name:'Send email'}));fireEvent.click(await screen.findByRole('button',{name:'Check queue status'}));await waitFor(()=>expect(props.onQueued).toHaveBeenCalledWith({id:'existing-job',status:'submitting',conversationId:'thread'}));expect(api.queue).toHaveBeenCalledOnce()
})
it('does not queue after an upload finishes in an abandoned workspace',async()=>{
 const upload=deferred();api.upload.mockReturnValue(upload.promise);await open();compose();fireEvent.change(screen.getByLabelText('Attachments'),{target:{files:[new File(['data'],'file.pdf')]}});fireEvent.click(screen.getByRole('button',{name:'Send email'}));cleanup();await act(async()=>upload.resolve({id:'55555555-5555-4555-8555-555555555555'}));expect(api.queue).not.toHaveBeenCalled()
})
it('offers retry only for failed requests and cancellation only before submission',async()=>{
 api.outgoing.mockResolvedValue([{id:'failed',subject:'Failed request',status:'failed',createdAt:'2026-10-25T12:00:00Z'},{id:'unknown',subject:'Unknown request',status:'uncertain',createdAt:'2026-10-25T12:00:00Z'},{id:'queued',subject:'Queued request',status:'queued',createdAt:'2026-10-25T12:00:00Z'}]);render(<InboxEmailActions {...props}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Outgoing email'}).disabled).toBe(false));fireEvent.click(screen.getByRole('button',{name:'Outgoing email'}));await screen.findByText('Unknown request')
 expect(screen.getAllByRole('button',{name:'Retry unchanged email'})).toHaveLength(1);expect(screen.getAllByRole('button',{name:'Cancel queued email'})).toHaveLength(1);expect(screen.getByText(/Automatic resend is blocked/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Retry unchanged email'}));await waitFor(()=>expect(api.action).toHaveBeenCalledWith({organisationId:org,jobId:'failed',action:'retry'}))
})
it('escapes signature and message previews and traps modal focus',async()=>{
 await open();compose();const frame=screen.getByTitle('Outgoing email preview');expect(frame.getAttribute('sandbox')).toBe('');expect(frame.srcdoc).toContain('Body &lt;safe&gt;');expect(frame.srcdoc).toContain('Signature One');const dialog=screen.getByRole('dialog');const buttons=within(dialog).getAllByRole('button');buttons.at(-1).focus();fireEvent.keyDown(buttons.at(-1),{key:'Tab'});expect(document.activeElement).toBe(buttons[0])
})

it('uses the original message Reply-To address and snapshots its identity',async()=>{
 api.reply.mockResolvedValue({messageId:'66666666-6666-4666-8666-666666666666',to:['reply-to@example.test'],subject:'Original provider subject'})
 render(<InboxEmailActions {...props} selected={{id:'44444444-4444-4444-8444-444444444444',channelId:one.id,channel:'email',address:'from@example.test',subject:'Old preview'}} replyDraft="Reply body"/>)
 fireEvent.click(await screen.findByRole('button',{name:'Reply by email'}))
 await waitFor(()=>expect(screen.getByLabelText('To').value).toBe('reply-to@example.test'))
 expect(screen.getByLabelText('Subject').value).toBe('Re: Original provider subject')
 fireEvent.click(screen.getByRole('button',{name:'Send email'}));await waitFor(()=>expect(api.queue).toHaveBeenCalled())
 expect(api.queue.mock.calls[0][0].email.replyMessageId).toBe('66666666-6666-4666-8666-666666666666')
})

it('refreshes signature and connection settings whenever the composer opens',async()=>{
 api.mailboxes.mockResolvedValueOnce([one]).mockResolvedValueOnce([{...one,signatureRevision:4,signature:{name:'Updated signature',body:[]}}])
 await open();compose();expect(screen.getByTitle('Outgoing email preview').srcdoc).toContain('Updated signature')
 fireEvent.click(screen.getByRole('button',{name:'Send email'}));await waitFor(()=>expect(api.queue).toHaveBeenCalled())
 expect(api.queue.mock.calls[0][0].email.signatureRevision).toBe(4)
})
