// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import InboxThreadMessages from '../InboxThreadMessages.jsx'
import { safeEmailDocument } from '../../../modules/sharedInbox/safeEmailDocument.js'
const api=vi.hoisted(()=>({load:vi.fn(),activity:vi.fn(),download:vi.fn()}))
vi.mock('../../../modules/sharedInbox/receivedMailService.js',()=>({loadConversationPage:api.load,loadConversationActivity:api.activity,downloadMailAttachment:api.download}))
const conversation={id:'thread',name:'Client',channel:'email'}, props={organisationId:'org',conversation,agentName:'Agent',revision:1}
const message=(id,extra={})=>({id,direction:'inbound',message_type:'message',sender_address:'client@example.test',recipient_addresses:['sales@example.test'],body_text:`Message ${id}`,occurred_at:'2026-10-25T12:00:00Z',attachments:[],...extra})
const deferred=()=>{let resolve;return {promise:new Promise(done=>{resolve=done}),resolve:value=>resolve(value)}}
beforeEach(()=>{vi.resetAllMocks();api.load.mockResolvedValue({messages:[message('recent')],hasMore:false});api.activity.mockResolvedValue([])})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
it('loads only the current thread and renders full plain text',async()=>{
 render(<InboxThreadMessages {...props}/>);await screen.findByText('Message recent')
 expect(api.load).toHaveBeenCalledWith({organisationId:'org',conversationId:'thread',before:null})
 expect(screen.getByText(/From: client@example.test/)).toBeTruthy()
})
it('prepends older messages with the timestamp and id cursor',async()=>{
 api.load.mockResolvedValueOnce({messages:[message('recent')],hasMore:true}).mockResolvedValueOnce({messages:[message('old')],hasMore:false})
 render(<InboxThreadMessages {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Load older messages'}))
 await screen.findByText('Message old')
 expect(api.load.mock.calls[1][0].before).toEqual(message('recent'))
 expect([...document.querySelectorAll('.inbox-message-text')].map(node=>node.textContent)).toEqual(['Message old','Message recent'])
})
it('shows a retry after a thread fails',async()=>{
 api.load.mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce({messages:[message('retry')],hasMore:false})
 render(<InboxThreadMessages {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Refresh conversation'}))
 await screen.findByText('Message retry')
})
it('discards late messages after leaving a mailbox',async()=>{
 const pending=deferred();api.load.mockReturnValueOnce(pending.promise)
 const view=render(<InboxThreadMessages key="one" {...props}/>);
 view.rerender(<InboxThreadMessages key="two" {...props} organisationId="other" conversation={{...conversation,id:'other-thread'}}/>);
 await screen.findByText('Message recent')
 await act(async()=>pending.resolve({messages:[message('private')],hasMore:false}))
 expect(screen.queryByText('Message private')).toBeNull()
})
it('sanitizes scripts, forms, trackers, styles and unsafe links',()=>{
 const document=safeEmailDocument('<script>alert(1)</script><form action="https://evil.test"><input></form><img src="https://tracker.test"><p style="background:url(https://tracker.test)" onclick="alert(1)">Hello <b>client</b></p><a href="javascript:alert(1)">Bad</a>')
 for(const unsafe of ['<script','<img','<form','onclick','tracker.test','javascript:']) expect(document).not.toContain(unsafe)
 expect(document).toContain('<b>client</b>');expect(document).toContain("default-src 'none'")
})
it('HTML-only mail opens safely and keeps plain text available',async()=>{
 api.load.mockResolvedValue({messages:[message('html',{body_text:'',body_html:'<p>Formatted body</p>'})],hasMore:false})
 render(<InboxThreadMessages {...props}/>);
 const frame=await screen.findByTitle('Formatted email html');expect(frame.getAttribute('sandbox')).toBe('');expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
 fireEvent.click(screen.getByRole('button',{name:'Show plain text'}));expect(screen.getByText(/no plain text version/)).toBeTruthy()
})
it('shows body and attachment limits clearly',async()=>{
 api.load.mockResolvedValue({messages:[message('limited',{content_status:'body_limited',attachments:[{id:'large',filename:'large.pdf',state:'too_large'},{id:'cloud',filename:'Cloud item',state:'unsupported'}]})],hasMore:false})
 render(<InboxThreadMessages {...props}/>);await screen.findByText(/exceeds the display limit/)
 expect(screen.getByText(/large.pdf.*Exceeds attachment limit/)).toBeTruthy();expect(screen.getByText(/Cloud item.*must be opened/)).toBeTruthy()
 expect(api.download).not.toHaveBeenCalled()
})
it('downloads only after a fresh authenticated request',async()=>{
 api.load.mockResolvedValue({messages:[message('file',{attachments:[{id:'attachment',filename:'offer.pdf',size:123,state:'available'}]})],hasMore:false})
 api.download.mockResolvedValue(new Blob(['file']))
 const create=vi.fn(()=> 'blob:private'),revoke=vi.fn()
 vi.stubGlobal('URL',class extends URL{static createObjectURL=create;static revokeObjectURL=revoke})
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 render(<InboxThreadMessages {...props}/>);fireEvent.click(await screen.findByRole('button',{name:/Download offer.pdf/}))
 await waitFor(()=>expect(click).toHaveBeenCalled())
 expect(api.download).toHaveBeenCalledWith({organisationId:'org',attachmentId:'attachment'});expect(create).toHaveBeenCalledOnce()
})
it('does not open a late attachment after switching mailbox',async()=>{
 const pending=deferred();api.download.mockReturnValue(pending.promise)
 api.load.mockResolvedValue({messages:[message('file',{attachments:[{id:'attachment',filename:'offer.pdf',size:123,state:'available'}]})],hasMore:false})
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 const view=render(<InboxThreadMessages {...props}/>);fireEvent.click(await screen.findByRole('button',{name:/Download offer.pdf/}));view.unmount()
 await act(async()=>pending.resolve(new Blob(['file'])))
 expect(click).not.toHaveBeenCalled()
})
