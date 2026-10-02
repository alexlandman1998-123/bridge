import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDealSetup, buildDealSetupCommercialPayload, getPrimaryDealSetupBuyer, validateDealSetup, validateDealSetupFunding, validateDealSetupCommercialTerms } from '../dealSetupContract.js'

test('deal setup combines typed transaction fields and buyer parties', () => {
  const setup = buildDealSetup({ transaction: { id: 'tx', buyer_id: 'buyer-1', purchaser_type: 'individual', finance_type: 'cash', purchase_price: 100, deposit_amount: 0, cash_amount: 100 }, buyerParties: [{ buyer_party_id: 'buyer-1', is_primary_buyer: true }] })
  assert.equal(setup.primaryBuyerId, 'buyer-1')
  assert.equal(setup.terms.purchasePrice, 100)
  assert.equal(validateDealSetup(setup).valid, true)
})

test('deal setup saves zero values and only funding fields for the selected route', () => {
  const cash = buildDealSetupCommercialPayload({
    terms: { purchaserType: 'individual', purchasePrice: '1200000', depositAmount: '0' },
    finance: { type: 'cash', cashAmount: '1200000', bondAmount: '900000', managedBy: 'bond_originator', bank: 'Old bank' },
  })
  assert.equal(cash.deposit_amount, 0)
  assert.equal(cash.purchase_price, 1200000)
  assert.equal(cash.cash_amount, 1200000)
  assert.equal(cash.bond_amount, null)
  assert.equal(cash.finance_managed_by, null)
  assert.equal(cash.bank, null)

  const bond = buildDealSetupCommercialPayload({
    terms: { purchaserType: 'trust', purchasePrice: '1200000', depositAmount: '' },
    finance: { type: 'bond', cashAmount: '500000', bondAmount: '0', managedBy: 'client', bank: 'Example Bank' },
  })
  assert.equal(bond.deposit_amount, null)
  assert.equal(bond.cash_amount, null)
  assert.equal(bond.bond_amount, 0)
  assert.equal(bond.finance_managed_by, 'client')
  assert.equal(bond.bank, 'Example Bank')
})

test('a captured buyer ID without a participant does not complete buyer setup', () => {
  const transaction = { id: 'imported', buyer_id: 'captured-buyer', purchaser_type: 'individual', finance_type: 'cash' }
  const before = structuredClone(transaction)
  const setup = buildDealSetup({ transaction })
  assert.equal(setup.primaryBuyerId, '')
  assert.equal(setup.capturedBuyerId, 'captured-buyer')
  assert.equal(setup.buyerLinkIssues[0].code, 'unlinked_captured_buyer')
  assert.equal(validateDealSetup(setup).valid, false)
  assert.deepEqual(transaction, before)
})

test('a sole buyer is not implicitly primary and removed assignments do not count', () => {
  const setup = buildDealSetup({ transaction: { id: 'tx', buyer_id: 'buyer' }, buyerParties: [
    { id: 'removed', buyer_party_id: 'buyer', is_primary_buyer: true, removed_at: '2026-09-30' },
    { id: 'active', buyer_party_id: 'buyer', is_primary_buyer: false },
  ] })
  assert.equal(setup.buyers.length, 1)
  assert.equal(setup.primaryBuyerId, '')
  assert.equal(getPrimaryDealSetupBuyer(setup.buyers), null)
})

test('manual participants remain valid primary buyers without a shared profile', () => {
  const setup = buildDealSetup({ transaction: { id: 'manual', purchaser_type: 'individual', finance_type: 'cash', purchase_price: 100, deposit_amount: 0, cash_amount: 100 }, buyerParties: [
    { id: 'manual-party', participant_name: 'Manual Buyer', is_primary_buyer: true },
  ] })
  assert.equal(setup.primaryBuyerId, 'manual-party')
  assert.equal(validateDealSetup(setup).valid, true)
})

