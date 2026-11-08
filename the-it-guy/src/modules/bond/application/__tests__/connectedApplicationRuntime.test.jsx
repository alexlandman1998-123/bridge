// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import ConnectedBuyerBondApplication from '../workspace/ConnectedBuyerBondApplication.jsx'
import GuidedBondApplication from '../guided/GuidedBondApplication.jsx'
const mocks=vi.hoisted(()=>({load:vi.fn(),upload:vi.fn()}))
vi.mock('../../../../lib/clientPortalApi.js',()=>({fetchBuyerBondTrackerContext:mocks.load,uploadBuyerBondApplicationRuntimeDocument:mocks.upload}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
const context={mode:'originator_tracker',submissions:[],requiredDocuments:[],documents:[]}
it('shows buyer tracking without an application editor or signing actions',async()=>{
 mocks.load.mockResolvedValue({...context,submissions:[{bankName:'FNB',status:'submitted',reference:'TRACK-001'}]})
 render(<ConnectedBuyerBondApplication token="buyer" />)
 await screen.findByText('FNB')
 expect(mocks.load).toHaveBeenCalledWith({token:'buyer',accessToken:undefined})
 expect(screen.getByText(/do not need to sign/)).toBeTruthy()
 expect(screen.queryByText('Start application')).toBeNull()
 expect(screen.queryByText('Sign application')).toBeNull()
})
it('shows progress even if no application or documents exist',async()=>{
 mocks.load.mockResolvedValue(context)
 render(<ConnectedBuyerBondApplication accessToken="scoped" />)
 await screen.findByText(/has not recorded a bank submission/)
 expect(mocks.load).toHaveBeenCalledWith({token:undefined,accessToken:'scoped'})
})
it('uploads a requested document through the existing scoped record and displays replacement feedback',async()=>{
 const requested={id:'req',document_key:'bond_manual_request_1',document_label:'Payslips',status:'rejected',notes:'Include every page.'}
 mocks.load.mockResolvedValue({...context,requiredDocuments:[requested]});mocks.upload.mockResolvedValue({})
 render(<ConnectedBuyerBondApplication token="buyer" />)
 await screen.findByText('Include every page.')
 const file=new File(['evidence'],'income.pdf')
 fireEvent.change(screen.getByLabelText('Upload Payslips'),{target:{files:[file]}})
 await waitFor(()=>expect(mocks.upload).toHaveBeenCalledWith({token:'buyer',accessToken:undefined,requirementKey:requested.document_key,file}))
 expect(mocks.load).toHaveBeenCalledTimes(2)
})
it('never selects or sends statements through a disconnected provider',async()=>{
 mocks.load.mockResolvedValue({...context,requiredDocuments:[{id:'statements',document_key:'personal_bank_statements',document_label:'Statements'}]})
 render(<ConnectedBuyerBondApplication token="buyer" />)
 await screen.findByText(/Provide statements through the channel agreed/)
 expect(screen.queryByLabelText('Upload Statements')).toBeNull()
 expect(mocks.upload).not.toHaveBeenCalled()
})
it('clears old customer data immediately when the secure link changes',async()=>{
 mocks.load.mockResolvedValueOnce({...context,submissions:[{bankName:'Private old bank',status:'submitted'}]}).mockImplementationOnce(()=>new Promise(()=>{}))
 const {rerender}=render(<ConnectedBuyerBondApplication token="first" />)
 await screen.findByText('Private old bank')
 rerender(<ConnectedBuyerBondApplication token="second" />)
 expect(screen.queryByText('Private old bank')).toBeNull()
 expect(screen.getByText('Loading bond progress…')).toBeTruthy()
})
it('does not expose cached customer data after access is revoked',async()=>{
 mocks.load.mockResolvedValueOnce({...context,submissions:[{bankName:'Private bank',status:'submitted'}]}).mockRejectedValueOnce(new Error('Access expired'))
 render(<ConnectedBuyerBondApplication token="buyer" />)
 await screen.findByText('Private bank')
 await act(async()=>{window.dispatchEvent(new Event('focus'))})
 await screen.findByRole('alert')
 expect(screen.queryByText('Private bank')).toBeNull()
})
it('turns the older guided entry point into a tracker notice with no signing canvas',()=>{
 render(<GuidedBondApplication token="buyer" />)
 expect(screen.getByText('Bond progress tracker')).toBeTruthy()
 expect(screen.queryByLabelText('Bond application signature pad')).toBeNull()
 expect(screen.queryByText('Prepare application')).toBeNull()
})
