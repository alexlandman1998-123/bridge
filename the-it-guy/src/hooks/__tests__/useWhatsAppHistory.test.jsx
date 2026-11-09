// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import useWhatsAppHistory from '../useWhatsAppHistory'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'
vi.mock('../../services/metaIntegrationService',()=>({metaIntegrationRequest:vi.fn()}))
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}}
const options={organisationId:'org-a',accessScope:'org-a:user-a'}
beforeEach(()=>{metaIntegrationRequest.mockReset()})
afterEach(cleanup)
it('shows the first page after a development effect restart without waiting for the 15-second poll',async()=>{
 const cancelled=deferred(),current=deferred();metaIntegrationRequest.mockReturnValueOnce(cancelled.promise).mockReturnValueOnce(current.promise)
 const hook=renderHook(()=>useWhatsAppHistory(options),{reactStrictMode:true})
 await waitFor(()=>expect(metaIntegrationRequest).toHaveBeenCalledTimes(2))
 await act(async()=>{current.resolve({conversations:[{id:'current',last_message_at:'2026-11-03'}]});await current.promise})
 expect(hook.result.current.loading).toBe(false);expect(hook.result.current.rows.map(row=>row.id)).toEqual(['current'])
 await act(async()=>{cancelled.resolve({conversations:[{id:'stale'}]});await cancelled.promise})
 expect(hook.result.current.rows.map(row=>row.id)).toEqual(['current'])
})
it('deduplicates concurrent refreshes during an active request',async()=>{
 const request=deferred();metaIntegrationRequest.mockReturnValue(request.promise);const hook=renderHook(()=>useWhatsAppHistory(options))
 await act(async()=>{void hook.result.current.refresh();void hook.result.current.refresh()})
 expect(metaIntegrationRequest).toHaveBeenCalledTimes(1)
 await act(async()=>{request.resolve({conversations:[]});await request.promise});expect(hook.result.current.loading).toBe(false)
})
it('clears old organisation rows and ignores late responses after switching access scope',async()=>{
 const old=deferred(),current=deferred();metaIntegrationRequest.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
 const hook=renderHook(props=>useWhatsAppHistory(props),{initialProps:options});hook.rerender({organisationId:'org-b',accessScope:'org-b:user-a'})
 expect(hook.result.current.rows).toEqual([])
 await act(async()=>{current.resolve({conversations:[{id:'org-b-chat',last_message_at:'2026-11-03'}]});await current.promise;old.resolve({conversations:[{id:'private-old'}]});await old.promise})
 expect(hook.result.current.rows.map(row=>row.id)).toEqual(['org-b-chat'])
})
it('passes full-history search and queue filters to the server without marking the thread read',async()=>{
 metaIntegrationRequest.mockResolvedValue({conversations:[],counts:{all:10000}})
 const hook=renderHook(()=>useWhatsAppHistory({...options,search:'floor plan',view:'mine',channelId:'sender'}))
 await waitFor(()=>expect(hook.result.current.loading).toBe(false))
 expect(metaIntegrationRequest).toHaveBeenCalledWith('org-a','inbox_page',expect.objectContaining({search:'floor plan',view:'mine',channelId:'sender'}))
 expect(metaIntegrationRequest.mock.calls.some(call=>call[1]==='inbox_work')).toBe(false)
})
it('keeps existing history after a transient outage and clears it immediately after access denial',async()=>{
 metaIntegrationRequest.mockResolvedValueOnce({conversations:[{id:'allowed',last_message_at:'2026-11-09'}],visibleIds:['allowed']}).mockRejectedValueOnce(Error('Network timeout')).mockRejectedValueOnce(Object.assign(Error('Membership revoked'),{status:403}))
 const hook=renderHook(()=>useWhatsAppHistory(options));await waitFor(()=>expect(hook.result.current.rows).toHaveLength(1))
 await act(()=>hook.result.current.refresh());expect(hook.result.current.rows).toHaveLength(1);expect(hook.result.current.error).toBe('Network timeout')
 await act(()=>hook.result.current.refresh());expect(hook.result.current.rows).toEqual([])
})
it('does not request a hidden optional conversation until enabled',async()=>{
 metaIntegrationRequest.mockResolvedValue({messages:[]})
 const hook=renderHook(props=>useWhatsAppHistory({...options,thread:true,conversationId:'thread',enabled:props.enabled}),{initialProps:{enabled:false}})
 expect(metaIntegrationRequest).not.toHaveBeenCalled();hook.rerender({enabled:true});await waitFor(()=>expect(metaIntegrationRequest).toHaveBeenCalledTimes(1))
})