test('multiple primaries and stale transaction links are flagged rather than guessed', () => {
  const setup = buildDealSetup({ transaction: { id: 'tx', buyer_id: 'other-buyer', primary_buyer_participant_id: 'removed' }, buyerParties: [
    { id: 'p1', buyer_party_id: 'b1', is_primary_buyer: true },
    { id: 'p2', buyer_party_id: 'b2', is_primary_buyer: true },
  ] })
  assert.equal(setup.primaryBuyerId, '')
  assert.ok(setup.buyerLinkIssues.some((issue) => issue.code === 'multiple_primary_buyers'))
  assert.ok(setup.buyerLinkIssues.some((issue) => issue.code === 'invalid_primary_participant_link'))
})

test('the transaction buyer and primary participant must agree when both are recorded', () => {
  const setup = buildDealSetup({ transaction: { id: 'tx', buyer_id: 'old', primary_buyer_participant_id: 'p1' }, buyerParties: [
    { id: 'p1', buyer_party_id: 'new', is_primary_buyer: true },
    { id: 'p2', buyer_party_id: 'old', is_primary_buyer: false },
  ] })
  assert.ok(setup.buyerLinkIssues.some((issue) => issue.code === 'primary_profile_mismatch'))
  assert.equal(validateDealSetup(setup).valid, false)
})

test('legacy finance aliases save as cash and bond without changing the loaded transaction', () => {
  const transaction={id:'legacy',finance_type:' Combination ',cash_amount:300000,bond_amount:700000,finance_managed_by:'client',sale_date:'2020-01-01',stage:'Transfer'}
  const before=structuredClone(transaction);const setup=buildDealSetup({transaction});const payload=buildDealSetupCommercialPayload(setup)
  assert.equal(payload.finance_type,'hybrid');assert.equal(payload.cash_amount,300000);assert.equal(payload.bond_amount,700000);assert.deepEqual(transaction,before)
})
test('unknown imported finance stays unresolved and cannot silently clear captured amounts', () => {
  const setup=buildDealSetup({transaction:{id:'legacy',finance_type:'not cash - check scan',cash_amount:300000,bond_amount:700000}})
  assert.ok(validateDealSetup(setup).issues.some(issue=>issue.includes('unresolved')))
  assert.throws(()=>buildDealSetupCommercialPayload(setup),/unresolved/)
  const blank=buildDealSetupCommercialPayload({finance:{type:'',cashAmount:300000,bondAmount:700000,managedBy:'client',bank:'Captured bank'}})
  assert.equal(blank.cash_amount,300000);assert.equal(blank.bond_amount,700000);assert.equal(blank.bank,'Captured bank')
})

test('funding reconciles in cents with the deposit counted once for each route',()=>{
 const terms={purchasePrice:'1000.30',depositAmount:'100.10'}
 for(const finance of [{type:'cash',cashAmount:'1000.30'},{type:'bond',bondAmount:'900.20',managedBy:'client'},{type:'hybrid',cashAmount:'100.10',bondAmount:'900.20',managedBy:'bond_originator'}])assert.equal(validateDealSetupFunding({terms,finance}).valid,true)
 assert.equal(validateDealSetupFunding({terms,finance:{type:'hybrid',cashAmount:'0.10',bondAmount:'900.20',managedBy:'client'}}).valid,false)
 assert.equal(validateDealSetupFunding({terms,finance:{type:'bond',bondAmount:'1000.30',managedBy:'client'}}).valid,false)
})
test('missing, negative, over-precise and inconsistent amounts cannot complete setup',()=>{
 const terms={purchaserType:'individual',purchasePrice:'1000',depositAmount:'0'}
 assert.equal(validateDealSetupCommercialTerms(terms).valid,true)
 for(const purchasePrice of ['', '0', '-1', 'NaN', '1.001'])assert.equal(validateDealSetupCommercialTerms({...terms,purchasePrice}).valid,false)
 assert.equal(validateDealSetupCommercialTerms({...terms,depositAmount:''}).valid,false)
 assert.equal(validateDealSetupCommercialTerms({...terms,depositAmount:'1001'}).valid,false)
 for(const finance of [{type:'bond',bondAmount:'1000',managedBy:'unknown'},{type:'hybrid',cashAmount:'250',bondAmount:'750'},{type:'cash',cashAmount:'999.99'},{type:'bond',bondAmount:'0',managedBy:'client'}])assert.equal(validateDealSetupFunding({terms,finance}).valid,false)
})
