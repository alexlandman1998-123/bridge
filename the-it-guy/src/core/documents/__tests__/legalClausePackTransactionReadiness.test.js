import assert from 'node:assert/strict'
import test from 'node:test'
import { listPublishableLegalClausePackKeys } from '../legalClausePackCoverage.js'
import {
  LEGAL_CLAUSE_PACK_TRANSACTION_REQUIREMENTS,
  resolveLegalClausePackTransactionReadiness,
} from '../legalClausePackTransactionReadiness.js'

function individualCashDraft(overrides = {}) {
  return {
    legalInstrumentFamily: 'residential_resale',
    sellerEntityType: 'individual',
    sellerFullName: 'Sam Seller',
    sellerIdNumber: '8001015009087',
    sellerMaritalRegime: 'single',
    sellerForeignMarriage: 'no',
    buyerEntityType: 'individual',
    buyerFullName: 'Pat Buyer',
    buyerIdNumber: '8102025009088',
    buyerMaritalRegime: 'single',
    buyerForeignMarriage: 'no',
    propertyTitleType: 'full_title',
    propertyAddress: '1 Example Road, Johannesburg',
    erfNumber: 'Erf 123 Sandton',
    propertyInEstateOrHoa: 'no',
    financeType: 'cash',
    purchasePrice: '3250000',
    cashAmount: '3250000',
    depositAmount: '0',
    saleOfExistingPropertyCondition: 'no',
    occupationBeforeTransfer: 'no',
    existingLease: 'no',
    sellerVatStatus: 'not_vendor',
    vatTreatment: 'transfer_duty',
    ...overrides,
  }
}

function companyCombinationDraft(overrides = {}) {
  return individualCashDraft({
    sellerEntityType: 'company',
    sellerFullName: 'Seller Holdings (Pty) Ltd',
    sellerIdNumber: '2020/123456/07',
    sellerMaritalRegime: '',
    sellerRepresentativeName: 'Sarah Director',
    sellerRepresentativeCapacity: 'Director',
    sellerResolutionDate: '2026-07-14',
    sellerAuthorityBasis: 'Board resolution dated 2026-07-14',
    buyerEntityType: 'company',
    buyerFullName: 'Buyer Holdings (Pty) Ltd',
    buyerIdNumber: '2021/654321/07',
    buyerMaritalRegime: '',
    buyerRepresentativeName: 'Brian Director',
    buyerRepresentativeCapacity: 'Director',
    buyerResolutionDate: '2026-07-14',
    buyerAuthorityBasis: 'Board resolution dated 2026-07-14',
    propertyTitleType: 'sectional_title',
    unitNumber: '12',
    complexName: 'Example Heights',
    erfNumber: '',
    propertyInEstateOrHoa: 'yes',
    propertyEstateOrHoaName: 'Example Estate HOA',
    propertyExclusiveUseAreas: 'yes',
    financeType: 'combination',
    bondAmount: '2800000',
    bondApprovalDeadline: '2026-08-31',
    cashAmount: '450000',
    depositAmount: '100000',
    depositHolder: 'transfer_attorney',
    saleOfExistingPropertyCondition: 'yes',
    linkedSaleDeadline: '2026-09-15',
    occupationBeforeTransfer: 'yes',
    occupationalRent: '15000',
    existingLease: 'yes',
    leaseExpiryDate: '2027-06-30',
    sellerVatStatus: 'vendor',
    vatTreatment: 'vat_inclusive',
    ...overrides,
  })
}

test('defines transaction readiness for every publishable clause pack', () => {
  assert.deepEqual(
    listPublishableLegalClausePackKeys().filter((key) => !(key in LEGAL_CLAUSE_PACK_TRANSACTION_REQUIREMENTS)),
    [],
  )
})

test('allows a complete everyday individual cash transaction to generate', () => {
  const readiness = resolveLegalClausePackTransactionReadiness({ draft: individualCashDraft() })

  assert.equal(readiness.canGenerate, true)
  assert.equal(readiness.canSendForSignature, true)
  assert.equal(readiness.missingFieldCount, 0)
  assert.equal(readiness.readyPackCount, readiness.activePackCount)
})

