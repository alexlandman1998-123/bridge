// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'

import DealSetupReadinessPanel from '../DealSetupReadinessPanel.jsx'
import { buildDealSetup } from '../../../core/transactions/dealSetupContract.js'

afterEach(cleanup)

it('does not show buyer setup complete for an imported buyer ID without a buyer participant', () => {
  const setup = buildDealSetup({ transaction: { id: 'imported', buyer_id: 'legacy-buyer', purchaser_type: 'individual', finance_type: 'cash' } })
  render(<DealSetupReadinessPanel transactionId="imported" setup={setup} />)
  const step = screen.getByText('Buyers').closest('li')
  expect(within(step).getByText('Buyer links need review')).toBeTruthy()
  expect(screen.queryByText('Primary buyer assigned')).toBeNull()
  expect(screen.getByText(/document completion is tracked in the Documents tab/)).toBeTruthy()
})

it('updates after linking a primary buyer and rejects multiple primary assignments', () => {
  const transaction = { id: 'tx', buyer_id: 'buyer' }
  const party = { id: 'party', buyer_party_id: 'buyer', is_primary_buyer: true }
  const { rerender } = render(<DealSetupReadinessPanel transactionId="tx" setup={buildDealSetup({ transaction, buyerParties: [party] })} />)
  expect(screen.getByText('Primary buyer assigned')).toBeTruthy()
  rerender(<DealSetupReadinessPanel transactionId="tx" setup={buildDealSetup({ transaction, buyerParties: [party, { ...party, id: 'second' }] })} />)
  expect(screen.queryByText('Primary buyer assigned')).toBeNull()
  expect(screen.getByText('Buyer links need review')).toBeTruthy()
})

it('labels combination as cash and bond and leaves unknown funding incomplete',()=>{
 const {rerender}=render(<DealSetupReadinessPanel transactionId="legacy" setup={buildDealSetup({transaction:{id:'legacy',purchaser_type:'individual',purchase_price:100,deposit_amount:0,finance_type:'combination',cash_amount:25,bond_amount:75,finance_managed_by:'client'}})} />)
 expect(screen.getByText('Cash and bond funding reconciled')).toBeTruthy()
 rerender(<DealSetupReadinessPanel transactionId="legacy" setup={buildDealSetup({transaction:{id:'legacy',finance_type:'not cash - check scan'}})} />)
 expect(screen.getByText('Enter a positive purchase price with at most two decimal places.')).toBeTruthy();expect(screen.queryByText('Cash finance')).toBeNull()
})

it('does not complete funding until amounts reconcile and the bond manager is valid',()=>{
 const transaction={id:'t',purchaser_type:'individual',purchase_price:1000,deposit_amount:100,finance_type:'hybrid',cash_amount:100,bond_amount:800,finance_managed_by:'client'}
 const {rerender}=render(<DealSetupReadinessPanel transactionId="t" setup={buildDealSetup({transaction})} />)
 expect(screen.getByText(/Cash plus bond must equal/)).toBeTruthy()
 rerender(<DealSetupReadinessPanel transactionId="t" setup={buildDealSetup({transaction:{...transaction,bond_amount:900}})} />)
 expect(screen.getByText('Cash and bond funding reconciled')).toBeTruthy()
 rerender(<DealSetupReadinessPanel transactionId="t" setup={buildDealSetup({transaction:{...transaction,bond_amount:900,finance_managed_by:'unknown'}})} />)
 expect(screen.queryByText('Cash and bond funding reconciled')).toBeNull();expect(screen.getByText('Select Buyer or Bond originator to manage the bond.')).toBeTruthy()
})

it('does not mark unsaved funding and commercial terms complete',()=>{
 const setup=buildDealSetup({transaction:{id:'t',purchaser_type:'individual',purchase_price:1000,deposit_amount:0,finance_type:'cash',cash_amount:1000}})
 render(<DealSetupReadinessPanel transactionId="t" setup={setup} hasUnsavedChanges />)
 expect(screen.getByText('Save commercial terms')).toBeTruthy();expect(screen.getByText('Save funding details')).toBeTruthy();expect(screen.queryByText('Cash funding reconciled')).toBeNull()
})


it('counts only saved setup steps and keeps document completion outside the counter', () => {
  const setup = buildDealSetup({
    transaction: { id: 'complete', buyer_id: 'buyer', purchaser_type: 'individual', purchase_price: 1000, deposit_amount: 0, finance_type: 'cash', cash_amount: 1000 },
    buyerParties: [{ id: 'party', buyer_party_id: 'buyer', is_primary_buyer: true }],
  })
  render(<DealSetupReadinessPanel transactionId="complete" setup={setup} />)
  expect(screen.getByText('3 of 3 setup steps complete')).toBeTruthy()
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
  expect(screen.queryByText('All requirements met')).toBeNull()
  expect(screen.getByText(/Imported details are verified separately/)).toBeTruthy()
})
