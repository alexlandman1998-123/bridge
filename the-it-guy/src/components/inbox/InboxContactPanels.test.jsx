// @vitest-environment jsdom
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { InboxContactActivity, InboxContactProfile } from './InboxContactPanels'
afterEach(cleanup)
it('shows saved preferences, requirements and linked records without inventing missing fields',()=>{
 const info={contact:{first_name:'Pat',email:'pat@example.test'},lead:{budget:2500000,area_interest:'Boksburg',finance_type:'bond'},requirements:[{requirement_id:'req',title:'Family home',bedrooms_min:3,must_haves:['Garden']}],context:{linked:{recordId:'lead',kind:'buyer',name:'Pat',path:'/pipeline/leads/lead'}},linkedLeads:[]}
 render(<MemoryRouter><InboxContactProfile info={info} current={{contact_phone:'27821234567'}}/></MemoryRouter>)
 expect(screen.getByText('Boksburg')).toBeTruthy();expect(screen.getByText('Family home')).toBeTruthy();expect(screen.getByText('Garden')).toBeTruthy();expect(screen.getByRole('link',{name:/Pat/}).getAttribute('href')).toBe('/pipeline/leads/lead')
})
it('merges chat and recorded CRM activity in date order and preserves history paging',()=>{
 const older=vi.fn(),linked=vi.fn()
 render(<MemoryRouter><InboxContactActivity info={{context:{linked:{}},activities:[{id:'call',at:'2026-10-02T12:00:00Z',title:'Call',body:'Viewing agreed'}],activityHasMore:true,loadMoreActivity:linked}} messages={[{id:'wa',event_at:'2026-10-03T12:00:00Z',direction:'inbound',body_text:'Thanks',delivery_status:'received'}]} nextCursor="older" onLoadOlder={older}/></MemoryRouter>)
 const items=screen.getAllByRole('listitem');expect(items[0].textContent).toContain('WhatsApp received');expect(items[1].textContent).toContain('Viewing agreed')
 fireEvent.click(screen.getByRole('button',{name:'Load older chat history'}));fireEvent.click(screen.getByRole('button',{name:'Load older linked activity'}));expect(older).toHaveBeenCalledOnce();expect(linked).toHaveBeenCalledOnce()
})
it('never shows revoked message text in the relationship timeline',()=>{
 render(<MemoryRouter><InboxContactActivity info={{context:{linked:{}}}} messages={[{id:'deleted',event_at:'2026-10-03T12:00:00Z',direction:'inbound',body_text:'Deleted private content',revoked_at:'2026-10-03T13:00:00Z'}]}/></MemoryRouter>)
 expect(screen.getByText('Message deleted')).toBeTruthy();expect(screen.queryByText('Deleted private content')).toBeNull()
})
