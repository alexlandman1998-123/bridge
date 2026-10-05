// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../../../services/attorneyCalendarRolloutService',()=>({getAttorneyCalendarRolloutStatus:vi.fn(async()=>({enabled:true})),resolveAttorneyCalendarEnvironment:()=> 'development'}))
vi.mock('../../../../services/clientPortalWorkspaceService',()=>({getClientPortalWorkspaceData:vi.fn()}))
import Workspace from '../AttorneySchedulingWorkspace'
import ClientAppointmentsSection from '../../../client-portal/appointments/ClientAppointmentsSection'
import { normalizeSellerPortalAppointment } from '../../../../services/sellerPortalAppointmentsService'
import { getAppointmentStatusPresentation } from '../../../../services/appointmentDashboardService'
import { mapAttorneyAppointmentForWorkspace } from '../../../../services/attorneyOperations'
import { calendarOperationalStatus } from '../../../../core/appointments/attorneyCalendarModel'


const rows=[
  {id:'active',matterReference:'MAT-ACTIVE',status:'Confirmed',appointmentType:'Bond signing',appointmentTypeKey:'bond_signing',dateTime:'2026-10-05T08:00Z',startTime:'10:00',endTime:'11:30',resourceId:'room'},
  {id:'declined',matterReference:'MAT-DECLINED',status:'Declined',dateTime:'2026-10-05T10:00Z',endTime:'13:00'},
  {id:'cancelled',matterReference:'MAT-CANCELLED',status:'Cancelled',dateTime:'2026-10-05T11:00Z',endTime:'14:00'},
  {id:'completed',matterReference:'MAT-COMPLETED',status:'Completed',dateTime:'2026-10-05T12:00Z',endTime:'15:00'},
]
afterEach(()=>{cleanup();vi.useRealTimers()})
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-05T07:00Z'))})
function show(overrides={}) { return render(<MemoryRouter><Workspace appointmentRows={rows} matterRows={[]} documentRows={[]} resources={[]} memberOptions={[]} currentRole="firm_admin" organisationId="org" {...overrides}/></MemoryRouter>) }
function selectWithOption(name) { return screen.getByRole('option',{name}).parentElement }

describe('Attorney calendar correctness',()=>{
  it('displays saved duration in the calendar and appointment details',()=>{
    show()
    const event=screen.getAllByRole('button').find(button=>button.textContent.includes('MAT-ACTIVE'))
    expect(event.textContent).toContain('10:00 - 11:30')
    expect(event.style.height).toBe('15%')
    fireEvent.click(event)
    expect(screen.getByText('10:00 - 11:30 SAST')).toBeTruthy()
    expect(screen.queryByText(/Template prep requirements still need confirmation/)).toBeNull()
  })
  it.each([['Declined','MAT-DECLINED'],['Cancelled','MAT-CANCELLED'],['Completed','MAT-COMPLETED']])('shows %s history through the status filter', (status,reference)=>{
    show()
    fireEvent.change(selectWithOption(status),{target:{value:status.toLowerCase()}})
    expect(screen.getAllByRole('button').some(button=>button.textContent.includes(reference))).toBe(true)
    expect(screen.getAllByRole('button').some(button=>button.textContent.includes('MAT-ACTIVE'))).toBe(false)
  })
  it('switches to month without retaining a week-only filter and includes all six rows',()=>{
    show({appointmentRows:[...rows,{id:'later',matterReference:'MAT-LATER',status:'Confirmed',dateTime:'2026-10-26T08:00Z'}]})
    fireEvent.click(screen.getByRole('button',{name:'Month'}))
    expect(screen.getAllByRole('button').some(button=>button.textContent.includes('MAT-LATER'))).toBe(true)
    expect(document.querySelectorAll('.mini-month-grid button')).toHaveLength(42)
  })
})

describe('Shared appointment projections',()=>{
  const shared={appointment_id:'shared-appointment',title:'Shared signing meeting',appointment_type:'transfer_signing',
    date_time:'2099-07-20T08:00Z',start_time:'10:00',end_time:'11:00',visibility_scope:'client_visible'}
  it.each([['Pending Confirmation','awaiting_confirmation'],['Reschedule Requested','reschedule_requested'],['Declined','declined'],['Cancelled','cancelled'],['Completed','completed']])('retains %s in professional, agent and seller projections',(status,canonical)=>{
    const saved={...shared,status}
    const professional=mapAttorneyAppointmentForWorkspace(saved,null,[],[{status:'proposed'}])
    expect(calendarOperationalStatus(professional)).toBe(canonical)
    expect(getAppointmentStatusPresentation(status).key).toBe(canonical)
    expect(normalizeSellerPortalAppointment(saved).status).toBe(canonical)
    expect(normalizeSellerPortalAppointment(saved).startTime).toBe('2099-07-20T08:00:00.000Z')
    expect(professional.dateTime).toBe('2099-07-20T08:00:00.000Z')
  })
  it.each(['buying','selling'])('shows the saved SAST time and pending state in the %s portal',workspace=>{
    const booking={...shared,appointmentId:shared.appointment_id,status:'Pending Confirmation',dateTime:shared.date_time,startTime:'10:00',endTime:'11:00',
      participants:[{participantRole:'Buyer',rsvpStatus:'Pending'},{participantRole:'Seller',rsvpStatus:'Pending'}]}
    render(<ClientAppointmentsSection workspace={workspace} appointments={[booking]} />)
    expect(screen.getAllByText(/10:00/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Confirmed')).toBeNull()
    expect(screen.getByRole('button',{name:/^Confirm/})).toBeTruthy()
  })
  it.each(['buying','selling'])('does not ask an attendee to reconfirm while the %s portal awaits other people',workspace=>{
    const booking={...shared,appointmentId:shared.appointment_id,status:'Pending Confirmation',dateTime:shared.date_time,
      participants:[{participantRole:'Buyer',rsvpStatus:'Accepted'},{participantRole:'Seller',rsvpStatus:'Accepted'}]}
    render(<ClientAppointmentsSection workspace={workspace} appointments={[booking]} />)
    expect(screen.queryByRole('button',{name:/^Confirm/})).toBeNull()
    expect(screen.getAllByText(/Awaiting.*Confirmation/).length).toBeGreaterThan(0)
  })
})
