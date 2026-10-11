// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), buyerProps: vi.fn(), sellerLoad: vi.fn() }))
vi.mock('../../../services/transactionSellerSaveService.js', async (importOriginal) => ({ ...await importOriginal(), loadTransactionSellerEditContext: mocks.sellerLoad }))
vi.mock('../../../services/dealSetupService.js', () => ({
  loadCanonicalDealSetup: mocks.load,
  saveCanonicalDealTerms: mocks.save,
}))
vi.mock('../TransactionSellerProfile.jsx', () => ({ default: () => <div>Current seller profile</div> }))
vi.mock('../TransactionBuyerPartiesPanel.jsx', () => ({ default: (props) => { mocks.buyerProps(props); return <div>Buyer profiles <button type="button" onClick={() => void props.onUpdated()}>Refresh buyer</button></div> } }))
vi.mock('../TransactionDetailReviewPanel.jsx', () => ({ default: () => <div>Imported review screen</div> }))
vi.mock('../DealSetupReadinessPanel.jsx', () => ({ default: () => <div>Deal readiness</div> }))

import DealSetupPanel from '../DealSetupPanel.jsx'

const setup = {
  terms: { purchaserType: 'individual', purchasePrice: 1200000, depositAmount: 100000 },
  finance: { type: 'cash', managedBy: '', cashAmount: 1100000, bondAmount: null, bank: '' },
}
const seller = { name: 'Existing Seller', email: 'seller@example.com', phone: '0821234567', type: 'Individual', hasExistingBond: true }
const sellerContext = { details: { name: seller.name, email: seller.email, phone: seller.phone }, nameEditable: true, revision: { transactionUpdatedAt: 'original', participantId: 'person-1' } }

