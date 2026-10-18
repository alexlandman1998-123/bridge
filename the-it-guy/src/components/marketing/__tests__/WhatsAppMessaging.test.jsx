// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import WhatsAppMessageComposer from '../WhatsAppMessageComposer'
import WhatsAppUnread from '../WhatsAppUnread'
import useWhatsAppHistory from '../../../hooks/useWhatsAppHistory'

const mocks=vi.hoisted(()=>({request:vi.fn()}))
vi.mock('../../../services/metaIntegrationService',()=>({metaIntegrationRequest:mocks.request}))
const conversation={id:'thread-one',contact_name:'Fictional Customer',assignment_version:3,canReply:true}
const template={id:'800',name:'appointment',language:'en',status:'APPROVED',category:'UTILITY',components:[{type:'BODY',text:'Hello {{1}}, your appointment is confirmed.'}]}
const permission={status:'opted_in',version:2,source:'Signed form',consent_at:'2026-10-01T10:00:00Z'}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
beforeEach(()=>{mocks.request.mockReset();mocks.request.mockImplementation(async(_org,action)=>{
  if(action==='inbox_templates')return {templates:[template]}
  if(action==='message_permission')return {permission}
  if(action==='send_message')return {message:{delivery_status:'sent'}}
  throw Error(`Unexpected ${action}`)
})})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
const composer=(props={})=><WhatsAppMessageComposer organisationId="agency-one" conversation={conversation} onSent={vi.fn()} {...props}/>

it('sends an approved template outside the reply window only after reviewing the recipient and filling its variables',async()=>{
  render(composer({conversation:{...conversation,canReply:false}}))
  fireEvent.change(await screen.findByLabelText('Approved template and language'),{target:{value:'800'}})
  fireEvent.change(screen.getByLabelText('Body · 1'),{target:{value:'Fictional Customer'}})
  expect(screen.getByLabelText('Template preview').textContent).toContain('Hello Fictional Customer')
  expect(screen.getByRole('button',{name:'Send message'}).disabled).toBe(true)
  fireEvent.click(screen.getByLabelText(/I reviewed this template/))
  fireEvent.click(screen.getByRole('button',{name:'Send message'}))
  await screen.findByText('Message sent.')
  expect(mocks.request).toHaveBeenCalledWith('agency-one','send_message',expect.objectContaining({conversationId:'thread-one',assignmentVersion:3,kind:'template',template,values:{'body.1':{source:'text',text:'Fictional Customer'}}}))
})

it('requires review again after refreshing a changed template',async()=>{
  render(composer({conversation:{...conversation,canReply:false}}))
  fireEvent.change(await screen.findByLabelText('Approved template and language'),{target:{value:'800'}})
  fireEvent.click(screen.getByLabelText(/I reviewed this template/))
  expect(screen.getByRole('button',{name:'Send message'}).disabled).toBe(false)
  const changed={...template,components:[{type:'BODY',text:'A refreshed appointment message'}]}
  mocks.request.mockImplementation(async(_org,action)=>action==='inbox_templates'?{templates:[changed]}:{permission})
  fireEvent.click(screen.getByRole('button',{name:'Refresh templates and permission'}))
  await screen.findByText('A refreshed appointment message')
  expect(screen.getByLabelText(/I reviewed this template/).checked).toBe(false)
  expect(screen.getByRole('button',{name:'Send message'}).disabled).toBe(true)
})

it('records direct-message agreement separately before enabling a template send',async()=>{
  const original=mocks.request.getMockImplementation()
  mocks.request.mockImplementation(async(org,action,fields)=>action==='message_permission'?{permission:fields.operation==='save'?permission:null}:original(org,action,fields))
  render(composer({conversation:{...conversation,canReply:false}}))
  fireEvent.change(await screen.findByLabelText('Approved template and language'),{target:{value:'800'}})
  fireEvent.click(screen.getByLabelText(/I reviewed this template/))
  expect(screen.getByRole('button',{name:'Send message'}).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('How did they agree?'),{target:{value:'Recipient asked for WhatsApp updates'}})
  fireEvent.change(screen.getByLabelText('When did they agree?'),{target:{value:'2026-10-01T12:00'}})
  fireEvent.click(screen.getByLabelText('The recipient agreed to receive these WhatsApp messages.'))
  fireEvent.click(screen.getByRole('button',{name:'Record message permission'}))
  await screen.findByText(/WhatsApp message permission recorded/)
  expect(mocks.request).toHaveBeenCalledWith('agency-one','message_permission',expect.objectContaining({conversationId:'thread-one',operation:'save',assignmentVersion:3,version:0,confirmed:true,source:'Recipient asked for WhatsApp updates'}))
  expect(mocks.request.mock.calls.some(call=>['send_message','save_contacts'].includes(call[1]))).toBe(false)
})

