// @vitest-environment jsdom
import React from 'react'
import { cleanup,fireEvent,render,screen } from '@testing-library/react'
import { afterEach,beforeEach,it,expect,vi } from 'vitest'
import MobileCalendarView from '../MobileCalendarView'
const row={id:'active',dateTime:'2027-10-01T09:00:00Z',endDateTime:'2027-10-01T10:00:00Z',typeLabel:'Viewing',clientName:'Active client',status:'confirmed',hasConfirmedReservation:true}
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2027-10-01T06:00:00Z'))})
afterEach(()=>{cleanup();vi.useRealTimers()})
it('opens the actual record and separates active work, history/drafts and archived history',()=>{
 const open=vi.fn(),create=vi.fn();render(<MobileCalendarView selectedDate={new Date('2027-10-01T00:00:00+02:00')} appointments={[row,{...row,id:'closed',status:'cancelled',clientName:'Cancelled client'},{...row,id:'draft',status:'draft',clientName:'Draft client'},{...row,id:'hidden',status:'cancelled',archivedAt:'2027-10-01T06:00Z',clientName:'Archived client'}]} onOpen={open} onCreate={create} />)
 expect(screen.getByText('Active client')).toBeTruthy();expect(screen.queryByText('Cancelled client')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Open Viewing'}));expect(open).toHaveBeenCalledWith(row)
 fireEvent.click(screen.getByRole('button',{name:'Create appointment'}));expect(create).toHaveBeenCalledOnce()
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'history'}});expect(screen.getByText('Cancelled client')).toBeTruthy();expect(screen.getByText('Draft client')).toBeTruthy();expect(screen.queryByText('Active client')).toBeNull()
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'archived'}});expect(screen.getByText('Archived client')).toBeTruthy();expect(screen.queryByText('Cancelled client')).toBeNull()
})