beforeEach(() => {
  mocks.load.mockResolvedValue({ setup })
  mocks.sellerLoad.mockResolvedValue(sellerContext)
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
    const onSaveSellerDetails = vi.fn().mockResolvedValue({ ...sellerContext, details: { name: 'Updated Seller', email: 'updated@example.com', phone: '0837654321' } })
    const onEditSellerProfile = vi.fn()
    render(<DealSetupPanel transactionId="matter-1" canEdit sellerDetails={seller} onSaveSellerDetails={onSaveSellerDetails} onEditSellerProfile={onEditSellerProfile} />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Seller' }))
    const panel = screen.getByRole('tabpanel', { name: 'Seller details' })
    expect(within(panel).getByText('Current seller profile')).toBeTruthy()
    expect(within(panel).queryByText('Individual')).toBeNull()
    fireEvent.change(within(panel).getByLabelText('Seller name'), { target: { value: 'Updated Seller' } })
    fireEvent.change(within(panel).getByLabelText('Email'), { target: { value: 'updated@example.com' } })
    fireEvent.change(within(panel).getByLabelText('Phone'), { target: { value: '0837654321' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Edit seller type and bond' }))
    expect(onEditSellerProfile).toHaveBeenCalledOnce()
    fireEvent.click(within(panel).getByRole('button', { name: 'Save seller details' }))
    await waitFor(() => expect(onSaveSellerDetails).toHaveBeenCalledWith({
      name: 'Updated Seller', email: 'updated@example.com', phone: '0837654321',
    }, { context: sellerContext, mutationId: expect.any(String) }))
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
    const onSaveSellerDetails = vi.fn().mockRejectedValueOnce(new Error('Could not save seller')).mockResolvedValueOnce({ ...sellerContext, details: { ...sellerContext.details, name: 'Corrected Seller' } })
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

it('preserves the losing draft and original revision through a background seller refresh', async () => {
  const saveSeller = vi.fn().mockRejectedValue(Object.assign(new Error('Someone else saved first.'), { code: 'PT409' }))
  const view = render(<DealSetupPanel transactionId="matter-1" canEdit sellerDetails={seller} onSaveSellerDetails={saveSeller} />)
  fireEvent.click(await screen.findByRole('tab', { name: 'Seller' }))
  await waitFor(() => expect(screen.getByLabelText('Phone').disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: 'my-unsaved-phone' } })
  view.rerender(<DealSetupPanel transactionId="matter-1" canEdit sellerDetails={{ ...seller, phone: 'background-phone' }} onSaveSellerDetails={saveSeller} />)
  expect(screen.getByLabelText('Phone').value).toBe('my-unsaved-phone')
  fireEvent.click(screen.getByRole('button', { name: 'Save seller details' }))
  await screen.findByText('Someone else saved first.')
  expect(saveSeller.mock.calls[0][1].context.revision).toEqual(sellerContext.revision)
  expect(screen.getByLabelText('Phone').value).toBe('my-unsaved-phone')
  expect(mocks.sellerLoad).toHaveBeenCalledTimes(1)
  const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  mocks.sellerLoad.mockResolvedValueOnce({ ...sellerContext, details: { ...sellerContext.details, phone: 'latest-phone' }, revision: { transactionUpdatedAt: 'latest' } })
  fireEvent.click(screen.getByRole('button', { name: 'Use latest saved details (discard my entries)' }))
  await waitFor(() => expect(screen.getByLabelText('Phone').value).toBe('latest-phone'))
})

it('reuses an uncertain save reference, blocks duplicate clicks and advances only from its receipt', async () => {
  let rejectSave
  const saveSeller = vi.fn().mockImplementationOnce(() => new Promise((resolve, reject) => { rejectSave = reject }))
  render(<DealSetupPanel transactionId="matter-1" canEdit sellerDetails={seller} onSaveSellerDetails={saveSeller} />)
  fireEvent.click(await screen.findByRole('tab', { name: 'Seller' }))
  await waitFor(() => expect(screen.getByLabelText('Phone').disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: 'saved-phone' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save seller details' }))
  fireEvent.submit(screen.getByLabelText('Phone').closest('form'))
  expect(saveSeller).toHaveBeenCalledTimes(1)
  rejectSave(new Error('Save response timed out.'))
  await screen.findByText('Save response timed out.')
  const receipt = { ...sellerContext, details: { ...sellerContext.details, phone: 'saved-phone' }, revision: { transactionUpdatedAt: 'confirmed' } }
  saveSeller.mockResolvedValueOnce(receipt)
  fireEvent.click(screen.getByRole('button', { name: 'Save seller details' }))
  await screen.findByText('Seller details saved.')
  expect(saveSeller.mock.calls[1][1].mutationId).toBe(saveSeller.mock.calls[0][1].mutationId)
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: 'second-phone' } })
  saveSeller.mockResolvedValueOnce({ ...receipt, details: { ...receipt.details, phone: 'second-phone' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save seller details' }))
  await waitFor(() => expect(saveSeller).toHaveBeenCalledTimes(3))
  expect(saveSeller.mock.calls[2][1].context.revision).toEqual(receipt.revision)
  expect(saveSeller.mock.calls[2][1].mutationId).not.toBe(saveSeller.mock.calls[0][1].mutationId)
})

it('does not claim success without a confirmed receipt or enable an ambiguous seller link', async () => {
  const saveSeller = vi.fn().mockResolvedValue(undefined)
  const view = render(<DealSetupPanel transactionId="matter-1" canEdit sellerDetails={seller} onSaveSellerDetails={saveSeller} />)
  fireEvent.click(await screen.findByRole('tab', { name: 'Seller' }))
  await waitFor(() => expect(screen.getByLabelText('Phone').disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: 'unsaved' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save seller details' }))
  await screen.findByText(/save could not be confirmed/)
  expect(screen.queryByText('Seller details saved.')).toBeNull()
  mocks.sellerLoad.mockResolvedValueOnce({ ...sellerContext, nameEditable: false, blockedReason: 'The person link needs review.' })
  view.rerender(<DealSetupPanel transactionId="matter-2" canEdit sellerDetails={seller} onSaveSellerDetails={saveSeller} />)
  await screen.findByText('The person link needs review.')
  expect(screen.getByLabelText('Phone').disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Save seller details' }).disabled).toBe(true)
})

it('ignores an earlier transaction save receipt after the editor changes transactions', async () => {
  let finishSave
  const saveSeller = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve }))
  const view = render(<DealSetupPanel transactionId="matter-1" canEdit sellerDetails={seller} onSaveSellerDetails={saveSeller} />)
  fireEvent.click(await screen.findByRole('tab', { name: 'Seller' }))
  await waitFor(() => expect(screen.getByLabelText('Phone').disabled).toBe(false))
  fireEvent.change(screen.getByLabelText('Phone'), { target: { value: 'first-transaction-draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save seller details' }))
  const second = { ...sellerContext, details: { ...sellerContext.details, phone: 'second-transaction' }, revision: { transactionUpdatedAt: 'second-transaction' } }
  mocks.sellerLoad.mockResolvedValueOnce(second)
  view.rerender(<DealSetupPanel transactionId="matter-2" canEdit sellerDetails={seller} onSaveSellerDetails={saveSeller} />)
  await waitFor(() => expect(screen.getByLabelText('Phone').value).toBe('second-transaction'))
  finishSave({ ...sellerContext, details: { ...sellerContext.details, phone: 'first-transaction-draft' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save seller details' }).disabled).toBe(false))
  expect(screen.getByLabelText('Phone').value).toBe('second-transaction')
  expect(screen.queryByText('Seller details saved.')).toBeNull()
})


it('linked legal corrections open the displayed listing instead of independently changing the transaction seller type', async () => {
  mocks.sellerLoad.mockResolvedValue({ ...sellerContext, nameEditable: false, revision: { ...sellerContext.revision, listingId: 'displayed-listing' } })
  const onOpenLinkedSellerProfile = vi.fn(), onEditSellerProfile = vi.fn()
  render(<DealSetupPanel transactionId="linked" sellerDetails={seller} canEdit onOpenLinkedSellerProfile={onOpenLinkedSellerProfile} onEditSellerProfile={onEditSellerProfile} />)
  fireEvent.click(await screen.findByRole('tab', { name: 'Seller' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Open linked seller profile' }))
  expect(onOpenLinkedSellerProfile).toHaveBeenCalledWith('displayed-listing')
  expect(screen.queryByRole('button', { name: 'Edit seller type and bond' })).toBeNull()
  expect(onEditSellerProfile).not.toHaveBeenCalled()
})
