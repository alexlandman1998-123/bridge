import { buildIcsAttachment, freezeCalendarProviderMessage } from './appointment.ts';
import type { SendAppointmentEmailPayload } from '../types.ts';
const fixture: SendAppointmentEmailPayload={type:'appointment_confirmed',to:'buyer@example.test',appointmentId:'booking',appointmentDate:'2027-10-01',appointmentTime:'05:30',appointmentEndTime:'06:00',timezone:'America/New_York',dateTime:'2027-10-01T09:30:00Z',endDateTime:'2027-10-01T10:00:00Z',calendarSequence:3,calendarTimestamp:'2027-10-01T06:00Z'};
const assert=(value: unknown,message: string)=>{if(!value)throw new Error(message);};
const content=(payload: SendAppointmentEmailPayload)=>atob(buildIcsAttachment(payload)?.content||'');
Deno.test('Appointment email calendar attachment uses saved UTC instants for named zones',()=>{
 const ics=content(fixture);assert(ics.includes('DTSTART:20271001T093000Z')&&ics.includes('DTEND:20271001T100000Z'),'Calendar must preserve saved instants');
 assert(ics.includes('SEQUENCE:3')&&ics.includes('DTSTAMP:20271001T060000Z'),'Revision and timestamp must be stable');
});
Deno.test('Appointment email calendar attachment preserves duration through repeated DST clocks',()=>{
 const ics=content({...fixture,appointmentDate:'2027-11-07',appointmentTime:'01:30',appointmentEndTime:'01:30',dateTime:'2027-11-07T05:30Z',endDateTime:'2027-11-07T06:30Z'});
 assert(ics.includes('DTSTART:20271107T053000Z')&&ics.includes('DTEND:20271107T063000Z'),'Repeated clocks must remain an hour apart');
});
Deno.test('All-day attachment uses an exclusive local end date instead of a short timed event',()=>{
 const ics=content({...fixture,allDay:true,appointmentTime:'00:00',appointmentEndTime:'00:00',dateTime:'2027-10-01T04:00Z',endDateTime:'2027-10-02T04:00Z'});
 assert(ics.includes('DTSTART;VALUE=DATE:20271001')&&ics.includes('DTEND;VALUE=DATE:20271002'),'All-day date boundaries must be exclusive');
});
Deno.test('Cancellation retains the appointment UID and newer revision and respects attachments off',()=>{
 const cancelled={...fixture,type:'appointment_cancelled' as const,calendarSequence:4};const ics=content(cancelled);
 assert(ics.includes('METHOD:CANCEL')&&ics.includes('UID:bridge-booking@bridge.app')&&ics.includes('SEQUENCE:4'),'Cancellation must target the same calendar event');
 assert(buildIcsAttachment({...fixture,attachCalendarInvite:false})===null,'Attachments-off choice must be honoured');
});

Deno.test('Calendar sender uses the persisted provider rendering and stops superseded work',async()=>{
 const message={from:'Agent <agent@example.test>',to:'buyer@example.test',subject:'Viewing',html:'Current branding',idempotencyKey:'calendar-appointment:10000000-0000-4000-8000-000000000003'};
 const frozen={...message,html:'Original frozen branding'};let calls=0;
 const client={rpc:async(name: string,args: Record<string,unknown>)=>{calls++;assert(name==='freeze_calendar_provider_payload','Wrong freeze endpoint');assert(!(args.p_payload as Record<string,unknown>).apiKey,'Provider secret must not be stored');return {data:frozen,error:null};}};
 assert((await freezeCalendarProviderMessage(client,message))?.html==='Original frozen branding','Retry must use original provider content');
 assert(await freezeCalendarProviderMessage({rpc:async()=>({data:null})},message)===null,'Superseded messages must not send');
 const legacy={...message,idempotencyKey:'legacy'};assert(await freezeCalendarProviderMessage(client,legacy)===legacy&&calls===1,'Dedicated legacy senders must retain their owner');
});
