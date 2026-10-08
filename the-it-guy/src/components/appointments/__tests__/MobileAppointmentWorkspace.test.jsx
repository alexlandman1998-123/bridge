// @vitest-environment jsdom
import React from 'react'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,it,expect,vi } from 'vitest'
const api=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),respond:vi.fn(),agents:vi.fn(),leads:vi.fn(),propose:vi.fn()}))
vi.mock('../../../lib/agencyPipelineService',()=>({createAppointmentAsync:api.create,updateAppointmentAsync:api.update,updateAppointmentParticipantRsvpAsync:api.respond}))
vi.mock('../../../lib/settingsApi',()=>({listOrganisationUsersForWorkspace:api.agents}))
vi.mock('../../../lib/agencyCrmRepository',()=>({listAgencyCrmLeadContacts:api.leads}))
vi.mock('../../../services/appointmentRescheduleService',()=>({proposeCalendarAppointmentReplacement:api.propose}))
vi.mock('../AppointmentWorkActions',()=>({default:()=>null}))
vi.mock('../AppointmentDeliveryStatus',()=>({default:()=>null}))
vi.mock('../AppointmentCalendarActions',()=>({default:()=>null}))
import MobileAppointmentWorkspace from '../MobileAppointmentWorkspace'
const actor={id:'owner',name:'Owner',email:'owner@example.test',canManageCalendar:true}
const row={appointmentId:'booking',appointmentType:'viewing',title:'Viewing',calendarRevision:2,assignedAgentId:'owner',status:'requested',date:'2027-10-01',startTime:'11:00',endTime:'12:00',dateTime:'2027-10-01T09:00:00Z',endDateTime:'2027-10-01T10:00:00Z',timezone:'Africa/Johannesburg',reservationManaged:true,holdExpiresAt:'2027-10-01T09:00:00Z',participants:[],reminderRules:[{reminderType:'custom_30m',offsetMinutes:30}]}
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2027-10-01T06:00:00Z'));api.agents.mockResolvedValue([{userId:'other',fullName:'Other Agent',email:'other@example.test',status:'active'}]);api.leads.mockResolvedValue({leads:[{leadId:'lead',name:'Buyer Lead',assignedAgentId:'wrong',contactId:'contact'}]});api.create.mockResolvedValue({...row,delivery:{verified:true,jobs:[]}});api.update.mockResolvedValue(row)})
afterEach(()=>{cleanup();vi.useRealTimers()})
const change=(label,value)=>fireEvent.change(screen.getByLabelText(label),{target:{value}})
it('creates with explicit owner, type and optional lead, preserving evening/weekend time and chosen reminders',async()=>{
 const saved=vi.fn();render(<MobileAppointmentWorkspace organisationId="org" actor={actor} selectedDate="2027-10-02" onSaved={saved} />)
 await screen.findAllByRole('option',{name:'Other Agent'})
 change('Appointment type','client_meeting');change('Responsible agent','other');change('Related lead (optional)','lead');change('Start time','19:30');change('End time','20:30');change('Reminder schedule','30m')
 fireEvent.click(screen.getByRole('button',{name:'Request appointment'}));await waitFor(()=>expect(saved).toHaveBeenCalled())
 expect(api.create.mock.calls[0][1]).toMatchObject({appointmentType:'client_meeting',assignedAgent:{id:'other'},leadId:'lead',contactId:'contact',status:'requested',date:'2027-10-02',startTime:'19:30',endTime:'20:30',reminderRules:[{reminderType:'custom_30m',offsetMinutes:30}]})
})
it('waits for verified draft save and retries an unchanged payload with the same command',async()=>{
 api.create.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce(row)
 render(<MobileAppointmentWorkspace organisationId="org" actor={actor} selectedDate="2027-10-02" />)
 change('Appointment type','viewing');fireEvent.click(screen.getByRole('button',{name:'Save draft'}));await screen.findByText('Response lost')
 fireEvent.click(screen.getByRole('button',{name:'Save draft'}));await waitFor(()=>expect(api.create).toHaveBeenCalledTimes(2))
 expect(api.create.mock.calls[0][1]).toEqual(api.create.mock.calls[1][1]);expect(api.create.mock.calls[0][1].status).toBe('draft')
})
it('recalculates saved UTC after a wall-clock edit and uses the revision captured on opening',async()=>{
 render(<MobileAppointmentWorkspace appointment={row} organisationId="org" actor={actor} />)
 fireEvent.click(screen.getByRole('button',{name:'Edit appointment'}));change('Start time','13:00');change('End time','14:00')
 fireEvent.click(screen.getByRole('button',{name:'Save appointment'}));await waitFor(()=>expect(api.update).toHaveBeenCalled())
 expect(api.update.mock.calls[0][2]).toMatchObject({startTime:'13:00',endTime:'14:00',dateTime:null,endDateTime:null,expectedRevision:2,reminderRules:row.reminderRules})
})
it('blocks a save when a refresh advances the booking revision',async()=>{
 const view=render(<MobileAppointmentWorkspace appointment={row} organisationId="org" actor={actor} />)
 fireEvent.click(screen.getByRole('button',{name:'Edit appointment'}));change('Notes','My change')
 view.rerender(<MobileAppointmentWorkspace appointment={{...row,calendarRevision:3}} organisationId="org" actor={actor} />)
 expect(screen.getByRole('button',{name:'Save appointment'}).matches(':disabled')).toBe(true);expect(api.update).not.toHaveBeenCalled()
})
it('proposes a confirmed move without saving other form edits or claiming the move completed',async()=>{
 api.propose.mockResolvedValue({verified:true});const saved=vi.fn()
 render(<MobileAppointmentWorkspace appointment={{...row,status:'confirmed',hasConfirmedReservation:true}} organisationId="org" actor={actor} onSaved={saved} />)
 fireEvent.click(screen.getByRole('button',{name:'Edit appointment'}));change('Start time','13:00');change('End time','14:00');change('Title','Unsaved other change')
 fireEvent.click(screen.getByRole('button',{name:'Save appointment'}));await waitFor(()=>expect(saved).toHaveBeenCalled())
 expect(api.update).not.toHaveBeenCalled();expect(api.propose.mock.calls[0][1]).toMatchObject({preferredStart:'2027-10-01T11:00:00.000Z',preferredEnd:'2027-10-01T12:00:00.000Z',expectedRevision:2})
 expect(saved.mock.calls[0][1]).toMatch(/other form edits have not been saved/)
})

it('adds a co-agent with their profile identity rather than an external-only email',async()=>{
 render(<MobileAppointmentWorkspace organisationId="org" actor={actor} selectedDate="2027-10-02" />)
 await waitFor(()=>expect(screen.getByLabelText('Team attendee').options.length).toBe(2))
 change('Appointment type','client_meeting');change('Team attendee','other');fireEvent.click(screen.getByRole('button',{name:'Add co-agent'}))
 fireEvent.click(screen.getByRole('button',{name:'Request appointment'}));await waitFor(()=>expect(api.create).toHaveBeenCalled())
 expect(api.create.mock.calls[0][1].participants).toEqual([expect.objectContaining({userId:'other',participantRole:'Co-agent',email:'other@example.test',isRequired:true})])
})
