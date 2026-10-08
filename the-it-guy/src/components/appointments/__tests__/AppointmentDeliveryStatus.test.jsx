// @vitest-environment jsdom
import React from 'react'
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
const read=vi.hoisted(()=>vi.fn())
vi.mock('../../../services/appointmentNotificationService',()=>({readCalendarDeliveryJobs:read}))
import AppointmentDeliveryStatus from '../AppointmentDeliveryStatus'
const appointment={appointmentId:'booking',calendarRevision:2,calendarDeliveryManaged:true}
const queued={id:'q',revision:2,event_kind:'invite',channel:'email',recipient_email:'buyer@example.test',status:'queued'}
beforeEach(()=>read.mockReset())
afterEach(()=>cleanup())
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
  view.rerender(<AppointmentDeliveryStatus appointment={appointment} viewerKey="new" />)
  await screen.findByText(/No delivery jobs/)
  finish([queued]);await waitFor(()=>expect(screen.queryByText(/buyer@example.test/)).toBeNull())
 })
 it('refreshes persisted failures on reconnection and cleans up the old subscription',async()=>{
  read.mockResolvedValueOnce([queued]).mockResolvedValueOnce([{...queued,status:'failed',last_error:'Retry limit reached.'}])
  const view=render(<AppointmentDeliveryStatus appointment={appointment} />)
  await screen.findByText(/· queued/);fireEvent(window,new Event('online'))
  await screen.findByText(/Retry limit reached/)
  view.unmount();fireEvent(window,new Event('online'))
  await new Promise(resolve=>setTimeout(resolve,150));expect(read).toHaveBeenCalledTimes(2)
 })
})
