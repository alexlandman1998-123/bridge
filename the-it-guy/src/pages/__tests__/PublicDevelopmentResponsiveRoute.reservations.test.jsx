// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import PublicDevelopmentResponsiveRoute from '../PublicDevelopmentResponsiveRoute.jsx'
const mocks=vi.hoisted(()=>({rpc:vi.fn(),invoke:vi.fn(),fetch:vi.fn(),mobile:false}))
vi.mock('../../lib/supabaseClient',()=>({isSupabaseConfigured:true,supabase:{rpc:mocks.rpc,functions:{invoke:mocks.invoke},channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:vi.fn()}}))
vi.mock('../../components/developments/PublicDevelopmentVisualExplorer.jsx',()=>({default:({inventory,onReserveUnit})=><section aria-label="Test inventory">{inventory.map(unit=><div key={unit.id}><span>Unit {unit.unitNumber}: {unit.reservationLabel||unit.status}</span><button disabled={unit.status!=='available'} onClick={()=>onReserveUnit(unit)}>Reserve unit {unit.unitNumber}</button></div>)}</section>}))
const listing=(status='available')=>({id:'development',name:'Madison Place',marketing:{mediaLibrary:{coverImageUrl:'/cover.jpg'}},inventory:[{id:'unit-42',unitNumber:'042',status,price:2750000},{id:'unit-43',unitNumber:'043',status:'available',price:2750000}]})
const config={enabled:true,refundTerms:'Fully refundable R10,000. Contact Samlin for a refund.',holds:[]}
const receipt={id:'receipt',state:'awaiting_deposit',expiresAt:'2027-11-08T10:00:00Z',reference:'MP-123',emailStatus:'queued'}
function mount(slug='madison-place-abcf1b8a'){return render(<MemoryRouter initialEntries={[`/development/${slug}`]}><Routes><Route path="/development/:slug" element={<PublicDevelopmentResponsiveRoute/>}/></Routes></MemoryRouter>)}
function fill(){fireEvent.change(screen.getByLabelText('Full name'),{target:{value:'Buyer Name'}});fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'buyer@example.test'}});fireEvent.change(screen.getByLabelText('Phone number'),{target:{value:'0820000000'}});fireEvent.click(screen.getByRole('checkbox'))}
beforeEach(()=>{
 mocks.mobile=false;sessionStorage.clear();mocks.rpc.mockReset().mockResolvedValue({data:config,error:null});mocks.invoke.mockReset().mockResolvedValue({data:receipt,error:null});mocks.fetch.mockReset().mockResolvedValue({ok:true,json:async()=>listing()});vi.stubGlobal('fetch',mocks.fetch);vi.stubGlobal('matchMedia',()=>({matches:mocks.mobile,addEventListener:vi.fn(),removeEventListener:vi.fn()}));vi.spyOn(window,'open').mockImplementation(()=>null)
})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
it.each([false,true])('requests a real server hold on desktop/mobile (%s), with queued instructions and no payment simulation',async mobile=>{
 mocks.mobile=mobile;mount();fireEvent.click(await screen.findByRole('button',{name:'Reserve unit 042'}));fill();fireEvent.click(screen.getByRole('button',{name:'Request reservation'}));
 expect(await screen.findByText('Your 48-hour hold is in place.')).toBeTruthy();expect(screen.getByText(/Your payment instructions are queued/)).toBeTruthy();expect(mocks.invoke).toHaveBeenCalledWith('madison-reservations',{body:expect.objectContaining({action:'request',unitId:'unit-42',name:'Buyer Name',consent:true,refundTerms:config.refundTerms})});expect(window.open).not.toHaveBeenCalled();expect(screen.queryByText('Simulated payment complete')).toBeNull();expect(sessionStorage.getItem('arch9:development-reservation-demo:v1')).toBeNull()
})
it('keeps a lost-response retry on the same request ID and shows no false success',async()=>{
 mocks.invoke.mockResolvedValueOnce({data:null,error:new Error('Network error')});mount();fireEvent.click(await screen.findByRole('button',{name:'Reserve unit 042'}));fill();fireEvent.click(screen.getByRole('button',{name:'Request reservation'}));expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText('Your 48-hour hold is in place.')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Request reservation'}));await screen.findByText('Your 48-hour hold is in place.');expect(mocks.invoke.mock.calls[0][1].body.requestId).toBe(mocks.invoke.mock.calls[1][1].body.requestId)
})
it('fails closed while confirmed trust details are unavailable',async()=>{
 mocks.rpc.mockResolvedValue({data:{enabled:false,holds:[]},error:null});mount();fireEvent.click(await screen.findByRole('button',{name:'Reserve unit 042'}));expect(screen.getByRole('button',{name:'Request reservation'}).disabled).toBe(true);expect(screen.getByText(/trust payment details are confirmed/)).toBeTruthy();expect(mocks.invoke).not.toHaveBeenCalled()
})
it('loads shared pending holds and ignores the old browser-only demo state',async()=>{
 sessionStorage.setItem('arch9:development-reservation-demo:v1',JSON.stringify({'madison-place-abcf1b8a':['unit-43']}));mocks.rpc.mockResolvedValue({data:{...config,holds:[{unitId:'unit-42',state:'awaiting_deposit',expiresAt:receipt.expiresAt}]},error:null});mount();expect(await screen.findByText('Unit 042: Awaiting deposit')).toBeTruthy();expect(screen.getByText('Unit 043: available')).toBeTruthy()
})
it('keeps sold stock sold and leaves other development enquiries unchanged',async()=>{
 mocks.fetch.mockResolvedValue({ok:true,json:async()=>listing('sold')});const view=mount();expect(await screen.findByText('Unit 042: sold')).toBeTruthy();view.unmount();mocks.fetch.mockResolvedValue({ok:true,json:async()=>listing()});mount('another-development');fireEvent.click(await screen.findByRole('button',{name:'Reserve unit 042'}));expect(within(screen.getByRole('dialog')).getByRole('button',{name:'Send reservation request'})).toBeTruthy()
})
it('requires consent and valid contact details before requesting a hold',async()=>{
 mount();fireEvent.click(await screen.findByRole('button',{name:'Reserve unit 042'}));fireEvent.submit(screen.getByRole('button',{name:'Request reservation'}).closest('form'));await waitFor(()=>expect(mocks.invoke).not.toHaveBeenCalled())
})
it('keeps the standalone page at the root address',async()=>{
 function Root(){const location=useLocation();return <><output aria-label="Current address">{location.pathname}</output><PublicDevelopmentResponsiveRoute developmentSlug="madison-place-abcf1b8a"/></>};render(<MemoryRouter initialEntries={['/']}><Root/></MemoryRouter>);await screen.findByText('Unit 042: available');expect(screen.getByLabelText('Current address').textContent).toBe('/')
})
it('shows a landing load failure',async()=>{mocks.fetch.mockRejectedValue(new Error('Connection unavailable'));mount();expect(await screen.findByText('Connection unavailable')).toBeTruthy()})