it('can record newer direct-message agreement after a bulk opt-out without changing campaign permission',async()=>{
  const original=mocks.request.getMockImplementation()
  mocks.request.mockImplementation(async(org,action,fields)=>action==='message_permission'&&fields.operation==='save'?{permission:{...permission,version:3,consent_at:fields.consentAt}}:original(org,action,fields))
  render(composer({conversation:{...conversation,canReply:false}}))
  fireEvent.change(await screen.findByLabelText('Approved template and language'),{target:{value:'800'}})
  fireEvent.click(screen.getByLabelText(/I reviewed this template/))
  fireEvent.click(screen.getByRole('button',{name:'Update message permission'}))
  expect(screen.getByRole('button',{name:'Send message'}).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('How did they agree?'),{target:{value:'Recipient explicitly renewed direct follow-ups'}})
  fireEvent.change(screen.getByLabelText('When did they agree?'),{target:{value:'2026-10-18T10:00'}})
  fireEvent.click(screen.getByLabelText('The recipient agreed to receive these WhatsApp messages.'))
  fireEvent.click(screen.getByRole('button',{name:'Record message permission'}))
  await screen.findByRole('button',{name:'Update message permission'})
  expect(screen.getByLabelText(/I reviewed this template/).checked).toBe(false)
  expect(mocks.request).toHaveBeenCalledWith('agency-one','message_permission',expect.objectContaining({operation:'save',version:2,confirmed:true}))
  expect(mocks.request.mock.calls.every(call=>['inbox_templates','message_permission'].includes(call[1]))).toBe(true)
})

it('uploads a PDF and sends only its server-bound upload identifier and caption',async()=>{
  const original=mocks.request.getMockImplementation()
  mocks.request.mockImplementation(async(org,action,fields)=>action==='upload_attachment'?{upload:{id:'upload-one',status:'ready',filename:'brochure.pdf'}}:original(org,action,fields))
  render(composer())
  fireEvent.change(screen.getByLabelText('Message format'),{target:{value:'attachment'}})
  fireEvent.change(screen.getByLabelText('Upload photo or PDF'),{target:{files:[new File(['%PDF-1.7 fictional brochure'],'brochure.pdf',{type:'application/pdf'})]}})
  await screen.findByText('Ready: brochure.pdf')
  fireEvent.change(screen.getByLabelText('Attachment caption'),{target:{value:'Your property brochure'}})
  fireEvent.click(screen.getByRole('button',{name:'Send message'}))
  await screen.findByText('Message sent.')
  expect(mocks.request).toHaveBeenCalledWith('agency-one','upload_attachment',expect.objectContaining({assignmentVersion:3,file:expect.objectContaining({mimeType:'application/pdf',filename:'brochure.pdf'})}))
  const send=mocks.request.mock.calls.find(call=>call[1]==='send_message')[2]
  expect(send).toMatchObject({kind:'document',uploadId:'upload-one',message:'Your property brochure'})
  expect(send.file).toBeUndefined();expect(send.media).toBeUndefined()
})

it('rejects unsupported files before uploading and prevents freeform messages after the window closes',async()=>{
  render(composer({conversation:{...conversation,canReply:false}}))
  fireEvent.change(screen.getByLabelText('Message format'),{target:{value:'attachment'}})
  fireEvent.change(screen.getByLabelText('Upload photo or PDF'),{target:{files:[new File(['video'],'clip.mp4',{type:'video/mp4'})]}})
  await screen.findByText('Choose a JPEG/PNG up to 5 MB or PDF up to 8 MB.')
  expect(screen.getByRole('button',{name:'Send message'}).disabled).toBe(true)
  expect(mocks.request.mock.calls.some(call=>call[1]==='upload_attachment')).toBe(false)
})

