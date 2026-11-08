// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import InboxAccountPicker from './InboxAccountPicker'
afterEach(cleanup)
const accounts = [{id:'wa',channel:'whatsapp',displayName:'Samlin',address:'+27686439449'},{id:'mail',channel:'email',displayName:'Sales',address:'sales@example.test'},{id:'fb',channel:'facebook',displayName:'Business Page',address:'@agency'},{id:'ig',channel:'instagram',displayName:'Instagram',address:'@agency.photos'}]
it('shows channel logos and opens setup without navigating',()=>{
 const add=vi.fn();render(<MemoryRouter><InboxAccountPicker accounts={accounts} value="all" onChange={()=>{}} onAdd={add}/></MemoryRouter>)
 fireEvent.keyDown(screen.getByLabelText('Select inbox'),{key:'ArrowDown'})
 expect(document.querySelectorAll('[role=option]')).toHaveLength(5)
 for(const channel of ['whatsapp','email','facebook','instagram']) expect(document.querySelector(`.channel-${channel} svg`)).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'Add inbox account'}));expect(add).toHaveBeenCalledOnce();expect(document.querySelector('details').open).toBe(false)
})
it('supports keyboard selection, preserves the account identity and closes on Escape',()=>{
 const change=vi.fn();render(<MemoryRouter><InboxAccountPicker accounts={accounts} value="wa" onChange={change}/></MemoryRouter>)
 const trigger=screen.getByLabelText('Select inbox');fireEvent.keyDown(trigger,{key:'ArrowDown'});fireEvent.keyDown(document.activeElement,{key:'ArrowDown'});fireEvent.click(document.activeElement)
 expect(change).toHaveBeenCalledWith('wa');expect(document.querySelector('details').open).toBe(false)
 fireEvent.keyDown(trigger,{key:'End'});expect(document.activeElement.textContent).toContain('@agency.photos');fireEvent.keyDown(document.activeElement,{key:'Escape'});expect(document.querySelector('details').open).toBe(false);expect(document.activeElement).toBe(trigger)
})


it('keeps unfinished and sample accounts distinct from a connected mailbox',()=>{
 render(<InboxAccountPicker accounts={[{id:'draft',channel:'email',address:'pending@example.test',connectionStatus:'draft'},{id:'sample',channel:'email',address:'demo@example.test',connectionStatus:'sample'}]} value="all" onChange={vi.fn()}/>)
 fireEvent.keyDown(screen.getByLabelText('Select inbox'),{key:'ArrowDown'})
 expect(screen.getByText('Not connected')).toBeTruthy()
 expect(screen.getByText('Sample account')).toBeTruthy()
})