test('covers the extended property, finance, condition, occupation and tax packs', () => {
  const readiness = resolveLegalClausePackTransactionReadiness({ draft: companyCombinationDraft() })
  const activeKeys = new Set(readiness.activePacks.map((pack) => pack.key))

  for (const key of [
    'property_sectional_title_pack',
    'property_estate_hoa_pack',
    'property_exclusive_use_pack',
    'bond_finance_pack',
    'cash_contribution_pack',
    'deposit_trust_pack',
    'linked_property_sale_pack',
    'occupation_before_transfer_pack',
    'existing_lease_pack',
    'vat_inclusive_tax_pack',
  ]) {
    assert.equal(activeKeys.has(key), true, `${key} should be active`)
  }
  assert.equal(readiness.canGenerate, true)
})

test('turns undecided routing facts into navigable generation blockers', () => {
  const readiness = resolveLegalClausePackTransactionReadiness({
    draft: individualCashDraft({
      propertyInEstateOrHoa: 'unknown',
      saleOfExistingPropertyCondition: 'unknown',
      occupationBeforeTransfer: 'unknown',
      existingLease: 'unknown',
      sellerVatStatus: 'unknown',
      vatTreatment: 'unknown',
    }),
  })
  const fieldKeys = new Set(readiness.missingFields.map((issue) => issue.fieldKey))

  assert.equal(readiness.canGenerate, false)
  for (const key of [
    'propertyInEstateOrHoa',
    'saleOfExistingPropertyCondition',
    'occupationBeforeTransfer',
    'existingLease',
    'sellerVatStatus',
    'vatTreatment',
  ]) {
    assert.equal(fieldKeys.has(key), true, `${key} should be required`)
  }
})

test('reports missing active-pack values against their exact intake fields', () => {
  const readiness = resolveLegalClausePackTransactionReadiness({
    draft: companyCombinationDraft({
      bondApprovalDeadline: '',
      depositHolder: 'unknown',
      linkedSaleDeadline: '',
      occupationalRent: '',
      leaseExpiryDate: '',
    }),
  })
  const missing = new Map(readiness.missingFields.map((issue) => [issue.fieldKey, issue]))

  assert.equal(readiness.canGenerate, false)
  assert.equal(missing.get('bondApprovalDeadline')?.sectionKey, 'terms')
  assert.equal(missing.get('depositHolder')?.packKey, 'deposit_trust_pack')
  assert.equal(missing.get('linkedSaleDeadline')?.packKey, 'linked_property_sale_pack')
  assert.equal(missing.get('occupationalRent')?.packKey, 'occupation_before_transfer_pack')
  assert.equal(missing.get('leaseExpiryDate')?.packKey, 'existing_lease_pack')
})

test('keeps specialist zero-rated treatment as an attorney sign-off after draft readiness', () => {
  const readiness = resolveLegalClausePackTransactionReadiness({
    draft: companyCombinationDraft({ vatTreatment: 'zero_rated' }),
  })

  assert.equal(readiness.canGenerate, true)
  assert.equal(readiness.canSendForSignature, false)
  assert.ok(readiness.attorneyReviewItems.some((item) => item.code === 'zero_rated_vat_specialist_review'))
})

test('blocks contradictory answers even when every visible value is populated', () => {
  const readiness = resolveLegalClausePackTransactionReadiness({
    draft: individualCashDraft({ bondAmount: '1000000' }),
  })

  assert.equal(readiness.canGenerate, false)
  assert.ok(readiness.conflicts.some((conflict) => conflict.code === 'cash_route_with_bond_amount'))
})

test('does not force a specialist agreement through residential resale assembly', () => {
  const readiness = resolveLegalClausePackTransactionReadiness({
    draft: individualCashDraft({
      legalInstrumentFamily: 'agricultural_sale',
      propertyTitleType: 'agricultural_holding',
    }),
  })

  assert.equal(readiness.automatedAssemblyAllowed, false)
  assert.equal(readiness.canGenerate, false)
  assert.equal(readiness.assemblyMode, 'attorney_template_required')
})

test('reconciles cash and combination finance against the purchase price', () => {
  const cash = resolveLegalClausePackTransactionReadiness({
    draft: individualCashDraft({ cashAmount: '3000000' }),
  })
  const combination = resolveLegalClausePackTransactionReadiness({
    draft: companyCombinationDraft({ cashAmount: '400000' }),
  })

  assert.ok(cash.conflicts.some((conflict) => conflict.code === 'cash_amount_does_not_match_purchase_price'))
  assert.ok(combination.conflicts.some((conflict) => conflict.code === 'combination_finance_does_not_balance'))
  assert.equal(cash.canGenerate, false)
  assert.equal(combination.canGenerate, false)
})
