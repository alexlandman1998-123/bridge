// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
const api = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: { rpc: api.rpc } }))
vi.mock('../../services/appointmentRsvpHandoffService', () => ({ sendBuyerRsvpHandoffAfterSellerAccept: vi.fn(), sendViewingConfirmationAfterBuyerAccept: vi.fn() }))
import AppointmentRsvpPage from '../AppointmentRsvpPage.jsx'

const invitation = { participant_id: 'person', appointment_id: 'booking', appointment_title: 'Viewing',
  participant_name: 'Buyer', participant_role: 'Buyer', rsvp_status: 'Accepted', appointment_date: '2099-07-20', start_time: '10:00', end_time: '11:00' }
const replacement = { appointment_id:'booking',participant_id:'person',participant_role:'Buyer',participant_name:'Buyer',title:'Viewing',date_time:'2099-07-21T10:00:00Z',end_date_time:'2099-07-21T11:00:00Z',original_start:'2099-07-20T08:00:00Z',original_end:'2099-07-20T09:00:00Z',proposal_id:'request',proposal_revision:2,time_change:{id:'request',status:'proposed',expires_at:'2099-07-20T08:00:00Z'},can_request_time_change:false,managed: true, proposal: true, rsvp_status: 'Pending', appointment_date: '2099-07-21', start_time: '12:00', end_time: '13:00', timezone: 'Africa/Johannesburg' }
const mount = (url='/appointment-rsvp/current') => render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/appointment-rsvp/:token" element={<AppointmentRsvpPage />} /></Routes></MemoryRouter>)
beforeEach(() => { api.rpc.mockReset().mockImplementation(async name => ({ data: name === 'get_appointment_rsvp_by_token' ? [invitation] : replacement, error: null })) })
afterEach(cleanup)

