import { beforeEach,describe,expect,it,vi } from 'vitest'
const fixture=vi.hoisted(()=>({events:[],insertError:null,receiptError:null,invoke:vi.fn()}))
const user='10000000-0000-4000-8000-000000000003',attendee='10000000-0000-4000-8000-000000000004'
vi.mock('../../lib/supabaseClient',()=>({isSupabaseConfigured:true,invokeEdgeFunction:fixture.invoke,getEdgeFunctionInvokeError:vi.fn(),supabase:{from(table){
 let insert=null,update=null
 const result=()=>({data:table==='appointment_participants'?[{participant_id:attendee,user_id:user,name:'Agent',email:'agent@example.test',participant_role:'Agent',rsvp_status:'Accepted'}]:null,error:table==='appointment_notification_events'&&update?fixture.receiptError:null})
 const query={select:()=>query,eq:()=>query,limit:()=>query,insert:value=>{insert=value;return query},update:value=>{update=value;return query},
  async maybeSingle(){
   if(table==='appointments')return {data:{appointment_id:'booking',status:'completed',appointment_type:'viewing',visibility_scope:'shared_role_players'},error:null}
   if(!insert)return {data:null,error:null}
   if(fixture.insertError)return {data:null,error:fixture.insertError}
   fixture.events.push(insert);return {data:{id:'event',...insert},error:null}
  },then:(resolve,reject)=>Promise.resolve(result()).then(resolve,reject)}
 return query
}}}))
vi.mock('../notificationOutboxService',()=>({prepareNotificationOutbox:vi.fn()}))
import { notifyAppointmentParticipants } from '../appointmentNotificationService'
beforeEach(()=>{fixture.events=[];fixture.insertError=null;fixture.receiptError=null;fixture.invoke.mockReset().mockImplementation(()=>{throw new Error('Real delivery forbidden')})})
describe('Appointment notification persistence',()=>{
 it('logs an internal notification with the user profile identity',async()=>{
  await notifyAppointmentParticipants('booking','appointment_completed')
  expect(fixture.events[0].recipient_id).toBe(user);expect(fixture.events[0].recipient_id).not.toBe(attendee)
  expect(fixture.invoke).not.toHaveBeenCalled()
 })
 it('surfaces a foreign-key error before any email attempt',async()=>{
  fixture.insertError={code:'23503',message:'appointment_notification_events recipient_id foreign key violation'}
  await expect(notifyAppointmentParticipants('booking','appointment_confirmed')).rejects.toMatchObject({code:'23503'})
  expect(fixture.invoke).not.toHaveBeenCalled()
 })
 it('surfaces a permission failure when storing the notification receipt',async()=>{
  fixture.receiptError={code:'42501',message:'Receipt permission denied'}
  await expect(notifyAppointmentParticipants('booking','appointment_completed')).rejects.toMatchObject({code:'42501'})
 })
})
