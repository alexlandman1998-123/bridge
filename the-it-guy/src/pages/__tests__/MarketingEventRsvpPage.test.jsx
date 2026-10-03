// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
const api=vi.hoisted(()=>({rpc:vi.fn(),client:vi.fn()}))
vi.mock('../../lib/supabaseClient',()=>({isSupabaseConfigured:true,createScopedSupabaseClient:()=>{api.client();return {rpc:api.rpc}}}))
import MarketingEventRsvpPage from '../MarketingEventRsvpPage'
afterEach(()=>{cleanup();vi.clearAllMocks()})
it('uses the public token RPC client and prevents duplicate RSVP submission',async()=>{
  let resolve
  api.rpc.mockResolvedValueOnce({data:[{event_id:'event-1',title:'Family home',starts_at:'2099-10-03T08:00:00Z',timezone:'Africa/Johannesburg'}]}).mockReturnValueOnce(new Promise(done=>{resolve=done}))
  render(<MemoryRouter initialEntries={['/marketing/rsvp/token-1']}><Routes><Route path="/marketing/rsvp/:token" element={<MarketingEventRsvpPage/>}/></Routes></MemoryRouter>)
  await screen.findByRole('button',{name:'Confirm RSVP'})
  expect(api.rpc).toHaveBeenCalledWith('get_marketing_event_rsvp',{p_token:'token-1'})
  fireEvent.change(screen.getByLabelText('Full name'),{target:{value:'Demo Guest'}})
  fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'guest@example.test'}})
  fireEvent.change(screen.getByLabelText('Mobile number'),{target:{value:'0123456789'}})
  fireEvent.submit(screen.getByRole('button',{name:'Confirm RSVP'}).closest('form'))
  fireEvent.submit(screen.getByRole('button',{name:'Saving RSVP…'}).closest('form'))
  expect(api.rpc).toHaveBeenCalledTimes(2)
  expect(api.rpc).toHaveBeenLastCalledWith('submit_marketing_event_rsvp',expect.objectContaining({p_token:'token-1',p_full_name:'Demo Guest',p_email:'guest@example.test'}))
  resolve({error:null})
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Saving RSVP…'})).toBeNull())
})