it('shows the current replacement for a previously accepted invitation and asks for fresh approval', async () => {
  mount()
  await screen.findByRole('heading', { name: 'Replacement Time Request' })
  expect(screen.getByText(/21 July 2099/)).toBeTruthy()
  expect(screen.getByText(/12:00 – 13:00/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Accept proposed time' })).toBeTruthy()
  expect(screen.getByText(/original appointment stays reserved/)).toBeTruthy()
})

it('explains an expired hold and offers no response buttons', async () => {
  api.rpc.mockImplementation(async name => ({ data: name === 'get_appointment_rsvp_by_token' ? [invitation] : null }))
  mount()
  await screen.findByText(/temporary hold has expired/)
  expect(screen.queryByRole('button', { name: 'Accept proposed time' })).toBeNull()
})

it('labels an all-day replacement without presenting two midnight times', async () => {
  api.rpc.mockImplementation(async name => ({ data: name === 'get_appointment_rsvp_by_token' ? [invitation] : { ...replacement, all_day: true, start_time: '00:00', end_time: '00:00' } }))
  mount()
  await screen.findAllByText('All day', { exact: false })
  expect(screen.queryByText('00:00 - 00:00', { exact: false })).toBeNull()
})

it('rejects an unverified response without displaying confirmation', async () => {
  api.rpc.mockImplementation(async name => ({ data: name === 'get_appointment_rsvp_by_token' ? [invitation] : name === 'respond_calendar_time_change_by_token' ? [] : replacement }))
  mount()
  fireEvent.click(await screen.findByRole('button', { name: 'Accept proposed time' }))
  fireEvent.submit(screen.getByRole('button', { name: 'Submit RSVP' }).closest('form'))
  await screen.findByText(/response could not be verified/)
  expect(screen.queryByText(/attendance has been confirmed/)).toBeNull()
})

const original={...replacement,proposal:false,proposal_id:null,proposal_revision:null,time_change:null,can_request_time_change:true,rsvp_status:'Accepted',date_time:replacement.original_start,end_date_time:replacement.original_end}
const requested={...original,can_request_time_change:false,rsvp_status:'Proposed New Time',time_change:{id:'request',status:'pending',mine:true,preferred_start:replacement.date_time,preferred_end:replacement.end_date_time,expires_at:'2099-07-20T08:00Z'}}
const accepted={verified:true,appointmentId:'booking',requestId:'request',proposalRevision:2,response:'Accepted',outcome:'pending',dateTime:replacement.original_start,endDateTime:replacement.original_end}
it('never responds automatically when an email scanner opens an accept link',async()=>{
 mount('/appointment-rsvp/current?action=accept')
 await screen.findByRole('button',{name:'Submit RSVP'})
 expect(api.rpc.mock.calls.map(([name])=>name)).toEqual(['get_calendar_invitation_context'])
 expect(screen.getByRole('button',{name:'Accept proposed time'}).getAttribute('aria-pressed')).toBe('true')
})
it('lets an already accepted guest request a new time with fixed duration and withdraw it',async()=>{
 api.rpc.mockImplementation(async(name,args)=>({data:name==='get_calendar_invitation_context'?original:{verified:true,appointmentId:'booking',context:args.p_withdraw_request_id?original:requested},error:null}))
 mount();fireEvent.click(await screen.findByRole('button',{name:'Request another time'}))
 expect(screen.queryByLabelText('Preferred end time')).toBeNull()
 fireEvent.change(screen.getByLabelText('Preferred date'),{target:{value:'2099-07-21'}})
 fireEvent.change(screen.getByLabelText('Preferred start time'),{target:{value:'12:00'}})
 fireEvent.change(screen.getByLabelText('Message (optional)'),{target:{value:'Please move it.'}})
 fireEvent.click(screen.getByRole('button',{name:'Send time request'}))
 fireEvent.click(await screen.findByRole('button',{name:'Withdraw request'}))
 await screen.findByText(/Your request was withdrawn/)
 expect(api.rpc).toHaveBeenCalledWith('request_calendar_time_change_by_token',expect.objectContaining({p_start:'2099-07-21T10:00:00.000Z',p_reason:'Please move it.'}))
 expect(api.rpc).toHaveBeenCalledWith('request_calendar_time_change_by_token',expect.objectContaining({p_withdraw_request_id:'request'}))
})
it('distinguishes an individual acceptance from a fully confirmed replacement',async()=>{
 api.rpc.mockImplementation(async name=>({data:name==='get_calendar_invitation_context'?replacement:accepted,error:null}))
 mount('/appointment-rsvp/current?action=accept');fireEvent.click(await screen.findByRole('button',{name:'Submit RSVP'}))
 await screen.findByText(/Your acceptance is recorded.*remaining required attendees/)
 expect(screen.queryByText('The new appointment time is confirmed.')).toBeNull()
 expect(screen.queryByRole('button',{name:'Accept proposed time'})).toBeNull()
})
it('shows the confirmed new time only when the server verifies the complete agreement',async()=>{
 api.rpc.mockImplementation(async name=>({data:name==='get_calendar_invitation_context'?replacement:{...accepted,outcome:'confirmed',dateTime:replacement.date_time,endDateTime:replacement.end_date_time},error:null}))
 mount('/appointment-rsvp/current?action=accept');fireEvent.click(await screen.findByRole('button',{name:'Submit RSVP'}))
 await screen.findByText('The new appointment time is confirmed.')
 expect(screen.getByText('Confirmed new time')).toBeTruthy()
 expect(screen.queryByRole('button',{name:'Request another time'})).toBeNull()
})
it('retains the command after a lost response and blocks double submissions',async()=>{
 let fail=true
 api.rpc.mockImplementation(async name=>name==='get_calendar_invitation_context'?{data:replacement}:fail?(fail=false,{error:new Error('Response lost')}):{data:accepted})
 mount('/appointment-rsvp/current?action=accept')
 const submit=await screen.findByRole('button',{name:'Submit RSVP'})
 fireEvent.submit(submit.closest('form'));fireEvent.submit(submit.closest('form'))
 await screen.findByText('Response lost')
 let calls=api.rpc.mock.calls.filter(([name])=>name==='respond_calendar_time_change_by_token')
 expect(calls).toHaveLength(1)
 fireEvent.submit(submit.closest('form'))
 await screen.findByText(/Your acceptance is recorded/)
 calls=api.rpc.mock.calls.filter(([name])=>name==='respond_calendar_time_change_by_token')
 expect(calls).toHaveLength(2);expect(calls[1][1].p_command_id).toBe(calls[0][1].p_command_id)
})
it('does not give another attendee the requester withdrawal button',async()=>{
 api.rpc.mockResolvedValue({data:{...requested,time_change:{...requested.time_change,mine:false}}})
 mount();await screen.findByText('New time requested')
 expect(screen.queryByRole('button',{name:'Withdraw request'})).toBeNull()
 expect(screen.queryByRole('button',{name:'Request another time'})).toBeNull()
})
it('keeps dedicated specialist invitations on their existing response owner',async()=>{
 api.rpc.mockImplementation(async name=>({data:name==='get_calendar_invitation_context'?{managed:false}:name==='get_appointment_rsvp_by_token'?[{...invitation,rsvp_status:'Pending'}]:name==='is_managed_listing_viewing_rsvp'?true:[{participant_id:'person',appointment_id:'booking',rsvp_status:'Accepted'}]}))
 mount();fireEvent.click(await screen.findByRole('button',{name:'Accept proposed time'}));fireEvent.click(screen.getByRole('button',{name:'Submit RSVP'}))
 await screen.findByText('Thanks, your attendance has been confirmed.')
 expect(api.rpc).toHaveBeenCalledWith('submit_appointment_rsvp',expect.anything())
 expect(api.rpc.mock.calls.some(([name])=>name==='respond_calendar_time_change_by_token')).toBe(false)
})
it('does not poll or reload the invitation on focus storms',async()=>{
 mount();await screen.findByRole('heading',{name:'Replacement Time Request'})
 const initial=api.rpc.mock.calls.length
 await act(async()=>{for(let n=0;n<20;n++)window.dispatchEvent(new Event('focus'))})
 expect(api.rpc).toHaveBeenCalledTimes(initial)
})
it('shows stale response errors without hiding the invitation or claiming success',async()=>{
 api.rpc.mockImplementation(async name=>name==='get_calendar_invitation_context'?{data:replacement}:{error:{code:'40001',message:'This proposal changed. Open the latest invitation.'}})
 mount('/appointment-rsvp/current?action=accept');fireEvent.click(await screen.findByRole('button',{name:'Submit RSVP'}))
 await screen.findByRole('alert')
 expect(screen.getByRole('button',{name:'Refresh invitation'})).toBeTruthy()
 expect(screen.getByRole('heading',{name:'Replacement Time Request'})).toBeTruthy()
 await waitFor(()=>expect(screen.queryByText('The new appointment time is confirmed.')).toBeNull())
})
