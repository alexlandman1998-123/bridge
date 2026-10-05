import { describe, expect, it, vi } from 'vitest'
import { attorneyDeliveryDecision, buildAttorneyDeliveryPayload, dispatchAttorneyAppointmentJob } from '../../supabase/functions/_shared/attorneyAppointmentDelivery.ts'
import { readAttorneyAppointmentDelivery } from '../src/services/attorneyAppointmentDelivery'

const appointment={appointment_id:'a',organisation_id:'org',transaction_id:'t',date_time:'2099-07-20T08:00Z',appointment_date:'2099-07-20',start_time:'10:00',end_time:'11:30',title:'Signing',status:'Pending Confirmation',calendar_revision:1,attorney_delivery_enabled:true,attorney_attach_calendar:true,created_by:'host',updated_at:'2026-10-03T12:00Z'}
const participant={participant_id:'p',appointment_id:'a',email:'buyer@example.test',name:'Buyer',participant_role:'Client',rsvp_status:'Pending',rsvp_token:'token+/secret',rsvp_expires_at:'2099-07-20T08:00Z'}
const job={id:'j',appointment_id:'a',participant_id:'p',revision:1,event_kind:'invite',attempt_count:1}
const config={supabaseUrl:'https://project.example.test',serviceRoleKey:'server-only-test',appUrl:'https://app.example.test'}
function mockClient({changed=null,receipt=true}={}) {
  let reads=0
  const rpc=vi.fn(async (name,args)=>({data:name==='save_attorney_delivery_payload' ? args.p_payload : name==='record_attorney_delivery_in_app' ? true : receipt})), update=vi.fn(()=>({eq:()=>({eq:async()=>({})})}))
  const client={rpc,from:vi.fn(table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='appointments' ? (++reads===2 && changed ? changed : appointment) : table==='appointment_participants' ? participant : {full_name:'Attorney',email:'host@example.test'}})})}),update}))}
  return {client,rpc}
}
const okFetch=()=>vi.fn(async()=>new Response(JSON.stringify({ok:true,emailId:'provider-1'}),{status:200,headers:{'Content-Type':'application/json'}}))

describe('Attorney delivery worker',()=>{
  it('builds SAST times, current RSVP URLs, reply-to and stable idempotency/revision metadata',()=>{
    const payload=buildAttorneyDeliveryPayload({job,appointment,participant,organizer:{full_name:'Attorney',email:'host@example.test'},appUrl:config.appUrl})
    expect(payload).toMatchObject({appointmentTime:'10:00',appointmentEndTime:'11:30',calendarSequence:1,calendarTimestamp:'2026-10-03T12:00Z',idempotencyKey:'attorney-appointment:j',replyTo:'host@example.test',bccAgent:false})
    expect(payload.acceptLink).toBe('https://app.example.test/appointment-rsvp/token%2B%2Fsecret?action=accept')
  })
  it.each([
    [{...appointment,calendar_revision:2},participant],
    [{...appointment,attorney_delivery_enabled:false},participant],
    [{...appointment,status:'Cancelled'},participant],
    [appointment,{...participant,rsvp_revoked_at:'2026-10-03T12:00Z'}],
    [appointment,{...participant,rsvp_expires_at:'2020-01-01T12:00Z'}],
  ])('supersedes stale, disabled, closed and revoked invites', (a,p)=>{
    expect(attorneyDeliveryDecision(job,a,p)).toBe('superseded')
  })
  it('expires old reminders and stops declined people while allowing due reminders briefly after start',()=>{
    const reminder={...job,event_kind:'reminder_2h'}
    expect(attorneyDeliveryDecision(reminder,appointment,participant,new Date('2099-07-20T09:00Z'))).toBe('superseded')
    expect(attorneyDeliveryDecision(reminder,appointment,{...participant,rsvp_status:'Declined'})).toBe('superseded')
    expect(attorneyDeliveryDecision({...reminder,event_kind:'reminder_due'},appointment,participant,new Date('2099-07-20T08:10Z'))).toBe('send')
  })
  it('preserves cancellation UID/sequence and excludes revoked RSVP links',()=>{
    const payload=buildAttorneyDeliveryPayload({job:{...job,event_kind:'cancelled'},appointment:{...appointment,status:'Cancelled',calendar_revision:2},participant,appUrl:config.appUrl})
    expect(payload).toMatchObject({type:'appointment_cancelled',appointmentId:'a',calendarSequence:2,actionLink:'',attachCalendarInvite:true})
  })
  it('records provider acceptance and attaches actual appointment data',async()=>{
    const {client,rpc}=mockClient(),fetcher=okFetch()
    expect(await dispatchAttorneyAppointmentJob(client,job,config,fetcher)).toEqual({jobId:'j',status:'sent'})
    expect(rpc).toHaveBeenCalledWith('complete_attorney_appointment_delivery',expect.objectContaining({p_id:'j',p_attempt:1,p_status:'sent',p_provider_id:'provider-1'}))
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({calendarSequence:1,appointmentEndTime:'11:30'})
  })
  it('checks a cancellation again before sending after preparation',async()=>{
    const {client}=mockClient({changed:{...appointment,status:'Cancelled',calendar_revision:2}}),fetcher=okFetch()
    expect(await dispatchAttorneyAppointmentJob(client,job,config,fetcher)).toEqual({jobId:'j',status:'superseded'})
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('uses the same provider key on retry and stores a neutral failure receipt',async()=>{
    const {client,rpc}=mockClient(),fetcher=vi.fn(async()=>{throw new Error('private address detail')})
    await dispatchAttorneyAppointmentJob(client,job,config,fetcher)
    await dispatchAttorneyAppointmentJob(client,{...job,attempt_count:2},config,fetcher)
    expect(JSON.parse(fetcher.mock.calls[0][1].body).idempotencyKey).toBe(JSON.parse(fetcher.mock.calls[1][1].body).idempotencyKey)
    expect(rpc).toHaveBeenLastCalledWith('complete_attorney_appointment_delivery',expect.objectContaining({p_status:'failed',p_error:'Delivery failed; automatic retry scheduled.'}))
  })
  it('does not claim successful persistence after a stale receipt',async()=>{
    const {client}=mockClient({receipt:false})
    expect(await dispatchAttorneyAppointmentJob(client,job,config,okFetch())).toEqual({jobId:'j',status:'stale_receipt'})
  })
  it('reloads saved delivery feedback and ignores replaced revisions',()=>{
    const jobs=[{appointment_id:'a',revision:0,event_kind:'invite',status:'failed'},{appointment_id:'a',revision:1,event_kind:'invite',status:'sent'},{appointment_id:'a',revision:1,event_kind:'reminder_2h',status:'queued'}]
    expect(readAttorneyAppointmentDelivery(appointment,jobs)).toMatchObject({status:'sent',calendarInviteDelivered:true,reminders:{status:'scheduled'}})
    expect(readAttorneyAppointmentDelivery(appointment,null).status).toBe('unavailable')
    expect(readAttorneyAppointmentDelivery({...appointment,attorney_delivery_enabled:false},jobs).status).toBe('disabled')
  })
})
