import { describe, expect, it } from 'vitest'
import { appointmentStartIso, appointmentEndIso, appointmentDurationMinutes, appointmentMatchesCalendarRange, calendarOperationalStatus, sastDateKey, sastWeekStart, sameSastDay, shiftCalendarMonth, layoutCalendarDay } from '../attorneyCalendarModel'

describe('South African calendar model', () => {
  it('uses the saved end time for any appointment type', () => {
    expect(appointmentDurationMinutes({dateTime:'2099-07-20T08:00Z',endTime:'11:30',appointmentTypeKey:'bond_signing'})).toBe(90)
    expect(appointmentDurationMinutes({dateTime:'2099-07-20T08:00Z',endTime:'10:15',appointmentTypeKey:'transfer_signing'})).toBe(15)
    expect(appointmentDurationMinutes({dateTime:'2099-07-20T08:00Z'})).toBe(45)
  })
  it('groups midnight bookings by SAST rather than UTC or browser timezone', () => {
    expect(sastDateKey('2026-10-03T22:30Z')).toBe('2026-10-04')
    expect(sameSastDay('2026-10-03T22:30Z','2026-10-04T09:00+02:00')).toBe(true)
    expect(sastWeekStart('2026-10-04T22:30Z').toISOString()).toBe('2026-10-04T22:00:00.000Z')
  })
  it('anchors selected-day/week/month filters to the navigated date', () => {
    const row={dateTime:'2099-07-20T08:00Z'}
    expect(appointmentMatchesCalendarRange(row,'today',new Date('2099-07-20T13:00Z'))).toBe(true)
    expect(appointmentMatchesCalendarRange(row,'week',new Date('2099-07-27T13:00Z'))).toBe(false)
    expect(appointmentMatchesCalendarRange(row,'month',new Date('2099-07-01T13:00Z'))).toBe(true)
  })
  it('moves between adjacent months and clamps month-end instead of skipping February', () => {
    expect(sastDateKey(shiftCalendarMonth('2026-01-31T10:00Z',1))).toBe('2026-02-28')
    expect(sastDateKey(shiftCalendarMonth('2026-03-31T10:00Z',-1))).toBe('2026-02-28')
  })
  it('retains declined, cancelled and completed as distinct statuses', () => {
    expect(calendarOperationalStatus({status:'Declined'})).toBe('declined')
    expect(calendarOperationalStatus({status:'Cancelled'})).toBe('cancelled')
    expect(calendarOperationalStatus({status:'Completed'})).toBe('completed')
    expect(calendarOperationalStatus({status:'No-show'})).toBe('no_show')
    expect(calendarOperationalStatus({status:'Pending Confirmation'})).toBe('awaiting_confirmation')
  })
})

it('keeps concurrent bookings in separate lanes and reuses freed lanes',()=>{
  const rows=[{id:'a',dateTime:'2099-07-20T08:00Z',endTime:'11:00'},{id:'b',dateTime:'2099-07-20T08:30Z',endTime:'11:30'},{id:'c',dateTime:'2099-07-20T09:00Z',endTime:'12:00'}]
  const layout=layoutCalendarDay(rows)
  expect(layout.get('a')).toEqual({lane:0,count:2})
  expect(layout.get('b')).toEqual({lane:1,count:2})
  expect(layout.get('c')).toEqual({lane:0,count:2})
})

it('reads stored instants and older SAST date/clock rows without treating a clock as a timestamp',()=>{
  expect(appointmentStartIso({dateTime:'2099-07-20T08:00Z',startTime:'10:00'})).toBe('2099-07-20T08:00:00.000Z')
  expect(appointmentStartIso({appointment_date:'2099-07-20',start_time:'10:00'})).toBe('2099-07-20T08:00:00.000Z')
  expect(appointmentStartIso({dateTime:'2099-07-20T10:00'})).toBe('2099-07-20T08:00:00.000Z')
  expect(appointmentStartIso({startTime:'10:00'})).toBeNull()
  expect(appointmentEndIso({dateTime:'2099-07-20T08:00Z',endTime:'11:00'})).toBe('2099-07-20T09:00:00.000Z')
})
