// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import RentalPortalManagementPanel from '../RentalPortalManagementPanel'
afterEach(cleanup)
const channel={key:'private_property',label:'Private Property',status:'active',reference:'R123',publicUrl:'',activity:[{label:'Accepted',time:'2026-10-04T10:00:00Z'}]}
it('offers rental statuses, explicit refresh and manually confirmed links',()=>{
 const onRefresh=vi.fn(),onChangeStatus=vi.fn(),onVerifyLink=vi.fn()
 render(<RentalPortalManagementPanel channel={channel} onRefresh={onRefresh} onChangeStatus={onChangeStatus} onVerifyLink={onVerifyLink} onClose={()=>{}} />)
 expect(screen.getAllByRole('option').map(option=>option.textContent)).toEqual(['ToLet','Inactive'])
 fireEvent.click(screen.getByRole('button',{name:'Refresh portal status'}));expect(onRefresh).toHaveBeenCalledOnce()
 fireEvent.change(screen.getByLabelText('Rental portal status'),{target:{value:'Inactive'}});fireEvent.click(screen.getByRole('button',{name:'Send status change'}));expect(onChangeStatus).toHaveBeenCalledWith('Inactive')
 const save=screen.getByRole('button',{name:'Save confirmed public link'});expect(save.disabled).toBe(true)
 fireEvent.change(screen.getByLabelText('Public listing URL'),{target:{value:'https://www.privateproperty.co.za/to-rent/demo/R123'}})
 expect(save.disabled).toBe(true);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(save);expect(onVerifyLink).toHaveBeenCalledWith('https://www.privateproperty.co.za/to-rent/demo/R123')
 fireEvent.change(screen.getByLabelText('Public listing URL'),{target:{value:'https://www.privateproperty.co.za/to-rent/changed/R123'}});expect(save.disabled).toBe(true)
})
it('shows missing references and history failures and disables unsupported operations',()=>{
 render(<RentalPortalManagementPanel channel={{...channel,reference:''}} historyError="History unavailable" onClose={()=>{}} />)
 expect(screen.getByRole('alert').textContent).toBe('History unavailable')
 expect(screen.getByRole('button',{name:'Refresh portal status'}).disabled).toBe(true);expect(screen.getByRole('button',{name:'Send status change'}).disabled).toBe(true)
})
