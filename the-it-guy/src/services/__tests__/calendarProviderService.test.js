import {beforeEach,it,expect,vi} from 'vitest'
const api=vi.hoisted(()=>({rpc:vi.fn(),invoke:vi.fn()}))
vi.mock('../../lib/supabaseClient',()=>({supabase:{rpc:api.rpc},isSupabaseConfigured:true,invokeEdgeFunction:api.invoke,getEdgeFunctionInvokeError:r=>r.error || r.data?.error}))
import {readCalendarProviderStatus,startCalendarProviderConnection,disconnectCalendarProvider,actOnCalendarProviderEvent} from '../calendarProviderService'
beforeEach(()=>vi.resetAllMocks())
it('reads only the scoped viewer RPC and rejects malformed or failed receipts',async()=>{
 api.rpc.mockResolvedValueOnce({data:{verified:true,connections:[],events:[]}})
 await readCalendarProviderStatus('org','booking');expect(api.rpc).toHaveBeenCalledWith('read_calendar_provider_status',{p_organisation_id:'org',p_appointment_id:'booking'})
 api.rpc.mockResolvedValueOnce({data:{connections:[],events:[]}});await expect(readCalendarProviderStatus('org')).rejects.toThrow('could not be verified')
 api.rpc.mockResolvedValueOnce({error:{message:'Permission denied'}});await expect(readCalendarProviderStatus('org')).rejects.toThrow('Permission denied')
})
it.each(['https://evil.example.test/','javascript:alert(1)','https://accounts.google.com.evil.example.test/'])('rejects an unexpected authorization URL %s',async url=>{
 api.invoke.mockResolvedValue({data:{authorizationUrl:url}});await expect(startCalendarProviderConnection('org','google','/pipeline/calendar')).rejects.toThrow('could not be verified')
})
it('starts through the authenticated edge helper with no browser-side tokens',async()=>{
 api.invoke.mockResolvedValue({data:{authorizationUrl:'https://accounts.google.com/o/oauth2/v2/auth?state=opaque'}})
 expect(await startCalendarProviderConnection('org','google','/mobile/calendar')).toContain('accounts.google.com')
 expect(api.invoke).toHaveBeenCalledWith('calendar-provider-connection',{body:{action:'connect',organisationId:'org',provider:'google',returnPath:'/mobile/calendar'}})
})
it('verifies disconnect and a queued event action without claiming synced',async()=>{
 api.rpc.mockResolvedValueOnce({data:{verified:true,status:'disconnected'}});await disconnectCalendarProvider('connection')
 expect(api.rpc).toHaveBeenCalledWith('disconnect_calendar_provider',{p_connection_id:'connection'})
 api.rpc.mockResolvedValueOnce({data:{verified:true,queued:true,events:[{status:'queued'}],connections:[]}})
 const result=await actOnCalendarProviderEvent({organisationId:'org',appointmentId:'booking',provider:'outlook',action:'restore',reviewToken:'review'})
 expect(result.events[0].status).toBe('queued');expect(api.rpc).toHaveBeenLastCalledWith('calendar_provider_event_action',{p_org:'org',p_appointment:'booking',p_provider:'outlook',p_action:'restore',p_review_token:'review'})
})
