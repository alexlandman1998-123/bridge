// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../../lib/supabaseClient.js', () => ({ supabase: { functions: { invoke: mock.invoke } } }));
import PublicDevelopmentEnquiryForm from '../PublicDevelopmentEnquiryForm.jsx';
import DevelopmentWebsiteAnalyticsDashboard from '../DevelopmentWebsiteAnalyticsDashboard.jsx';
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); });
beforeEach(() => { mock.invoke.mockReset(); });
function form() {
 render(<PublicDevelopmentEnquiryForm estatePresentation developmentName="Madison Place" agency="Samlin Construction" enquiry="#enquire" />);
 for(const [label,value] of [['Full name','Buyer Name'],['Email address','buyer@agency.co.za'],['Phone number','0820000000']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
 fireEvent.click(screen.getByRole('checkbox'));
 return screen.getByRole('button',{name:'Send enquiry'}).closest('form');
}
it('confirms only the saved receipt and blocks duplicate clicks while saving',async()=>{
 let resolve;mock.invoke.mockReturnValue(new Promise(r=>{resolve=r}));const el=form();fireEvent.submit(el);fireEvent.submit(el);
 expect(mock.invoke).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'Sending enquiry…'}).disabled).toBe(true);expect(screen.queryByText(/has been received/)).toBeNull();
 await act(async()=>resolve({data:{saved:true,reference:'MP-E-ONE'},error:null}));
 expect(screen.getByRole('status').textContent).toContain('MP-E-ONE');expect(screen.getByRole('button',{name:'Enquiry received'}).disabled).toBe(true);
 expect(mock.invoke.mock.calls[0][0]).toBe('madison-enquiries');expect(mock.invoke.mock.calls[0][1].body.consent).toBe(true);
});
it('retains values after failure and retries the same request identity',async()=>{
 mock.invoke.mockResolvedValueOnce({error:{context:{json:async()=>({error:'Too many enquiries. Please wait.'})}}}).mockResolvedValueOnce({data:{saved:true,reference:'MP-E-RETRY'}});
 const el=form();fireEvent.submit(el);await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Please wait'));
 expect(screen.getByLabelText('Full name').value).toBe('Buyer Name');fireEvent.submit(el);await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('MP-E-RETRY'));
 expect(mock.invoke.mock.calls[0][1].body.requestId).toBe(mock.invoke.mock.calls[1][1].body.requestId);
});
it('requires contact consent and never opens an external channel for Madison enquiries',async()=>{
 const open=vi.spyOn(window,'open').mockImplementation(()=>null);const el=form();fireEvent.click(screen.getByRole('checkbox'));fireEvent.submit(el);expect(mock.invoke).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();expect(screen.getByRole('status').textContent).toContain('agree');
});
it('shows click totals separately from saved submissions',()=>{
 render(<DevelopmentWebsiteAnalyticsDashboard analytics={{summary:{sessions:15,enquiries:10,submittedEnquiries:3}}} days={30}/>);
 expect(screen.getByRole('button',{name:/10 Enquiry clicks/})).toBeTruthy();expect(screen.getByRole('button',{name:/3 Enquiries submitted/})).toBeTruthy();
});

it('carries an incoming campaign capability through the actual enquiry submission',async()=>{
 window.history.replaceState({},'',`/?arch9_attribution=${'a'.repeat(32)}`)
 mock.invoke.mockResolvedValue({data:{saved:true,reference:'MP-E-ATTRIBUTED'},error:null})
 const el=form();fireEvent.submit(el)
 await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('MP-E-ATTRIBUTED'))
 expect(mock.invoke.mock.calls[0][1].body.attributionToken).toBe('a'.repeat(32))
 window.history.replaceState({},'','/')
})
