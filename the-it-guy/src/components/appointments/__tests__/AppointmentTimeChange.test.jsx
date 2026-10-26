// @vitest-environment jsdom
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,expect,it,vi } from 'vitest'
const api=vi.hoisted(()=>({read:vi.fn(),change:vi.fn()}))
vi.mock('../../../services/calendarTimeChangeService',()=>({readCalendarTimeChange:api.read,changeCalendarTime:api.change}))
import AppointmentTimeChange from '../AppointmentTimeChange'
const appointment={appointmentId:'booking',organisationId:'org',calendarRevision:2,dateTime:'2099-07-20T08:00:00Z',endDateTime:'2099-07-20T09:00:00Z',timezone:'Africa/Johannesburg',status:'confirmed'}
const empty={verified:true,appointmentId:'booking',revision:2,supported:true,canManage:false,canRequest:true,selfParticipantId:'guest',active:null,history:[],events:[]}
const request={id:'request',appointment_id:'booking',requested_by:'guest',participant_id:'guest',status:'pending',preferred_start:'2099-07-21T08:00:00Z',preferred_end:'2099-07-21T09:00:00Z',request_expires_at:'2099-07-20T08:00:00Z'}
const mount=props=>render(<AppointmentTimeChange appointment={appointment} actor={{id:'guest'}} {...props}/>)
beforeEach(()=>{api.read.mockReset().mockResolvedValue(empty);api.change.mockReset().mockResolvedValue({...empty,revision:3,active:request,history:[request]})})
afterEach(cleanup)
it('keeps the request form small and sends a SAST preferred time with the displayed revision',async()=>{
 const changed=vi.fn();mount({onChanged:changed});fireEvent.click(await screen.findByRole('button',{name:'Request a new time'}))
 fireEvent.change(screen.getByLabelText('Preferred date'),{target:{value:'2099-07-21'}})
 fireEvent.change(screen.getByLabelText('Preferred time'),{target:{value:'10:00'}})
 fireEvent.change(screen.getByLabelText('Message (optional)'),{target:{value:'Please move it.'}})
 fireEvent.click(screen.getByRole('button',{name:'Send request'}))
 await waitFor(()=>expect(changed).toHaveBeenCalled())
 expect(api.change).toHaveBeenCalledWith(expect.objectContaining({expectedRevision:2,action:'request',preferredStart:'2099-07-21T08:00:00.000Z',reason:'Please move it.'}))
})
it('shows the original booking protection and only organiser review actions for a pending request',async()=>{
 api.read.mockResolvedValue({...empty,canManage:true,active:request});mount()
 expect(await screen.findByText('New time requested')).toBeTruthy()
 expect(screen.getByText(/Awaiting organiser review.*current booking stays/)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Propose this time'}))
 await waitFor(()=>expect(api.change).toHaveBeenCalledWith(expect.objectContaining({action:'propose',requestId:'request',preferredStart:request.preferred_start})))
})
it('lets an attendee withdraw their own pending request without showing organiser controls',async()=>{
 api.read.mockResolvedValue({...empty,active:request});mount()
 fireEvent.click(await screen.findByRole('button',{name:'Withdraw request'}))
 expect(screen.queryByRole('button',{name:'Keep current time'})).toBeNull()
 await waitFor(()=>expect(api.change).toHaveBeenCalledWith(expect.objectContaining({action:'withdraw',requestId:'request'})))
})
it('offers fresh approval for a proposal and keeps accepted votes read-only',async()=>{
 api.read.mockResolvedValue({...empty,active:{...request,status:'proposed',hold_expires_at:request.request_expires_at}});const view=mount()
 fireEvent.click(await screen.findByRole('button',{name:'Accept new time'}))
 await waitFor(()=>expect(api.change).toHaveBeenCalledWith(expect.objectContaining({action:'accept'})))
 view.unmount();api.read.mockResolvedValue({...empty,selfProposalResponse:'Accepted',active:{...request,status:'proposed',hold_expires_at:request.request_expires_at}})
 mount();await screen.findByText('New time proposed');expect(screen.queryByRole('button',{name:'Accept new time'})).toBeNull()
})
it('reuses the command after a lost response and prevents double submits',async()=>{
 api.read.mockResolvedValue({...empty,canManage:true,active:request});api.change.mockRejectedValueOnce(new Error('Lost response')).mockResolvedValue({...empty,revision:3})
 mount();const button=await screen.findByRole('button',{name:'Keep current time'})
 fireEvent.click(button);fireEvent.click(button)
 await screen.findByRole('alert');expect(api.change).toHaveBeenCalledTimes(1)
 const first=api.change.mock.calls[0][0].commandId
 fireEvent.click(button);await waitFor(()=>expect(api.change).toHaveBeenCalledTimes(2))
 expect(api.change.mock.calls[1][0].commandId).toBe(first)
})
it('bounds event-triggered reads through the shared request queue',async()=>{
 mount();await screen.findByRole('button',{name:'Request a new time'});const initial=api.read.mock.calls.length
 await act(async()=>{for(let n=0;n<20;n++)window.dispatchEvent(new Event('focus'))})
 expect(api.read.mock.calls.length-initial).toBeLessThanOrEqual(1)
})
it('does not mistake an unrelated viewer for an anonymous requester',async()=>{
 api.read.mockResolvedValue({...empty,selfParticipantId:null,canRequest:false,active:{...request,requested_by:null,participant_id:null}})
 mount();await screen.findByText('New time requested')
 expect(screen.queryByRole('button',{name:'Withdraw request'})).toBeNull()
 expect(screen.queryByRole('button',{name:'Accept new time'})).toBeNull()
})
it('validates an unchanged time and appointments that would run into the next day',async()=>{
 mount();fireEvent.click(await screen.findByRole('button',{name:'Request a new time'}))
 fireEvent.click(screen.getByRole('button',{name:'Send request'}))
 await screen.findByText('Choose a time different from the current booking.')
 fireEvent.change(screen.getByLabelText('Preferred time'),{target:{value:'23:30'}})
 fireEvent.click(screen.getByRole('button',{name:'Send request'}))
 await screen.findByText(/Choose an earlier time/)
 expect(api.change).not.toHaveBeenCalled()
})
it('requires a fresh state after a stale decision and then uses the new revision',async()=>{
 api.read.mockResolvedValue({...empty,canManage:true,active:request})
 api.change.mockRejectedValueOnce({code:'40001',message:'Appointment changed'})
 mount();fireEvent.click(await screen.findByRole('button',{name:'Keep current time'}))
 await screen.findByRole('alert')
 expect(screen.getByRole('button',{name:'Keep current time'}).disabled).toBe(true)
 api.read.mockResolvedValue({...empty,revision:3,canManage:true,active:request})
 fireEvent.click(screen.getByRole('button',{name:'Refresh time changes'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'Keep current time'}).disabled).toBe(false))
 fireEvent.click(screen.getByRole('button',{name:'Keep current time'}))
 await waitFor(()=>expect(api.change).toHaveBeenLastCalledWith(expect.objectContaining({expectedRevision:3})))
})
it('discards a late command result after switching to a different appointment',async()=>{
 let complete
 api.read.mockImplementation(id=>Promise.resolve({...empty,appointmentId:id,canManage:true,active:id==='booking'?request:null}))
 api.change.mockReturnValue(new Promise(resolve=>{complete=resolve}))
 const changed=vi.fn(),view=mount({onChanged:changed})
 fireEvent.click(await screen.findByRole('button',{name:'Keep current time'}))
 view.rerender(<AppointmentTimeChange appointment={{...appointment,appointmentId:'other'}} actor={{id:'guest'}} onChanged={changed} />)
 await screen.findByRole('button',{name:'Request a new time'})
 await act(async()=>complete({...empty,revision:3}))
 expect(changed).not.toHaveBeenCalled()
 expect(screen.queryByText(/current appointment time has been kept/)).toBeNull()
})
it('uses midnight in the appointment timezone for an all-day request',async()=>{
 mount({appointment:{...appointment,allDay:true,date:'2099-07-20',dateTime:'2099-07-19T22:00Z',endDateTime:'2099-07-20T22:00Z'}})
 fireEvent.click(await screen.findByRole('button',{name:'Request a new time'}))
 expect(screen.queryByLabelText('Preferred time')).toBeNull()
 fireEvent.change(screen.getByLabelText('Preferred date'),{target:{value:'2099-07-21'}})
 fireEvent.click(screen.getByRole('button',{name:'Send request'}))
 await waitFor(()=>expect(api.change).toHaveBeenCalledWith(expect.objectContaining({preferredStart:'2099-07-20T22:00:00.000Z'})))
})
it('lets the organiser suggest another time with an optional message',async()=>{
 api.read.mockResolvedValue({...empty,canManage:true,active:request})
 mount();fireEvent.click(await screen.findByRole('button',{name:'Suggest another time'}))
 fireEvent.change(screen.getByLabelText('Preferred date'),{target:{value:'2099-07-22'}})
 fireEvent.change(screen.getByLabelText('Preferred time'),{target:{value:'11:00'}})
 fireEvent.change(screen.getByLabelText('Message (optional)'),{target:{value:'Could we meet later?' }})
 fireEvent.click(screen.getByRole('button',{name:'Propose new time'}))
 await waitFor(()=>expect(api.change).toHaveBeenCalledWith(expect.objectContaining({action:'propose',requestId:'request',preferredStart:'2099-07-22T09:00:00.000Z',reason:'Could we meet later?'})))
})
it('shows named decision history only when expanded',async()=>{
 api.read.mockResolvedValue({...empty,history:[request],events:[{id:1,action:'requested',actor_id:'guest',created_at:'2099-07-19T08:00Z'}]})
 mount();const summary=await screen.findByText('Time-change history')
 expect(summary.closest('details').open).toBe(false)
 fireEvent.click(summary)
 expect(screen.getByText('Requested a new time')).toBeTruthy();expect(screen.getByText('You')).toBeTruthy()
})
it('bounds reads through focus storms, rerenders and a full minute of polling',async()=>{
 vi.useFakeTimers()
 try {
  const view=mount()
  await act(async()=>{await vi.advanceTimersByTimeAsync(0)})
  expect(api.read).toHaveBeenCalledTimes(1)
  view.rerender(<AppointmentTimeChange appointment={{...appointment}} actor={{id:'guest'}} />)
  for(let n=0;n<20;n++) {
   await act(async()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(150)})
  }
  await act(async()=>{await vi.advanceTimersByTimeAsync(65000)})
  expect(api.read.mock.calls.length).toBeLessThanOrEqual(4)
 } finally {vi.useRealTimers()}
})
it('stops offering decisions when the deadline passes without adding a server request',async()=>{
 vi.useFakeTimers()
 try {
  api.read.mockResolvedValue({...empty,canManage:true,active:{...request,request_expires_at:new Date(Date.now()+5000).toISOString()}})
  mount();await act(async()=>{await vi.advanceTimersByTimeAsync(0)})
  expect(screen.getByRole('button',{name:'Propose this time'})).toBeTruthy()
  await act(async()=>{await vi.advanceTimersByTimeAsync(15000)})
  expect(screen.getByText('Time-change request expired')).toBeTruthy()
  expect(screen.queryByRole('button',{name:'Propose this time'})).toBeNull()
  expect(api.read).toHaveBeenCalledTimes(1)
 } finally {vi.useRealTimers()}
})
