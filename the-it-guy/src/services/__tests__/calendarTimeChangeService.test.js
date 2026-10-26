import { beforeEach, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: api }))
import { changeCalendarTime, readCalendarTimeChange, readCalendarInvitation, requestCalendarTimeChangeByToken, respondCalendarTimeChangeByToken } from '../calendarTimeChangeService'
const state = { verified: true, appointmentId: 'booking', revision: 2, canManage: true, canRequest: true, supported: true, active: null, history: [], events: [] }
beforeEach(() => api.rpc.mockReset())
it('uses the scoped read and forwards cancellation to the transport', async () => {
 const signal = new AbortController().signal
 const query = Promise.resolve({data:state,error:null});query.abortSignal = vi.fn(() => query)
 api.rpc.mockReturnValue(query)
 expect(await readCalendarTimeChange('booking',{signal})).toEqual(state)
 expect(api.rpc).toHaveBeenCalledWith('get_calendar_time_change',{p_appointment_id:'booking'})
 expect(query.abortSignal).toHaveBeenCalledWith(signal)
})
it('does not start a read after cancellation', async () => {
 const controller = new AbortController();controller.abort()
 await expect(readCalendarTimeChange('booking',{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'})
 expect(api.rpc).not.toHaveBeenCalled()
})
it('sends one atomic command with the displayed revision and no browser-side delivery', async () => {
 api.rpc.mockResolvedValue({data:{verified:true,appointmentId:'booking',revision:2,state},error:null})
 expect(await changeCalendarTime({appointmentId:'booking',expectedRevision:2,commandId:'retry-key',action:'request',preferredStart:'2099-07-21T08:00Z',reason:'  Please move it  '})).toEqual(state)
 expect(api.rpc).toHaveBeenCalledTimes(1)
 expect(api.rpc).toHaveBeenCalledWith('mutate_calendar_time_change',expect.objectContaining({p_expected_revision:2,p_command_id:'retry-key',p_reason:'Please move it',p_request_id:null}))
})
it.each([{...state,appointmentId:'another'},{...state,active:{id:'request',appointment_id:'another',status:'pending'}},{...state,revision:'2'},{...state,events:null}])('rejects an unverified read result', async invalid => {
 api.rpc.mockResolvedValue({data:invalid,error:null})
 await expect(readCalendarTimeChange('booking')).rejects.toThrow(/verified/)
})
it('rejects a mutation receipt with a mismatched revision', async () => {
 api.rpc.mockResolvedValue({data:{verified:true,appointmentId:'booking',revision:3,state},error:null})
 await expect(changeCalendarTime({appointmentId:'booking',expectedRevision:2,commandId:'key',action:'withdraw',requestId:'request'})).rejects.toThrow(/verified/)
})
it('preserves server conflict and permission errors', async () => {
 api.rpc.mockResolvedValue({error:{code:'40001',message:'Appointment changed'}})
 await expect(changeCalendarTime({appointmentId:'booking',expectedRevision:2,commandId:'key',action:'accept'})).rejects.toMatchObject({code:'40001'})
})
it('shows a useful local-release message when the workflow migration is absent', async () => {
 api.rpc.mockResolvedValue({error:{code:'PGRST202',message:'Could not find function'}})
 await expect(readCalendarTimeChange('booking')).rejects.toThrow(/after the calendar update is released/)
})

const invitation={managed:true,appointment_id:'booking',participant_id:'person',proposal:true,proposal_id:'request',proposal_revision:2,can_request_time_change:false,rsvp_status:'Pending',timezone:'Africa/Johannesburg',date_time:'2099-07-21T08:00Z',end_date_time:'2099-07-21T09:00Z'}
it('loads a guest invitation once without fetching another attendee or an authenticated appointment',async()=>{
 api.rpc.mockResolvedValue({data:invitation})
 expect(await readCalendarInvitation('capability')).toEqual(invitation)
 expect(api.rpc.mock.calls).toEqual([['get_calendar_invitation_context',{p_token:'capability'}]])
})
it('refuses an expired or incomplete invitation before rendering response controls',async()=>{
 api.rpc.mockResolvedValueOnce({data:null}).mockResolvedValueOnce({data:{managed:true}})
 await expect(readCalendarInvitation('capability')).rejects.toThrow(/expired/)
 await expect(readCalendarInvitation('capability')).rejects.toThrow(/verified/)
})
it('ties a guest request receipt to the displayed appointment and trims its message',async()=>{
 api.rpc.mockResolvedValue({data:{verified:true,appointmentId:'booking',context:invitation}})
 await requestCalendarTimeChangeByToken('capability',{appointmentId:'booking',preferredStart:'2099-07-22T08:00Z',reason:'  Please move it  '})
 expect(api.rpc).toHaveBeenCalledWith('request_calendar_time_change_by_token',expect.objectContaining({p_token:'capability',p_reason:'Please move it',p_withdraw_request_id:null}))
 api.rpc.mockResolvedValue({data:{verified:true,appointmentId:'other',context:invitation}})
 await expect(requestCalendarTimeChangeByToken('capability',{appointmentId:'booking'})).rejects.toThrow(/verified/)
})
it('verifies the exact proposed version and does not turn partial approval into confirmation',async()=>{
 const receipt={verified:true,appointmentId:'booking',requestId:'request',proposalRevision:2,response:'Accepted',outcome:'pending',dateTime:'2099-07-20T08:00Z',endDateTime:'2099-07-20T09:00Z'}
 const command={appointmentId:'booking',requestId:'request',proposalRevision:2,commandId:'stable-command',status:'Accepted'}
 api.rpc.mockResolvedValueOnce({data:receipt}).mockResolvedValueOnce({data:{...receipt,proposalRevision:3}})
 expect((await respondCalendarTimeChangeByToken('capability',command)).outcome).toBe('pending')
 await expect(respondCalendarTimeChangeByToken('capability',command)).rejects.toThrow(/verified/)
})
