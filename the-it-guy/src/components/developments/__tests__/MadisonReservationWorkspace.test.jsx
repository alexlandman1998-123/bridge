// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MadisonReservationWorkspace from '../MadisonReservationWorkspace.jsx'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),rows:[]}))
vi.mock('../../../lib/supabaseClient.js',()=>({supabase:{rpc:mocks.rpc,from:mocks.from}}))
const row={id:'hold-1',unit:{unit_number:'042'},buyer_name:'Buyer Name',buyer_email:'buyer@example.test',buyer_phone:'0820000000',state:'awaiting_deposit',payment_reference:'MP-123',expires_at:'2099-11-08T10:00:00Z'}
beforeEach(()=>{
 mocks.rows=[row];mocks.rpc.mockReset().mockResolvedValue({error:null});mocks.from.mockImplementation(table=>{
  const result={data:table==='madison_reservations'?mocks.rows:table==='madison_reservation_emails'?[{reservation_id:row.id,kind:'buyer_request',state:'failed'}]:null,error:null}
  const chain={select(){return this},eq(){return this},order(){return this},limit(){return this},in(){return this},maybeSingle(){return this},then(resolve){return Promise.resolve(result).then(resolve)}};return chain
 })
})
afterEach(cleanup)
it('requires a cleared-funds acknowledgement and bank reference before confirming',async()=>{
 render(<MadisonReservationWorkspace developmentId="development"/>);await screen.findByText(/Unit 042 · MP-123/);expect(screen.getByText(/Email needs attention/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Review deposit'}));const button=screen.getByRole('button',{name:'Confirm deposit received'});expect(button.disabled).toBe(true);fireEvent.change(screen.getByLabelText('Trust bank receipt reference'),{target:{value:'TUCKERS-001'}});expect(button.disabled).toBe(true);fireEvent.click(screen.getByLabelText(/I verified that the full R10,000/));fireEvent.click(button);await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith('madison_manage_reservation',{p_id:'hold-1',p_action:'confirm',p_bank_reference:'TUCKERS-001'}));expect(await screen.findByText(/buyer confirmation email is queued/)).toBeTruthy()
})
it('offers no confirmation action on an expired hold',async()=>{
 mocks.rows=[{...row,expires_at:'2020-01-01T10:00:00Z'}];render(<MadisonReservationWorkspace developmentId="development"/>);await screen.findByText(/Expired — awaiting automatic release/);expect(screen.queryByRole('button',{name:'Review deposit'})).toBeNull()
})
it('saves the settings through the scoped RPC without prefilled banking details',async()=>{
 render(<MadisonReservationWorkspace developmentId="development"/>);await screen.findByText(/Unit 042 · MP-123/);fireEvent.click(screen.getByRole('button',{name:'Reservation settings'}));expect(screen.getByLabelText('Account number').value).toBe('');fireEvent.click(screen.getByRole('button',{name:'Save reservation settings'}));await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith('madison_save_reservation_settings',{p_development_id:'development',p_settings:expect.objectContaining({enabled:false,account_number:''})}))
})
it('shows the empty reservation workspace and opens accessible settings without a native details dropdown',async()=>{
 mocks.rows=[]
 const {container}=render(<MadisonReservationWorkspace developmentId="development"/>)
 await screen.findByText('No website reservation requests yet.')
 expect(container.querySelector('details')).toBeNull()
 expect(screen.getByText('Requests disabled')).toBeTruthy()
 const settings=screen.getByRole('button',{name:'Reservation settings'})
 expect(settings.getAttribute('aria-expanded')).toBe('false')
 fireEvent.click(settings)
 expect(settings.getAttribute('aria-expanded')).toBe('true')
 expect(document.getElementById(settings.getAttribute('aria-controls'))).toBeTruthy()
 expect(screen.getByLabelText('Trust account holder')).toBeTruthy()
 fireEvent.click(settings)
 expect(screen.queryByLabelText('Trust account holder')).toBeNull()
})
