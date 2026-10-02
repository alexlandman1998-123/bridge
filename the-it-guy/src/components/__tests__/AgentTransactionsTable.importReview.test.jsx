// @vitest-environment jsdom
import React from 'react'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({load:vi.fn()}))
vi.mock('../../services/importedDealReviewStatusService.js',()=>({loadImportedDealReviewStatuses:mocks.load}))
import Table from '../AgentTransactionsTable.jsx'
const id=(n)=>`11111111-1111-4111-8111-${String(n).padStart(12,'0')}`
const rows=['Normal Buyer','Pending Buyer','Partial Buyer','Verified Buyer','Candidate Buyer'].map((name,index)=>({transaction:{id:id(index+1),transaction_reference:`REF-${index+1}`,transaction_origin_source:index>0&&index<4?'bulk_upload':null,updated_at:'2026-10-01',finance_type:'cash',stage:'In Transfer'},buyer:{name},stage:'In Transfer'}))
rows[4].transaction.transaction_reference='PR-OTP-IMP-R99'
const summaries={
[id(2)]:{transactionId:id(2),evidence:'identified',status:'needs_review',confirmedCount:0,totalSections:5,sourceAvailable:false},
[id(3)]:{transactionId:id(3),evidence:'identified',status:'in_review',confirmedCount:2,totalSections:5,sourceAvailable:true},
[id(4)]:{transactionId:id(4),evidence:'identified',status:'reviewed',confirmedCount:5,totalSections:5,sourceAvailable:true},
[id(5)]:{transactionId:id(5),evidence:'candidate',status:'import_candidate',confirmedCount:0,totalSections:5,sourceAvailable:false},
}
beforeEach(()=>mocks.load.mockResolvedValue(summaries))
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('shows trusted review badges and filters pending and reviewed imports separately',async()=>{
render(<Table rows={rows} />);await screen.findByText('Imported · Reviewed')
expect(screen.getByText('Import source unverified')).toBeTruthy()
fireEvent.click(screen.getByRole('button',{name:'Needs Review'}))
expect(screen.queryByText('Normal Buyer')).toBeNull();expect(screen.queryByText('Verified Buyer')).toBeNull();expect(screen.getByText('Pending Buyer')).toBeTruthy();expect(screen.getByText('Partial Buyer')).toBeTruthy();expect(screen.getByText('Candidate Buyer')).toBeTruthy()
fireEvent.click(screen.getByRole('button',{name:'Reviewed imports'}));expect(screen.getByText('Verified Buyer')).toBeTruthy();expect(screen.queryByText('Pending Buyer')).toBeNull()
fireEvent.click(screen.getByRole('button',{name:'Imported deals'}));expect(screen.queryByText('Normal Buyer')).toBeNull();expect(screen.getByText('Pending Buyer')).toBeTruthy()
})
it('clears a stale reviewed badge on refresh and does not claim verification on failure',async()=>{
render(<Table rows={rows} />);await screen.findByText('Imported · Reviewed')
mocks.load.mockRejectedValueOnce(new Error('Status needs database update'))
fireEvent(window,new Event('itg:transaction-updated'))
await screen.findByText('Status needs database update');expect(screen.queryByText('Imported · Reviewed')).toBeNull()
fireEvent.click(screen.getByRole('button',{name:'Reviewed imports'}));expect(screen.queryByText('Verified Buyer')).toBeNull()
})
it('rechecks confirmations when the transaction snapshot changes',async()=>{
const {rerender}=render(<Table rows={rows} />);await screen.findByText('Imported · Reviewed')
const callsBefore = mocks.load.mock.calls.length
mocks.load.mockResolvedValue({...summaries,[id(4)]:{...summaries[id(4)],status:'in_review',confirmedCount:3}})
rerender(<Table rows={rows.map(r=>({...r,transaction:{...r.transaction,updated_at:'2026-10-02'}}))} />)
await waitFor(()=>expect(mocks.load.mock.calls.length).toBeGreaterThan(callsBefore));await waitFor(()=>expect(screen.queryByText('Imported · Reviewed')).toBeNull())
})

it('rechecks source availability when staff return to the window',async()=>{
render(<Table rows={rows} />);await screen.findByText('Imported · Reviewed')
mocks.load.mockResolvedValue({...summaries,[id(4)]:{...summaries[id(4)],status:'needs_review',confirmedCount:0,totalSections:5,sourceAvailable:false}})
fireEvent(window,new Event('focus'))
await waitFor(()=>expect(screen.queryByText('Imported · Reviewed')).toBeNull())
})
