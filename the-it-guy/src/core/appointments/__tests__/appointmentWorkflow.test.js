import { describe,it,expect } from 'vitest'
import { appointmentWorkflowActions as actions,resolveAppointmentCreationContext as context } from '../appointmentWorkflow'
const now=Date.parse('2027-10-01T06:00:00Z')
const owner={id:'owner',email:'owner@example.test'}
const booking={appointmentId:'id',assignedAgentId:'owner',status:'requested',dateTime:'2027-10-01T09:00:00Z',endDateTime:'2027-10-01T10:00:00Z',timezone:'Africa/Johannesburg',reservationManaged:true,holdExpiresAt:'2027-10-01T09:00:00Z',participants:[{participantId:'self',userId:'owner',rsvpStatus:'Accepted',isRequired:true}]}
describe('Agent calendar workflow',()=>{
 it('keeps standalone ownership and refuses an unrelated open lead',()=>{
  const lead={leadId:'lead',assignedAgentId:'wrong'}
  expect(context({assignedAgentId:'chosen'},{selectedLead:lead,currentAgent:owner})).toEqual({agentKey:'chosen',linkedLead:null})
  expect(context({assignedAgentId:'chosen',relatedEntityType:'lead',relatedEntityId:'lead'},{leads:[lead],selectedLead:{leadId:'other'}})).toEqual({agentKey:'chosen',linkedLead:lead})
 })
 it('allows own response but never grants an attendee management controls',()=>{
  const row={...booking,participants:[...booking.participants,{participantId:'attendee',userId:'guest',rsvpStatus:'Pending'}]}
  expect(actions(row,{id:'guest'},now)).toMatchObject({canManage:false,canRespond:true,canCancel:false,selfParticipant:{participantId:'attendee'}})
  expect(actions(row,{},now).canRespond).toBe(false)
  expect(actions(row,{id:'outsider',email:owner.email},now).canRespond).toBe(false)
 })
 it('limits archive to inactive bookings and never turns restore into reissue',()=>{
  expect(actions(booking,owner,now).canArchive).toBe(false)
  expect(actions({...booking,status:'draft'},owner,now)).toMatchObject({canArchive:true,canRespond:false})
  expect(actions({...booking,status:'cancelled',archivedAt:'2027-10-01T06:00:00Z'},owner,now)).toMatchObject({canRestore:true,canEdit:false,canReissue:false,state:{category:'archived',scheduled:false}})
 })
 it('respects required approval, proposal state, outcome start and expired holds',()=>{
  expect(actions(booking,owner,now)).toMatchObject({canConfirm:true,canComplete:false})
  expect(actions({...booking,status:'alternative_proposed'},owner,now).canConfirm).toBe(false)
  expect(actions({...booking,participants:[{...booking.participants[0],rsvpStatus:'Pending'}]},owner,now).canConfirm).toBe(false)
  expect(actions({...booking,holdExpiresAt:'2027-10-01T05:00:00Z'},owner,now)).toMatchObject({canReissue:true,canRespond:false})
  expect(actions({...booking,status:'confirmed',hasConfirmedReservation:true},owner,Date.parse('2027-10-01T09:01:00Z')).canComplete).toBe(true)
 })
})
