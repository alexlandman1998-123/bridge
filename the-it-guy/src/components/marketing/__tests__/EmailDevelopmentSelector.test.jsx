// @vitest-environment jsdom
import React from 'react'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {afterEach,beforeEach,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({load:vi.fn()}))
vi.mock('../../../services/developmentBuyerLeadService',()=>({listBuyerLeadDevelopmentOptions:mocks.load}))
import EmailDevelopmentSelector from '../EmailDevelopmentSelector'
beforeEach(()=>{mocks.load.mockReset();mocks.load.mockResolvedValue([{id:'madison',label:'Madison Place'}])})
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('selects a workspace development and allows removing the link',async()=>{
 const change=vi.fn();render(<EmailDevelopmentSelector organisationId='org' onChange={change}/>)
 await screen.findByRole('option',{name:'Madison Place'})
 fireEvent.change(screen.getByRole('combobox',{name:'Linked development'}),{target:{value:'madison'}})
 expect(change).toHaveBeenCalledWith({development_id:'madison',development_name:'Madison Place'})
 fireEvent.change(screen.getByRole('combobox',{name:'Linked development'}),{target:{value:''}})
 expect(change).toHaveBeenLastCalledWith(null)
})
it('retains an existing development link while options load',()=>{
 mocks.load.mockReturnValue(new Promise(()=>{}))
 render(<EmailDevelopmentSelector organisationId='org' value={{development_id:'madison',development_name:'Madison Place'}} onChange={vi.fn()}/>)
 expect(screen.getByRole('combobox').value).toBe('madison')
 expect(screen.getByRole('combobox').disabled).toBe(true)
})
