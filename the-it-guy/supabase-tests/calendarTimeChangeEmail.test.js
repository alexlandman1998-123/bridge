import { describe,expect,it } from 'vitest'
import { buildCalendarDeliveryPayload } from '../../supabase/functions/_shared/calendarAppointmentDelivery.ts'
import { buildAppointmentEmailHtml,buildAppointmentEmailText,buildAppointmentSubject } from '../../supabase/functions/send-email/content/appointment.ts'
const a={appointment_id:'booking',organisation_id:'org',agent_id:'agent',date_time:'2099-07-20T08:00:00Z',end_date_time:'2099-07-20T09:00:00Z',timezone:'Africa/Johannesburg',appointment_type:'seller_valuation',title:'Property valuation',status:'confirmed',attach_calendar_invite:true}
const p={participant_id:'buyer',email:'buyer@example.test',name:'Buyer',participant_role:'Seller',rsvp_token:'signed-token'}
const r={id:'request',status:'proposed',original_start:a.date_time,original_end:a.end_date_time,preferred_start:'2099-07-21T10:00:00Z',preferred_end:'2099-07-21T11:00:00Z',proposed_timezone:a.timezone,reason:'<script>unsafe</script>'}
const owner={full_name:'Agent',email:'agent@example.test'}
function payload(stage,person=p){return buildCalendarDeliveryPayload({id:'job',event_kind:`time_change:${stage}:request:1`,revision:3,created_at:'2099-07-19T06:00:00Z'},a,person,owner,'https://app.example.test',r)}
describe('Time-change email lifecycle',()=>{
 it('distinguishes a proposed replacement from a confirmed change, without attaching ICS',()=>{
  const mail=payload('proposed')
  expect(mail.type).toBe('appointment_time_change_proposed');expect(mail.attachCalendarInvite).toBe(false)
  expect(mail.dateTime).toBe(r.preferred_start);expect(mail.notes).toContain('has not moved')
  expect(mail.acceptLink).toContain('/appointment-rsvp/signed-token?action=accept')
  expect(buildAppointmentSubject(mail.type)).toContain('Proposed')
 })
 it.each(['requested','declined','withdrawn','expired'])('keeps the original booking visible for %s notices',stage=>{
  const mail=payload(stage)
  expect(mail.dateTime).toBe(a.date_time);expect(mail.attachCalendarInvite).toBe(false)
  expect(mail.type).toBe(`appointment_time_change_${stage}`)
  expect(mail.notes).toContain('Original booking:')
 })
 it('sends a reviewed confirmation with the updated calendar attachment',()=>{
  const mail=buildCalendarDeliveryPayload({id:'job',event_kind:'time_change:confirmed:request:1',revision:4},{...a,date_time:r.preferred_start,end_date_time:r.preferred_end},p,owner,'https://app.example.test',{...r,status:'accepted'})
  expect(mail.attachCalendarInvite).toBe(true);expect(mail.dateTime).toBe(r.preferred_start)
  expect(mail.notes).toContain('Every required attendee has accepted')
 })
 it('sends organiser review to the signed-in appointment instead of an attendee voting link',()=>{
  const mail=payload('requested',{...p,user_id:'agent'})
  expect(mail.actionLink).toBe('https://app.example.test/pipeline/calendar?appointmentId=booking')
  expect(mail.acceptLink).toBe('')
 })
 it('renders clear lifecycle wording for branded HTML and plain text, escaping the requester message',()=>{
  const mail=payload('proposed')
  const input={...mail,eventType:mail.type,organisationName:'Kingstons',emailTheme:'kingstons_seller_valuation'}
  const html=buildAppointmentEmailHtml(input),text=buildAppointmentEmailText(input)
  expect(html).toContain('has not moved');expect(html).not.toContain('<script>unsafe</script>')
  expect(text).toContain('Original booking:');expect(text).not.toContain('has been rescheduled.')
 })
})
it('does not disclose internal notes or instructions in time-change notices',()=>{
 const mail=buildCalendarDeliveryPayload({id:'job',event_kind:'time_change:requested:request:1',revision:3},{...a,notes:'PRIVATE CASE NOTE',appointment_instructions:'INTERNAL INSTRUCTIONS'},p,owner,'https://app.example.test',r)
 expect(mail.notes).not.toContain('PRIVATE CASE NOTE');expect(mail.notes).not.toContain('INTERNAL INSTRUCTIONS')
})
it('does not ask an attendee to vote again after their acceptance is recorded',()=>{
 const mail=payload('proposed',{...p,proposal_response:'Accepted'})
 expect(mail.acceptLink).toBe('');expect(mail.declineLink).toBe('');expect(mail.notes).toContain('acceptance of this proposed time is recorded')
})
it('labels all-day requests without presenting an exclusive midnight end as another booking day',()=>{
 const mail=buildCalendarDeliveryPayload({id:'job',event_kind:'time_change:proposed:request:1',revision:3},{...a,all_day:true},p,owner,'https://app.example.test',{...r,proposed_all_day:true})
 expect(mail.appointmentTime).toBe('All day');expect(mail.notes).toContain('All day');expect(mail.notes).not.toContain('00:00')
})

it('reminds at the booked time without an ICS copy or proposal response buttons',()=>{
 const mail=buildCalendarDeliveryPayload({id:'job',event_kind:'reminder:appointment_reminder',revision:1},{...a,status:'alternative_proposed',has_confirmed_reservation:true,meeting_url:'https://meet.example.test/room'},p,owner,'https://app.example.test',r)
 expect(mail.dateTime).toBe(a.date_time);expect(mail.attachCalendarInvite).toBe(false);expect(mail.acceptLink).toBe('');expect(mail.declineLink).toBe('');expect(mail.rescheduleLink).toBe('')
 expect(mail.actionLink).toBe('');expect(mail.meetingUrl).toBe('https://meet.example.test/room');expect(mail.status).toBe('confirmed');expect(JSON.stringify(mail)).not.toContain('signed-token')
})
