// @vitest-environment jsdom
import React from 'react'
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,it,expect,vi } from 'vitest'
const api=vi.hoisted(()=>({archive:vi.fn(),update:vi.fn(),outcome:vi.fn(),respond:vi.fn(),proposal:vi.fn()}))
vi.mock('../../../lib/agencyPipelineService',()=>({setAppointmentArchiveAsync:api.archive,updateAppointmentAsync:api.update,addAppointmentOutcomeAsync:api.outcome,updateAppointmentParticipantRsvpAsync:api.respond}))
vi.mock('../../../services/appointmentRescheduleService',()=>({getAppointmentRescheduleRequests:api.proposal}))
import AppointmentWorkActions from '../AppointmentWorkActions'
const actor={id:'owner',email:'owner@example.test'}
const row={appointmentId:'booking',calendarRevision:2,assignedAgentId:'owner',status:'requested',date:'2027-10-01',startTime:'11:00',endTime:'12:00',dateTime:'2027-10-01T09:00:00Z',endDateTime:'2027-10-01T10:00:00Z',timezone:'Africa/Johannesburg',reservationManaged:true,holdExpiresAt:'2027-10-01T09:00:00Z',participants:[{participantId:'self',userId:'owner',rsvpStatus:'Accepted',proposalId:'proposal'}]}
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2027-10-01T06:00:00Z'))})
afterEach(()=>{cleanup();vi.useRealTimers()})
it('requires an archive reason and keeps the same command after a lost response',async()=>{
 api.archive.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce({...row,status:'draft',archivedAt:'now'})
 const saved=vi.fn();render(<AppointmentWorkActions appointment={{...row,status:'draft'}} actor={actor} organisationId="org" onSaved={saved} />)
 fireEvent.click(screen.getByRole('button',{name:'Archive appointment'}));expect(api.archive).not.toHaveBeenCalled()
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Duplicate'}})
 fireEvent.click(screen.getByRole('button',{name:'Archive appointment'}));await screen.findByText('Response lost')
 fireEvent.click(screen.getByRole('button',{name:'Archive appointment'}));await waitFor(()=>expect(saved).toHaveBeenCalledTimes(1))
 expect(api.archive.mock.calls[0][2]).toEqual(api.archive.mock.calls[1][2]);expect(api.archive.mock.calls[0][2]).toMatchObject({expectedRevision:2,expectedArchivedAt:null,reason:'Duplicate',archive:true})
})
it('blocks duplicate clicks and ignores a save arriving after closing',async()=>{
 let finish;api.update.mockImplementation(()=>new Promise(resolve=>{finish=resolve}));const saved=vi.fn()
 const view=render(<AppointmentWorkActions appointment={row} actor={actor} organisationId="org" onSaved={saved} />)
 fireEvent.click(screen.getByRole('button',{name:'Cancel appointment'}));fireEvent.click(screen.getByRole('button',{name:'Cancel appointment'}));expect(api.update).toHaveBeenCalledTimes(1)
 view.unmount();await act(async()=>finish(row));expect(saved).not.toHaveBeenCalled()
})
it('lets a co-agent respond only for their own participant and hides early outcomes',async()=>{
 api.respond.mockResolvedValue(row);render(<AppointmentWorkActions appointment={{...row,participants:[{participantId:'own',userId:'guest',rsvpStatus:'Pending'}]}} actor={{id:'guest'}} organisationId="org" />)
 expect(screen.queryByRole('button',{name:'Cancel appointment'})).toBeNull();expect(screen.queryByRole('button',{name:'Mark completed'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Accept my invitation'}));await waitFor(()=>expect(api.respond).toHaveBeenCalled())
 expect(api.respond.mock.calls[0].slice(0,3)).toEqual(['org','booking','own'])
})
it('shows the verified proposal and deadline before allowing a response, with retry on a read failure',async()=>{
 api.proposal.mockRejectedValueOnce(new Error('Proposal read unavailable')).mockResolvedValueOnce([{id:'proposal',reservationManaged:true,preferredStart:'2027-10-02T09:00:00Z',preferredEnd:'2027-10-02T10:00:00Z',proposedTimezone:'Africa/Johannesburg',holdExpiresAt:'2027-10-02T06:00:00Z'}])
 render(<AppointmentWorkActions appointment={{...row,status:'alternative_proposed'}} actor={actor} organisationId="org" />)
 expect(screen.getByRole('button',{name:'Accept proposed time'}).disabled).toBe(true)
 await screen.findByText(/Proposal read unavailable/);fireEvent.click(screen.getByRole('button',{name:'Retry proposed time'}))
 await screen.findByText(/Proposed booking:/);expect(screen.getByRole('button',{name:'Accept proposed time'}).disabled).toBe(false)
 expect(screen.queryByRole('button',{name:'Confirm appointment'})).toBeNull()
})
it('keeps responses disabled for an expired proposal',async()=>{
 api.proposal.mockResolvedValue([{id:'proposal',reservationManaged:true,preferredStart:'2027-10-02T09:00:00Z',preferredEnd:'2027-10-02T10:00:00Z',proposedTimezone:'Africa/Johannesburg',holdExpiresAt:'2027-10-01T05:00:00Z'}])
 render(<AppointmentWorkActions appointment={{...row,status:'alternative_proposed'}} actor={actor} organisationId="org" />)
 await screen.findByText(/deadline has passed/);expect(screen.getByRole('button',{name:'Accept proposed time'}).disabled).toBe(true)
})
