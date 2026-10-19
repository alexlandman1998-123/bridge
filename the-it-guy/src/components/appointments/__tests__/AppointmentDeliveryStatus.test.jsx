// @vitest-environment jsdom
import React from 'react'
import { act, cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
const read=vi.hoisted(()=>vi.fn())
vi.mock('../../../services/appointmentNotificationService',()=>({readCalendarDeliveryJobs:read}))
import AppointmentDeliveryStatus from '../AppointmentDeliveryStatus'
const appointment={appointmentId:'booking',calendarRevision:2,calendarDeliveryManaged:true}
const queued={id:'q',revision:2,event_kind:'invite',channel:'email',recipient_email:'buyer@example.test',status:'queued'}
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});read.mockReset()})
afterEach(()=>{cleanup();vi.useRealTimers()})
describe('Appointment persisted delivery status',()=>{
 it('separates queued, provider accepted and delivered receipts and ignores an obsolete revision',async()=>{
  read.mockResolvedValue([queued,{...queued,id:'accepted',status:'provider_accepted'},{...queued,id:'delivered',status:'delivered'},{...queued,id:'obsolete',revision:1,status:'failed'}])
  render(<AppointmentDeliveryStatus appointment={appointment} viewerKey="agent" />)
  await screen.findByText(/provider accepted/)
  expect(screen.getByText(/· delivered/)).toBeTruthy();expect(screen.queryByText(/failed/)).toBeNull()
 })
 it('shows a status-read failure and reloads only when Retry succeeds',async()=>{
  read.mockRejectedValueOnce(new Error('permission denied')).mockResolvedValueOnce([])
  render(<AppointmentDeliveryStatus appointment={appointment} />)
  await screen.findByRole('alert');expect(screen.queryByText(/No delivery jobs/)).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'Retry'}))
  await screen.findByText(/No delivery jobs/)
 })
 it('does not expose a previous account’s rows while its late request resolves',async()=>{
  let finish;read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockResolvedValueOnce([])
  const view=render(<AppointmentDeliveryStatus appointment={appointment} viewerKey="previous" />)
  await act(async () => {}); view.rerender(<AppointmentDeliveryStatus appointment={appointment} viewerKey="new" />)
  await screen.findByText(/No delivery jobs/)
  finish([queued]);await waitFor(()=>expect(screen.queryByText(/buyer@example.test/)).toBeNull())
 })
 it('refreshes persisted failures on reconnection and cleans up the old subscription',async()=>{
  read.mockResolvedValueOnce([queued]).mockResolvedValueOnce([{...queued,status:'failed',last_error:'Retry limit reached.'}])
  const view=render(<AppointmentDeliveryStatus appointment={appointment} />)
  await screen.findByText(/· queued/);vi.setSystemTime(Date.now()+5000);fireEvent(window,new Event('online'))
  await screen.findByText(/Retry limit reached/)
  view.unmount();vi.setSystemTime(Date.now()+5000);fireEvent(window,new Event('online'))
  await new Promise(resolve=>setTimeout(resolve,150));expect(read).toHaveBeenCalledTimes(2)
 })
})

it('shows retained reminder and time-change receipts across a partial approval without reading on rerender',async()=>{
 read.mockResolvedValue([{...queued,id:'reminder',revision:1,event_kind:'reminder:appointment_reminder'}, {...queued,id:'proposal',revision:1,event_kind:'time_change:proposed:request:1:hash'}, {...queued,id:'superseded',revision:1,event_kind:'time_change:requested:request:1:hash',status:'superseded'}])
 const view=render(<AppointmentDeliveryStatus appointment={appointment} viewerKey="agent" />)
 await screen.findByText(/New time proposed/);expect(screen.getByText(/Reminder ·/)).toBeTruthy();expect(screen.queryByText(/New time requested/)).toBeNull()
 view.rerender(<AppointmentDeliveryStatus appointment={{...appointment}} viewerKey="agent" />)
 await act(async()=>{});expect(read).toHaveBeenCalledTimes(1)
})
