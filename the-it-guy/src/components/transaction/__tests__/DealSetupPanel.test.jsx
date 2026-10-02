// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), buyerProps: vi.fn() }))
vi.mock('../../../services/dealSetupService.js', () => ({
  loadCanonicalDealSetup: mocks.load,
  saveCanonicalDealTerms: mocks.save,
}))
vi.mock('../TransactionBuyerPartiesPanel.jsx', () => ({ default: (props) => { mocks.buyerProps(props); return <div>Buyer profiles <button type="button" onClick={() => void props.onUpdated()}>Refresh buyer</button></div> } }))
vi.mock('../TransactionDetailReviewPanel.jsx', () => ({ default: () => <div>Imported review screen</div> }))
vi.mock('../DealSetupReadinessPanel.jsx', () => ({ default: () => <div>Deal readiness</div> }))

import DealSetupPanel from '../DealSetupPanel.jsx'

const setup = {
  terms: { purchaserType: 'individual', purchasePrice: 1200000, depositAmount: 100000 },
  finance: { type: 'cash', managedBy: '', cashAmount: 1100000, bondAmount: null, bank: '' },
}
const seller = { name: 'Existing Seller', email: 'seller@example.com', phone: '0821234567', type: 'Individual', hasExistingBond: true }

beforeEach(() => {
  mocks.load.mockResolvedValue({ setup })
  mocks.save.mockImplementation(async ({ terms, finance }) => ({ setup: { terms, finance } }))
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('agent deal setup', () => {
  it('opens the review for a known bulk import, with no automatic save', async () => {
    mocks.load.mockResolvedValue({ setup, transaction: { transaction_origin_source: 'bulk_upload' } })
    render(<DealSetupPanel transactionId="imported" canEdit />)
    fireEvent.click(await screen.findByRole('button', { name: 'Review details' }))
    expect(await screen.findByText('Imported review screen')).toBeTruthy()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('keeps review closed until unsaved Deal Setup edits are saved', async () => {
    mocks.load.mockResolvedValue({ setup, transaction: { transaction_origin_source: 'bulk_import' } })
    render(<DealSetupPanel transactionId="imported" canEdit />)
    const button = await screen.findByRole('button', { name: 'Review details' })
    fireEvent.change(screen.getByLabelText('Purchase price'), { target: { value: '1350000' } })
    expect(button.disabled).toBe(true)
  })

  it('shows captured-buyer link gaps without linking or saving automatically', async () => {
    mocks.load.mockResolvedValueOnce({ setup: { ...setup, buyerLinkIssues: [{ code: 'unlinked_captured_buyer', message: 'Check the captured buyer before linking a profile.' }] } })
    render(<DealSetupPanel transactionId="imported" canEdit />)
    expect(await screen.findByText('Buyer details need checking')).toBeTruthy()
    expect(screen.getByText('Check the captured buyer before linking a profile.')).toBeTruthy()
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('keeps buyer fields when switching tabs and saves the buyer terms and funding', async () => {
    const onSaved = vi.fn()
    render(<DealSetupPanel transactionId="matter-1" canEdit sellerDetails={seller} onSaved={onSaved} onSaveSellerDetails={vi.fn()} />)
    const buyerTab = await screen.findByRole('tab', { name: 'Buyer' })
    expect(buyerTab.getAttribute('aria-selected')).toBe('true')
    fireEvent.change(screen.getByLabelText('Purchaser type'), { target: { value: 'trust' } })
    fireEvent.change(screen.getByLabelText('Purchase price'), { target: { value: '1350000' } })
    fireEvent.change(screen.getByLabelText('Deposit'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Finance type'), { target: { value: 'hybrid' } })
    fireEvent.change(screen.getByLabelText('Finance managed by'), { target: { value: 'bond_originator' } })
    fireEvent.change(screen.getByLabelText('Cash amount'), { target: { value: '1050000' } })
    fireEvent.change(screen.getByLabelText('Bond amount'), { target: { value: '300000' } })
    fireEvent.change(screen.getByLabelText('Bank'), { target: { value: 'Example Bank' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Seller' }))
    fireEvent.click(buyerTab)
    expect(screen.getByLabelText('Purchase price').value).toBe('1350000')
    expect(screen.getByLabelText('Bond amount').value).toBe('300000')
    expect(mocks.buyerProps.mock.lastCall[0].purchaserType).toBe('trust')
    fireEvent.click(screen.getAllByRole('button', { name: 'Save Deal Setup' })[0])
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({
      transactionId: 'matter-1',
      terms: expect.objectContaining({ purchaserType: 'trust', purchasePrice: '1350000', depositAmount: '0' }),
      finance: expect.objectContaining({ type: 'hybrid', managedBy: 'bond_originator', cashAmount: '1050000', bondAmount: '300000', bank: 'Example Bank' }),
    }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  })

  it('saves seller contact fields separately and opens seller profile editing', async () => {
    const onSaveSellerDetails = vi.fn().mockResolvedValue(undefined)
    const onEditSellerProfile = vi.fn()
    render(<DealSetupPanel transactionId="matter-1" canEdit sellerDetails={seller} onSaveSellerDetails={onSaveSellerDetails} onEditSellerProfile={onEditSellerProfile} />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Seller' }))
    const panel = screen.getByRole('tabpanel', { name: 'Seller details' })
    expect(within(panel).getByText('Individual')).toBeTruthy()
    expect(within(panel).getByText('Yes')).toBeTruthy()
    fireEvent.change(within(panel).getByLabelText('Seller name'), { target: { value: 'Updated Seller' } })
    fireEvent.change(within(panel).getByLabelText('Email'), { target: { value: 'updated@example.com' } })
    fireEvent.change(within(panel).getByLabelText('Phone'), { target: { value: '0837654321' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Edit seller type and bond' }))
    expect(onEditSellerProfile).toHaveBeenCalledOnce()
    fireEvent.click(within(panel).getByRole('button', { name: 'Save seller details' }))
    await waitFor(() => expect(onSaveSellerDetails).toHaveBeenCalledWith({
      name: 'Updated Seller', email: 'updated@example.com', phone: '0837654321',
    }))
    expect(mocks.save).not.toHaveBeenCalled()
    expect(await within(panel).findByRole('status')).toHaveProperty('textContent', 'Seller details saved.')
  })

  it('preserves unsaved commercial fields when buyer parties refresh', async () => {
    render(<DealSetupPanel transactionId="matter-1" canEdit sellerDetails={seller} onSaveSellerDetails={vi.fn()} />)
    await screen.findByRole('tab', { name: 'Buyer' })
    fireEvent.change(screen.getByLabelText('Purchase price'), { target: { value: '1450000' } })
    fireEvent.change(screen.getByLabelText('Cash amount'), { target: { value: '1350000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Refresh buyer' }))
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('Purchase price').value).toBe('1450000')
    expect(screen.getByLabelText('Cash amount').value).toBe('1350000')
    expect(screen.getAllByRole('button', { name: 'Save Deal Setup' })[0].disabled).toBe(false)
  })

  it('shows a failed setup load and lets the user retry', async () => {
    mocks.load.mockRejectedValueOnce(new Error('Could not load deal')).mockResolvedValueOnce({ setup })
    render(<DealSetupPanel transactionId="matter-1" canEdit />)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not load deal')
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }))
    expect(await screen.findByLabelText('Purchase price')).toHaveProperty('value', '1200000')
  })

  it('keeps seller edits after a failed save so the user can retry', async () => {
    const onSaveSellerDetails = vi.fn().mockRejectedValueOnce(new Error('Could not save seller')).mockResolvedValueOnce(undefined)
    render(<DealSetupPanel transactionId="matter-1" canEdit sellerDetails={seller} onSaveSellerDetails={onSaveSellerDetails} />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Seller' }))
    const panel = screen.getByRole('tabpanel', { name: 'Seller details' })
    fireEvent.change(within(panel).getByLabelText('Seller name'), { target: { value: 'Corrected Seller' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save seller details' }))
    expect(await within(panel).findByRole('alert')).toHaveProperty('textContent', 'Could not save seller')
    expect(within(panel).getByLabelText('Seller name')).toHaveProperty('value', 'Corrected Seller')
    fireEvent.click(within(panel).getByRole('button', { name: 'Save seller details' }))
    await waitFor(() => expect(onSaveSellerDetails).toHaveBeenCalledTimes(2))
    expect(await within(panel).findByRole('status')).toHaveProperty('textContent', 'Seller details saved.')
  })

  it('does not add buyer and seller tabs to other deal setup contexts', async () => {
    render(<DealSetupPanel transactionId="matter-1" canEdit />)
    await screen.findByLabelText('Purchase price')
    expect(screen.queryByRole('tablist')).toBeNull()
  })
})

it('displays legacy combination funding with both amounts and no automatic write',async()=>{
  mocks.load.mockResolvedValue({setup:{...setup,finance:{type:' Combination ',cashAmount:300000,bondAmount:700000,managedBy:'client',bank:'Captured bank'}}})
  render(<DealSetupPanel transactionId="legacy" canEdit />)
  expect(await screen.findByLabelText('Finance type')).toHaveProperty('value','hybrid')
  expect(screen.getByLabelText('Cash amount')).toHaveProperty('value','300000');expect(screen.getByLabelText('Bond amount')).toHaveProperty('value','700000');expect(mocks.save).not.toHaveBeenCalled()
})
it('makes an unknown imported finance type explicit until the user resolves it',async()=>{
  mocks.load.mockResolvedValue({setup:{...setup,finance:{type:'check scanned terms',cashAmount:300000,bondAmount:700000,managedBy:'client',bank:'Captured bank'}}})
  render(<DealSetupPanel transactionId="unknown" canEdit />)
  expect(await screen.findByRole('option',{name:'Unresolved: check scanned terms'})).toBeTruthy()
  expect(screen.getByText(/No finance route has been assumed/)).toBeTruthy();expect(mocks.save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Finance type'),{target:{value:'hybrid'}})
  expect(screen.queryByText(/No finance route has been assumed/)).toBeNull();expect(screen.getByLabelText('Cash amount')).toHaveProperty('value','300000');expect(screen.getByLabelText('Bond amount')).toHaveProperty('value','700000')
})
