// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), send: vi.fn(), updated: vi.fn() }))
vi.mock('../../../services/transactionBuyerCaptureService.js', () => ({ loadTransactionBuyerCapture: mocks.load, saveTransactionBuyerCapture: mocks.save }))
import TransactionBuyerOnboardingPanel from '../TransactionBuyerOnboardingPanel.jsx'
const context = {
  participantId: 'person', buyerId: 'profile', buyer: { name: 'Jamie Buyer', email: 'buyer@example.test', phone: '0801' },
  profile: { purchaser_type: 'individual', first_name: 'Jamie', last_name: 'Buyer', identity_number: 'saved-id' },
  roster: [{ id: 'person', buyer_party_id: 'profile' }], revision: { formUpdatedAt: 'first' },
}
const mount = props => render(<TransactionBuyerOnboardingPanel transactionId="tx" canEdit onSendLink={mocks.send} onUpdated={mocks.updated} {...props} />)
beforeEach(() => { vi.resetAllMocks(); mocks.load.mockResolvedValue(structuredClone(context)); mocks.updated.mockResolvedValue(); mocks.send.mockResolvedValue() })
afterEach(cleanup)
it('offers two routes without loading or validating incomplete details on entry', () => {
  mount()
  expect(screen.getByRole('button', { name: /Capture manually/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /Send onboarding link/ })).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(mocks.load).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
})
it('captures a partial draft against its original revision without sending anything', async () => {
  mocks.save.mockImplementation(async ({buyer, profile, mutationId}) => ({...context,buyer,profile,mutationId}))
  mount()
  fireEvent.click(screen.getByRole('button', { name: /Capture manually/ }))
  const id = await screen.findByLabelText('South African ID Number or Passport Number')
  expect(id.value).toBe('saved-id')
  fireEvent.change(id, {target:{value:'new-id'}})
  fireEvent.click(screen.getByRole('button',{name:'Save buyer details'}))
  await screen.findByText('Buyer details saved. Onboarding has not been submitted.')
  expect(mocks.save.mock.calls[0][0]).toMatchObject({transactionId:'tx',context,profile:{identity_number:'new-id'}})
  expect(mocks.send).not.toHaveBeenCalled()
})
it('reviews the exact saved recipient, then checks the revision before explicit sending', async () => {
  mount()
  fireEvent.click(screen.getByRole('button',{name:/Send onboarding link/}))
  fireEvent.click(await screen.findByRole('button',{name:'Review onboarding link'}))
  expect(mocks.send).not.toHaveBeenCalled()
  expect(await screen.findByText('buyer@example.test')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Send link'}))
  await waitFor(()=>expect(mocks.send).toHaveBeenCalledWith({participantId:'person',buyerPartyId:'profile',name:'Jamie Buyer',email:'buyer@example.test'}))
  expect(await screen.findByText('Onboarding link sent to buyer@example.test.')).toBeTruthy()
  expect(mocks.save).not.toHaveBeenCalled()
})
it('blocks sending when a newer buyer edit changes the reviewed recipient', async () => {
  mocks.load.mockResolvedValueOnce(context).mockResolvedValue({...context,revision:{formUpdatedAt:'newer'},buyer:{...context.buyer,email:'different@example.test'}})
  mount()
  fireEvent.click(screen.getByRole('button',{name:/Send onboarding link/}))
  fireEvent.click(await screen.findByRole('button',{name:'Review onboarding link'}))
  fireEvent.click(await screen.findByRole('button',{name:'Send link'}))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','Buyer details changed. Reload and review the recipient before sending.')
  expect(mocks.send).not.toHaveBeenCalled()
})
it('keeps manual entries and the same mutation ID when a save needs retrying', async () => {
  mocks.save.mockRejectedValueOnce(new Error('Connection interrupted')).mockImplementation(async ({buyer,profile,mutationId})=>({...context,buyer,profile,mutationId}))
  mount()
  fireEvent.click(screen.getByRole('button',{name:/Capture manually/}))
  fireEvent.change(await screen.findByLabelText('South African ID Number or Passport Number'),{target:{value:'retry-id'}})
  fireEvent.click(screen.getByRole('button',{name:'Save buyer details'}))
  await screen.findByText('Connection interrupted')
  expect(screen.getByLabelText('South African ID Number or Passport Number').value).toBe('retry-id')
  fireEvent.click(screen.getByRole('button',{name:'Save buyer details'}))
  await screen.findByText('Buyer details saved. Onboarding has not been submitted.')
  expect(mocks.save.mock.calls[1][0].mutationId).toBe(mocks.save.mock.calls[0][0].mutationId)
})
it('links an explicitly identified but unlinked captured primary before reviewing a link',async()=>{
  const unlinked={...context,roster:[{id:'person',buyer_party_id:null}]}
  mocks.load.mockResolvedValue(unlinked)
  mocks.save.mockImplementation(async ({mutationId})=>({...context,mutationId}))
  mount()
  fireEvent.click(screen.getByRole('button',{name:/Send onboarding link/}))
  fireEvent.click(await screen.findByRole('button',{name:'Review onboarding link'}))
  await screen.findByRole('button',{name:'Send link'})
  expect(mocks.save).toHaveBeenCalledOnce()
  expect(mocks.send).not.toHaveBeenCalled()
})
it('drops a late load response when switching transactions',async()=>{
  let finish
  mocks.load.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  const view=mount()
  fireEvent.click(screen.getByRole('button',{name:/Capture manually/}))
  view.rerender(<TransactionBuyerOnboardingPanel transactionId="other" canEdit onSendLink={mocks.send} />)
  finish(context)
  await waitFor(()=>expect(screen.getByRole('button',{name:/Capture manually/})).toBeTruthy())
  expect(screen.queryByDisplayValue('buyer@example.test')).toBeNull()
})
