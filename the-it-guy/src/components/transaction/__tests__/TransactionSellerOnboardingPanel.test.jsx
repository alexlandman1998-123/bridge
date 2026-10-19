// @vitest-environment jsdom
import React from 'react'
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react'
import {beforeEach,afterEach,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({load:vi.fn(),save:vi.fn(),send:vi.fn(),capture:vi.fn()}))
vi.mock('../../../services/transactionSellerWorkspaceService.js',()=>({loadTransactionSellerWorkspace:mocks.load,saveTransactionSellerWorkspace:mocks.save}))
vi.mock('../TransactionSellerCapturePanel.jsx',()=>({default:props=>{mocks.capture(props);return <div>Shared seller profile editor<button onClick={props.onBack}>Back to options</button></div>}}))
import TransactionSellerOnboardingPanel from '../TransactionSellerOnboardingPanel.jsx'
const context={details:{name:'Seller',email:'seller@example.test'},revision:{listingId:null,transactionUpdatedAt:'original'},roster:[],profile:{}}
beforeEach(()=>{vi.resetAllMocks();mocks.load.mockResolvedValue(context);mocks.send.mockResolvedValue()})
afterEach(cleanup)
const mount=props=>render(<TransactionSellerOnboardingPanel transactionId="tx" canEdit onSendLink={mocks.send} {...props}/>)
it('opens with two choices without checking incomplete details or sending anything',()=>{
 mount()
 expect(screen.getByRole('button',{name:/Capture manually/})).toBeTruthy()
 expect(screen.getByRole('button',{name:/Send onboarding link/})).toBeTruthy()
 expect(screen.queryByRole('alert')).toBeNull()
 expect(mocks.load).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled()
})
it('uses the shared listing/transaction seller editor and returns to the choices',()=>{
 mount()
 fireEvent.click(screen.getByRole('button',{name:/Capture manually/}))
 expect(screen.getByText('Shared seller profile editor')).toBeTruthy()
 expect(mocks.capture.mock.lastCall[0]).toMatchObject({transactionId:'tx',loadCapture:mocks.load,saveCapture:mocks.save})
 fireEvent.click(screen.getByRole('button',{name:'Back to options'}))
 expect(screen.getByRole('button',{name:/Send onboarding link/})).toBeTruthy()
})
it('requires recipient review and a fresh revision before sending',async()=>{
 mount()
 fireEvent.click(screen.getByRole('button',{name:/Send onboarding link/}))
 expect(await screen.findByText('seller@example.test')).toBeTruthy()
 expect(mocks.send).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'Send link'}))
 await waitFor(()=>expect(mocks.send).toHaveBeenCalledWith({context,mutationId:expect.any(String)}))
 expect(await screen.findByText('Seller onboarding link sent to seller@example.test.')).toBeTruthy()
})
it('blocks a changed recipient and lets the agent review again',async()=>{
 mocks.load.mockResolvedValueOnce(context).mockResolvedValue({...context,revision:{transactionUpdatedAt:'changed'},details:{email:'other@example.test'}})
 mount();fireEvent.click(screen.getByRole('button',{name:/Send onboarding link/}))
 fireEvent.click(await screen.findByRole('button',{name:'Send link'}))
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Seller details changed. Review the latest recipient before sending.')
 expect(mocks.send).not.toHaveBeenCalled()
})
it('asks for the missing primary seller email only after choosing the link route',async()=>{
 mocks.load.mockResolvedValue({...context,details:{name:'Seller',email:''}})
 mount();expect(screen.queryByRole('alert')).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:/Send onboarding link/}))
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Capture the primary seller email manually before sending their onboarding link.')
 expect(mocks.send).not.toHaveBeenCalled()
})
it('reuses its command reference after an uncertain delivery and does not auto-send',async()=>{
 mocks.send.mockRejectedValueOnce(new Error('Delivery could not be confirmed')).mockResolvedValueOnce()
 mount();fireEvent.click(screen.getByRole('button',{name:/Send onboarding link/}))
 fireEvent.click(await screen.findByRole('button',{name:'Send link'}))
 await screen.findByRole('alert')
 fireEvent.click(screen.getByRole('button',{name:'Send link'}))
 await screen.findByText('Seller onboarding link sent to seller@example.test.')
 expect(mocks.send.mock.calls[0][0].mutationId).toBe(mocks.send.mock.calls[1][0].mutationId)
})
