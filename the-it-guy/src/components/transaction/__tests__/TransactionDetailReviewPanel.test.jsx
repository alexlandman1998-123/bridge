// @vitest-environment jsdom
import React from 'react'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {DEAL_REVIEW_SECTIONS,reviewSectionDetails} from '../../../core/transactions/transactionDetailReview.js'
const mocks=vi.hoisted(()=>({load:vi.fn(),save:vi.fn(),url:vi.fn()}))
vi.mock('../../../services/transactionDetailReviewService.js',()=>({loadTransactionDetailReview:mocks.load,saveTransactionDetailReview:mocks.save,createReviewSourceUrl:mocks.url}))
import Panel from '../TransactionDetailReviewPanel.jsx'
const fixture=()=>({transactionId:'tx',saleDate:'2024-04-03',stage:'Transfer',documents:[{id:'pdf',name:'otp.pdf',available:true,filePath:'otp.pdf'}],history:[],sections:DEAL_REVIEW_SECTIONS.map(({key})=>({key,revision:0,status:'needs_review',currentSnapshot:{...reviewSectionDetails(key),name:'Scanned name',purchaserType:'individual',primaryCount:1,participantId:'p',buyerProfileId:'b',capturedBuyerId:'b',savedPrimaryId:'p'}}))})
beforeEach(()=>{mocks.load.mockResolvedValue(fixture());mocks.url.mockResolvedValue('https://example.com/signed.pdf');mocks.save.mockResolvedValue({review:fixture(),refreshWarning:''})})
afterEach(()=>{cleanup();vi.resetAllMocks()})
it('keeps corrections across sections and does not save on opening',async()=>{
render(<Panel transactionId="tx" canEdit />)
fireEvent.change(await screen.findByLabelText('Full name'),{target:{value:'Correct name'}})
fireEvent.click(screen.getByRole('tab',{name:/Seller details/}));fireEvent.change(screen.getByLabelText('Seller name'),{target:{value:'Correct seller'}})
fireEvent.click(screen.getByRole('tab',{name:/Buyer details/}));expect(screen.getByLabelText('Full name').value).toBe('Correct name');expect(mocks.save).not.toHaveBeenCalled();expect(screen.getByText('2024-04-03')).toBeTruthy()
expect(screen.getByRole('button',{name:'Back to Deal Setup'}).disabled).toBe(true)
fireEvent.click(screen.getByRole('button',{name:'Discard unsaved changes'}));expect(screen.getByLabelText('Full name').value).toBe('Scanned name')
})
it('requires document attestation before confirming and calls the section save',async()=>{
render(<Panel transactionId="tx" canEdit />);await screen.findByTitle('Original transaction PDF')
const button=screen.getByRole('button',{name:'Save and confirm buyer'});expect(button.disabled).toBe(true)
fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button)
await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({section:'buyer',confirm:true,sourceDocumentId:'pdf',attested:true})))
await screen.findByText('Buyer details confirmed.')
})
it('permits a draft with no source and keeps confirmation disabled',async()=>{
mocks.load.mockResolvedValue({...fixture(),documents:[]});render(<Panel transactionId="tx" canEdit />)
fireEvent.change(await screen.findByLabelText('Full name'),{target:{value:'Draft name'}})
expect(screen.getByRole('checkbox').disabled).toBe(true);expect(screen.getByRole('button',{name:'Save and confirm buyer'}).disabled).toBe(true)
fireEvent.click(screen.getByRole('button',{name:'Save draft'}));await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({confirm:false,sourceDocumentId:null})))
})
it('keeps edits after a save conflict and after reloading the latest values',async()=>{
mocks.save.mockRejectedValue(new Error('Details changed. Reload and compare.'));render(<Panel transactionId="tx" canEdit />)
fireEvent.change(await screen.findByLabelText('Full name'),{target:{value:'Unsaved correction'}});fireEvent.click(screen.getByRole('button',{name:'Save draft'}));await screen.findByText('Details changed. Reload and compare.')
fireEvent.click(screen.getByRole('button',{name:'Reload saved details'}));await screen.findByText('Saved details reloaded. Your unsaved edits are kept so you can compare them.');expect(screen.getByLabelText('Full name').value).toBe('Unsaved correction')
})
it('shows migration errors with a working retry',async()=>{
mocks.load.mockRejectedValueOnce(new Error('Database update required'));render(<Panel transactionId="tx" canEdit />);await screen.findByText('Database update required');fireEvent.click(screen.getByRole('button',{name:'Retry loading review'}));await screen.findByLabelText('Full name');await screen.findByTitle('Original transaction PDF')
})

it('adds funding as the fifth section and preserves draft amounts across tabs',async()=>{
render(<Panel transactionId="tx" canEdit />);await screen.findByLabelText('Full name')
expect(screen.getByText('0 of 5 sections confirmed')).toBeTruthy()
fireEvent.click(screen.getByRole('tab',{name:/Commercial terms & Funding/}))
fireEvent.change(screen.getByLabelText('Purchase price'),{target:{value:'1000000'}})
fireEvent.change(screen.getByLabelText('Deposit'),{target:{value:'0'}})
fireEvent.change(screen.getByLabelText('Finance type'),{target:{value:'hybrid'}})
fireEvent.change(screen.getByLabelText('Cash amount'),{target:{value:'300000'}})
fireEvent.change(screen.getByLabelText('Bond amount'),{target:{value:'700000'}})
fireEvent.change(screen.getByLabelText('Finance managed by'),{target:{value:'client'}})
fireEvent.click(screen.getByRole('tab',{name:/Buyer details/}));fireEvent.click(screen.getByRole('tab',{name:/Commercial terms & Funding/}))
expect(screen.getByLabelText('Cash amount').value).toBe('300000')
await screen.findByTitle('Original transaction PDF');fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Save and confirm funding'}))
await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({section:'funding',confirm:true,details:expect.objectContaining({purchasePrice:'1000000',cashAmount:'300000',bondAmount:'700000',managedBy:'client'})})))
})

it('shows an unknown imported funding value rather than an empty selected finance type',async()=>{
 const review=fixture();review.sections.find(s=>s.key==='funding').currentSnapshot.financeType='not cash - check scan';mocks.load.mockResolvedValue(review)
 render(<Panel transactionId="tx" canEdit />);await screen.findByLabelText('Full name');fireEvent.click(screen.getByRole('tab',{name:/Commercial terms & Funding/}))
 expect(screen.getByRole('option',{name:'Unresolved: not cash - check scan'})).toBeTruthy();expect(screen.getByText(/select the correct finance type/)).toBeTruthy();expect(mocks.save).not.toHaveBeenCalled()
})