it('checks an uncertain send without resending and retries only the same immutable request',async()=>{
  mocks.request.mockImplementation(async(_org,action)=>{
    if(action==='send_message')throw Error('Connection lost')
    if(action==='message_receipt')return {message:null}
    throw Error(`Unexpected ${action}`)
  })
  render(composer())
  fireEvent.change(screen.getByLabelText('Reply'),{target:{value:'One intentional message'}})
  fireEvent.click(screen.getByRole('button',{name:'Send message'}))
  fireEvent.click(await screen.findByRole('button',{name:'Check message'}))
  fireEvent.click(await screen.findByRole('button',{name:'Retry same message'}))
  await waitFor(()=>expect(mocks.request.mock.calls.filter(call=>call[1]==='send_message')).toHaveLength(2))
  const sends=mocks.request.mock.calls.filter(call=>call[1]==='send_message')
  expect(sends[1][2]).toEqual(sends[0][2])
  await waitFor(()=>expect(screen.getByRole('button',{name:'Check message'}).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button',{name:'Edit this attempt'}))
  fireEvent.change(screen.getByLabelText('Reply'),{target:{value:'A correction before a claim exists'}})
  fireEvent.click(screen.getByRole('button',{name:'Send message'}))
  await waitFor(()=>expect(mocks.request.mock.calls.filter(call=>call[1]==='send_message')).toHaveLength(3))
  expect(mocks.request.mock.calls.filter(call=>call[1]==='send_message')[2][2].requestId).toBe(sends[0][2].requestId)
})

it('keeps an unconfirmed provider result visible and does not automatically resubmit it',async()=>{
  mocks.request.mockResolvedValue({message:{delivery_status:'unknown'}})
  render(composer())
  fireEvent.change(screen.getByLabelText('Reply'),{target:{value:'Check delivery'}})
  fireEvent.click(screen.getByRole('button',{name:'Send message'}))
  await screen.findByText(/The send result is unconfirmed/)
  expect(mocks.request).toHaveBeenCalledTimes(1)
  expect(screen.getByLabelText('Reply').value).toBe('')
})

const row=(id,time)=>({id,event_at:time,last_message_at:time,body_text:id})
const historyProps={organisationId:'agency-one',accessScope:'agency-one:agent-one',conversationId:'thread-one',thread:true}
it('merges older history with a refreshed newest page without duplicates or losing the next older cursor',async()=>{
  const newest=row('message-c','2026-10-18T12:00:00Z'),older=row('message-b','2026-10-17T12:00:00Z'),oldest=row('message-a','2026-10-16T12:00:00Z')
  const cursor={at:older.event_at,id:older.id},oldCursor={at:oldest.event_at,id:oldest.id}
  mocks.request.mockResolvedValueOnce({messages:[newest,older],nextCursor:cursor}).mockResolvedValueOnce({messages:[older,oldest],nextCursor:oldCursor}).mockResolvedValueOnce({messages:[{...newest,body_text:'Updated status'}],nextCursor:cursor})
  const hook=renderHook(()=>useWhatsAppHistory(historyProps))
  await waitFor(()=>expect(hook.result.current.rows).toHaveLength(2))
  await act(()=>hook.result.current.loadOlder())
  expect(mocks.request).toHaveBeenLastCalledWith('agency-one','message_page',{conversationId:'thread-one',cursor})
  await act(()=>hook.result.current.refresh())
  expect(hook.result.current.rows.map(item=>item.id)).toEqual(['message-c','message-b','message-a'])
  expect(hook.result.current.rows[0].body_text).toBe('Updated status')
  expect(hook.result.current.nextCursor).toEqual(oldCursor)
})

it('removes cached older conversations after a handoff and clears private history on access failure',async()=>{
  const newest=row('thread-c','2026-10-18T12:00:00Z'),older=row('thread-b','2026-10-17T12:00:00Z'),cursor={at:newest.event_at,id:newest.id}
  mocks.request.mockResolvedValueOnce({conversations:[newest],nextCursor:cursor,visibleIds:[]}).mockResolvedValueOnce({conversations:[older],visibleIds:['thread-c']}).mockResolvedValueOnce({conversations:[newest],visibleIds:['thread-c']}).mockRejectedValueOnce(Error('Membership revoked'))
  const hook=renderHook(()=>useWhatsAppHistory({...historyProps,thread:false}))
  await waitFor(()=>expect(hook.result.current.rows).toHaveLength(1))
  await act(()=>hook.result.current.loadOlder());expect(hook.result.current.rows).toHaveLength(2)
  await act(()=>hook.result.current.refresh());expect(hook.result.current.rows.map(item=>item.id)).toEqual(['thread-c'])
  await act(()=>hook.result.current.refresh());expect(hook.result.current.rows).toEqual([]);expect(hook.result.current.error).toBe('Membership revoked')
})

it('can fill the gap after more than one page of new messages arrives while retaining older history',async()=>{
  const old=row('old','2026-10-16T12:00:00Z'),latest=row('latest','2026-10-18T12:00:00Z'),middle=row('middle','2026-10-17T12:00:00Z')
  const oldCursor={at:old.event_at,id:old.id},gapCursor={at:latest.event_at,id:latest.id}
  mocks.request.mockResolvedValueOnce({messages:[old],nextCursor:oldCursor}).mockResolvedValueOnce({messages:[],nextCursor:null}).mockResolvedValueOnce({messages:[latest],nextCursor:gapCursor}).mockResolvedValueOnce({messages:[middle,old],nextCursor:null})
  const hook=renderHook(()=>useWhatsAppHistory(historyProps))
  await waitFor(()=>expect(hook.result.current.rows).toHaveLength(1))
  await act(()=>hook.result.current.loadOlder())
  await act(()=>hook.result.current.refresh())
  expect(hook.result.current.rows.map(item=>item.id)).toEqual(['latest','old'])
  expect(hook.result.current.nextCursor).toEqual(gapCursor)
  await act(()=>hook.result.current.loadOlder())
  expect(mocks.request).toHaveBeenLastCalledWith('agency-one','message_page',{conversationId:'thread-one',cursor:gapCursor})
  expect(hook.result.current.rows.map(item=>item.id)).toEqual(['latest','middle','old'])
  expect(hook.result.current.nextCursor).toBeNull()
})

it('rechecks every cached conversation beyond 1,000 using bounded requests without dropping older pages',async()=>{
  mocks.request.mockImplementation(async(_org,_action,fields)=>{
    const offset=Number(fields.cursor?.id||0)
    return {conversations:Array.from({length:50},(_,index)=>row(`thread-${String(offset+index).padStart(4,'0')}`,new Date(Date.UTC(2026,9,18,12)-1000*(offset+index)).toISOString())),visibleIds:fields.knownIds,nextCursor:{at:'2026-10-18',id:String(offset+50)}}
  })
  const hook=renderHook(()=>useWhatsAppHistory({...historyProps,thread:false}))
  await waitFor(()=>expect(hook.result.current.rows).toHaveLength(50))
  for(let page=0;page<20;page++)await act(()=>hook.result.current.loadOlder())
  expect(hook.result.current.rows).toHaveLength(1050)
  const before=mocks.request.mock.calls.length
  await act(()=>hook.result.current.refresh())
  expect(mocks.request.mock.calls.length-before).toBe(2)
  expect(mocks.request.mock.calls.every(call=>call[2].knownIds.length<=1000)).toBe(true)
  expect(hook.result.current.rows).toHaveLength(1050)
})

it('discards delayed history after switching agents, even if the previous agent is selected again',async()=>{
  const first=deferred(),second=deferred(),third=deferred()
  mocks.request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockReturnValueOnce(third.promise)
  const hook=renderHook(props=>useWhatsAppHistory(props),{initialProps:historyProps})
  await waitFor(()=>expect(mocks.request).toHaveBeenCalledTimes(1))
  hook.rerender({...historyProps,accessScope:'agency-one:agent-two'})
  await waitFor(()=>expect(mocks.request).toHaveBeenCalledTimes(2))
  hook.rerender(historyProps)
  await waitFor(()=>expect(mocks.request).toHaveBeenCalledTimes(3))
  await act(async()=>{first.resolve({messages:[row('stale-private','2026-10-18')]});second.resolve({messages:[row('other-private','2026-10-18')]});await Promise.all([first.promise,second.promise])})
  expect(hook.result.current.rows).toEqual([])
  await act(async()=>{third.resolve({messages:[row('allowed-now','2026-10-18')]});await third.promise})
  expect(hook.result.current.rows.map(item=>item.id)).toEqual(['allowed-now'])
})

it('shows private in-app unread totals and refreshes after reading without displaying message bodies',async()=>{
  mocks.request.mockResolvedValueOnce({unreadCount:3,conversations:[{body_text:'Private content'}]}).mockResolvedValueOnce({unreadCount:0})
  render(<MemoryRouter><WhatsAppUnread organisationId="agency-one" viewerId="agent-one" role="agent"/></MemoryRouter>)
  const link=await screen.findByRole('link',{name:'WhatsApp, 3 unread messages'})
  expect(link.getAttribute('href')).toContain('organisationId=agency-one')
  expect(screen.queryByText('Private content')).toBeNull()
  await act(async()=>window.dispatchEvent(new Event('arch9:whatsapp-read')))
  await screen.findByRole('link',{name:'WhatsApp inbox'})
  expect(mocks.request.mock.calls.every(call=>call[1]==='inbox_notifications')).toBe(true)
})

it('clears unread badges immediately on membership changes and ignores a delayed previous response',async()=>{
  const delayed=deferred()
  mocks.request.mockResolvedValueOnce({unreadCount:9}).mockReturnValueOnce(delayed.promise).mockRejectedValueOnce(Error('Access revoked'))
  const node=(role)=><MemoryRouter><WhatsAppUnread organisationId="agency-one" viewerId="agent-one" role={role}/></MemoryRouter>
  const view=render(node('principal'))
  await screen.findByRole('link',{name:'WhatsApp, 9 unread messages'})
  act(()=>window.dispatchEvent(new Event('focus')))
  view.rerender(node('agent'))
  expect(screen.queryByText('9')).toBeNull()
  await screen.findByRole('link',{name:'WhatsApp messages unavailable'})
  await act(async()=>{delayed.resolve({unreadCount:99});await delayed.promise})
  expect(screen.queryByText('99')).toBeNull()
})

it('clears cached older content after an edit or deletion and reloads current history',async()=>{
 const latest=row('latest','2026-10-18'),old=row('old-private','2026-10-17'),cursor={at:latest.event_at,id:latest.id}
 mocks.request.mockResolvedValueOnce({conversation:{content_version:0},messages:[latest],nextCursor:cursor}).mockResolvedValueOnce({conversation:{content_version:0},messages:[old],nextCursor:null}).mockResolvedValueOnce({conversation:{content_version:1},messages:[latest],nextCursor:cursor}).mockResolvedValueOnce({conversation:{content_version:1},messages:[{...old,body_text:'',revoked_at:'2026-10-18'}],nextCursor:null})
 const hook=renderHook(()=>useWhatsAppHistory(historyProps))
 await waitFor(()=>expect(hook.result.current.rows).toHaveLength(1))
 await act(()=>hook.result.current.loadOlder());expect(hook.result.current.rows).toHaveLength(2)
 await act(()=>hook.result.current.refresh())
 expect(hook.result.current.rows.map(item=>item.id)).toEqual(['latest'])
 expect(hook.result.current.nextCursor).toEqual(cursor)
 expect(hook.result.current.olderLoaded).toBe(false)
 await act(()=>hook.result.current.loadOlder())
 expect(hook.result.current.rows[1].body_text).toBe('');expect(hook.result.current.rows[1].revoked_at).toBe('2026-10-18')
})
it('returns to the current newest page when an older-page request detects changed content',async()=>{
 const cursor={at:'2026-10-18',id:'latest'}
 mocks.request.mockResolvedValueOnce({conversation:{content_version:0},messages:[row('latest','2026-10-18')],nextCursor:cursor}).mockResolvedValueOnce({conversation:{content_version:1},messages:[row('old-stale-position','2026-10-17')],nextCursor:null}).mockResolvedValueOnce({conversation:{content_version:1},messages:[row('fresh-head','2026-10-19')],nextCursor:cursor})
 const hook=renderHook(()=>useWhatsAppHistory(historyProps))
 await waitFor(()=>expect(hook.result.current.rows).toHaveLength(1))
 await act(()=>hook.result.current.loadOlder())
 expect(hook.result.current.rows.map(item=>item.id)).toEqual(['fresh-head'])
 expect(mocks.request).toHaveBeenLastCalledWith('agency-one','message_page',{conversationId:'thread-one'})
})
