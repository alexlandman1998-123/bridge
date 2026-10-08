import { describe,expect,it,vi } from 'vitest'
import { buildCalendarDeliveryPayload,dispatchCalendarAppointmentJob } from '../../supabase/functions/_shared/calendarAppointmentDelivery.ts'
const job={id:'job',appointment_id:'booking',participant_id:'participant',revision:3,event_kind:'invite',channel:'email',attempt_count:1,created_at:'2027-10-01T06:00Z'}
const appointment={appointment_id:'booking',organisation_id:'org',agent_id:'agent',date_time:'2027-10-01T09:30Z',end_date_time:'2027-10-01T10:00Z',timezone:'Africa/Johannesburg',title:'Viewing',appointment_type:'viewing',status:'requested'}
const participant={participant_id:'participant',email:'buyer@example.test',name:'Buyer',rsvp_token:'token+/secret'}
const config={supabaseUrl:'https://project.example.test',serviceRoleKey:'local-fixture',appUrl:'https://app.example.test'}
const success=()=>vi.fn(async()=>new Response(JSON.stringify({ok:true,emailId:'provider-id'})))
function fixture({gate=true,receipt=true,readError=false}={}) {
 const rpc=vi.fn(async(name,args)=>({data:name==='prepare_calendar_delivery'?(gate?args.p_payload||{delivered:true}:null):receipt,error:null}))
 const client={rpc,from:table=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:table==='appointments'?appointment:table==='appointment_participants'?participant:{full_name:'Agent',email:'agent@example.test'},error:readError?new Error('permission failure'):null})})})})}
 return {client,rpc}
}
describe('Calendar server worker with controlled provider',()=>{
 it('renders saved named-zone instants, links, revision and idempotency data',()=>{
  const payload=buildCalendarDeliveryPayload(job,{...appointment,timezone:'America/New_York',email_theme:'kingstons_valuation',email_template_key:'kingstons_valuation_appointment'},participant,{full_name:'Agent'},config.appUrl)
  expect(payload).toMatchObject({appointmentDate:'2027-10-01',appointmentTime:'05:30',appointmentEndTime:'06:00',timezone:'America/New_York',calendarSequence:3,emailTheme:'kingstons_valuation',emailTemplateKey:'kingstons_valuation_appointment',idempotencyKey:'calendar-appointment:job',bccAgent:false})
  expect(payload.acceptLink).toBe('https://app.example.test/appointment-rsvp/token%2B%2Fsecret?action=accept')
  for (const kind of ['no_show','completed']) {
   expect(buildCalendarDeliveryPayload({...job,event_kind:kind},{...appointment,status:kind},participant,{},config.appUrl)).toMatchObject({type:'appointment_updated',status:kind,actionLink:'',attachCalendarInvite:false})
  }
 })
 it('renders a proposed replacement without attaching a premature replacement calendar event',()=>{
  const payload=buildCalendarDeliveryPayload({...job,event_kind:'reschedule_proposed'},appointment,participant,{},config.appUrl,{status:'proposed',preferred_start:'2027-10-02T11:00Z',preferred_end:'2027-10-02T12:00Z',proposed_timezone:'UTC'})
  expect(payload).toMatchObject({appointmentDate:'2027-10-02',appointmentTime:'11:00',attachCalendarInvite:false,type:'appointment_rescheduled'})
 })
 it('accepts provider receipt without claiming inbox delivery',async()=>{
  const {client,rpc}=fixture(),fetcher=success()
  expect(await dispatchCalendarAppointmentJob(client,job,config,fetcher)).toEqual({jobId:'job',status:'provider_accepted'})
  expect(rpc).toHaveBeenLastCalledWith('complete_calendar_delivery',expect.objectContaining({p_status:'provider_accepted',p_provider_id:'provider-id'}))
 })
 it.each([new Response('{}'),new Response('{"ok":true}'),new Response('{"ok":false,"emailId":"id"}'),new Response('{"ok":true,"emailId":"id"}',{status:500})])('rejects an empty, unverified or failed provider result',async response=>{
  const {client,rpc}=fixture()
  expect((await dispatchCalendarAppointmentJob(client,job,config,vi.fn(async()=>response))).status).toBe('failed')
  expect(rpc).toHaveBeenLastCalledWith('complete_calendar_delivery',expect.objectContaining({p_status:'failed'}))
 })
 it('makes no provider request after the database rejects stale/cancelled/expired/revoked work',async()=>{
  const {client}=fixture({gate:false}),fetcher=success()
  expect((await dispatchCalendarAppointmentJob(client,job,config,fetcher)).status).toBe('superseded')
  expect(fetcher).not.toHaveBeenCalled()
 })
 it('deduplicates retries using the frozen payload and keeps errors free of addresses',async()=>{
  const {client,rpc}=fixture(),fetcher=vi.fn(async()=>{throw new Error('private recipient error')})
  const frozen={to:participant.email,appointmentId:job.appointment_id,idempotencyKey:'calendar-appointment:job'}
  await dispatchCalendarAppointmentJob(client,{...job,payload:frozen},config,fetcher)
  await dispatchCalendarAppointmentJob(client,{...job,payload:frozen,attempt_count:2},config,fetcher)
  expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body)
  expect(JSON.stringify(rpc.mock.calls)).not.toContain('private recipient error')
 })
 it('does not send when appointment lookup fails',async()=>{
  const {client}=fixture({readError:true}),fetcher=success()
  expect((await dispatchCalendarAppointmentJob(client,job,config,fetcher)).status).toBe('failed');expect(fetcher).not.toHaveBeenCalled()
 })
 it('delivers in-app work without invoking email and refuses a stale acceptance receipt',async()=>{
  const {client}=fixture(),fetcher=success()
  expect((await dispatchCalendarAppointmentJob(client,{...job,channel:'in_app'},config,fetcher)).status).toBe('delivered')
  expect(fetcher).not.toHaveBeenCalled()
  expect((await dispatchCalendarAppointmentJob(fixture({receipt:false}).client,job,config,success())).status).toBe('stale_receipt')
 })
})
