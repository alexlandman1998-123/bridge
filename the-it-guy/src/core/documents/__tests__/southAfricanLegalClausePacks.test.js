import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSouthAfricanLegalDealFacts } from '../southAfricanLegalDealFacts.js'
import {
  SOUTH_AFRICAN_LEGAL_CLAUSE_PACKS_VERSION,
  buildSouthAfricanLegalClausePackPlaceholders,
  resolveSouthAfricanLegalClausePacks,
} from '../southAfricanLegalClausePacks.js'
import { evaluateVisibilityRules } from '../sectionVisibilityRules.js'

function buildFacts(overrides = {}) {
  return buildSouthAfricanLegalDealFacts({
    draft: {
      legalInstrumentFamily: 'residential_resale',
      sellerEntityType: 'company',
      buyerEntityType: 'trust',
      propertyTitleType: 'sectional_title',
      propertyInEstateOrHoa: 'yes',
      propertyEstateOrHoaName: 'Example Estate',
      propertyExclusiveUseAreas: 'yes',
      financeType: 'combination',
      bondAmount: '1800000',
      cashAmount: '500000',
      bondApprovalDeadline: '2026-08-31',
      depositAmount: '100000',
      depositHolder: 'transfer_attorney',
      saleOfExistingPropertyCondition: 'yes',
      linkedSaleDeadline: '2026-09-15',
      occupationBeforeTransfer: 'yes',
      occupationalRent: '15000',
      existingLease: 'no',
      sellerVatStatus: 'not_vendor',
      vatTreatment: 'transfer_duty',
      ...overrides,
    },
  })
}

test('resolves a composable OTP clause set from one facts snapshot', () => {
  const resolution = resolveSouthAfricanLegalClausePacks(buildFacts())

  assert.equal(resolution.schemaVersion, SOUTH_AFRICAN_LEGAL_CLAUSE_PACKS_VERSION)
  assert.equal(resolution.draftAssemblyAllowed, true)
  assert.equal(resolution.signingReady, true)
  assert.deepEqual(resolution.activePackKeys, [
    'residential_resale_core_pack',
    'seller_company_authority_pack',
    'buyer_trust_authority_pack',
    'property_sectional_title_pack',
    'property_estate_hoa_pack',
    'property_exclusive_use_pack',
    'bond_finance_pack',
    'cash_contribution_pack',
    'deposit_trust_pack',
    'linked_property_sale_pack',
    'occupation_before_transfer_pack',
    'transfer_duty_tax_pack',
  ])
})

test('keeps unknown facts in a signing review queue without guessing a pack', () => {
  const resolution = resolveSouthAfricanLegalClausePacks(buildFacts({
    propertyInEstateOrHoa: 'unknown',
    propertyExclusiveUseAreas: 'unknown',
    financeType: 'cash',
    bondAmount: '',
    cashAmount: '2300000',
    bondApprovalDeadline: '',
    depositAmount: '',
    depositHolder: 'unknown',
    saleOfExistingPropertyCondition: 'unknown',
    linkedSaleDeadline: '',
    occupationBeforeTransfer: 'unknown',
    occupationalRent: '',
    existingLease: 'unknown',
    sellerVatStatus: 'unknown',
    vatTreatment: 'unknown',
  }))

  assert.equal(resolution.draftAssemblyAllowed, true)
  assert.equal(resolution.signingReady, false)
  assert.ok(resolution.reviewItems.some((item) => item.code === 'hoa_status_unknown'))
  assert.ok(resolution.reviewItems.some((item) => item.code === 'vat_treatment_unknown'))
  assert.equal(resolution.activePackKeys.includes('property_estate_hoa_pack'), false)
  assert.equal(resolution.activePackKeys.some((key) => key.includes('tax_pack')), false)
})

test('blocks contradictory clause assembly and explains the conflict', () => {
  const resolution = resolveSouthAfricanLegalClausePacks(buildFacts({
    propertyTitleType: 'full_title',
    propertyExclusiveUseAreas: 'yes',
    sellerVatStatus: 'not_vendor',
    vatTreatment: 'vat_inclusive',
  }))

  assert.equal(resolution.draftAssemblyAllowed, false)
  assert.equal(resolution.signingReady, false)
  assert.deepEqual(resolution.conflicts.map((item) => item.code), [
    'missing_dependency_property_exclusive_use_pack',
    'non_vendor_with_vat_treatment',
    'exclusive_use_without_sectional_title',
  ])
})

test('requires an attorney template for a specialist instrument family', () => {
  const resolution = resolveSouthAfricanLegalClausePacks(buildFacts({ legalInstrumentFamily: 'agricultural_sale' }))

  assert.equal(resolution.assemblyMode, 'attorney_template_required')
  assert.equal(resolution.draftAssemblyAllowed, false)
  assert.equal(resolution.activePackKeys.includes('residential_resale_core_pack'), false)
})

test('emits stable routing placeholders for visibility rules and provenance', () => {
  const resolution = resolveSouthAfricanLegalClausePacks(buildFacts())
  const placeholders = buildSouthAfricanLegalClausePackPlaceholders(resolution)

  assert.equal(placeholders.legal_clause_pack_version, SOUTH_AFRICAN_LEGAL_CLAUSE_PACKS_VERSION)
  assert.equal(placeholders.legal_clause_pack_signing_ready, 'yes')
  assert.match(placeholders.legal_active_clause_packs, /property_estate_hoa_pack/)
  assert.match(placeholders.legal_clause_pack_selection_key, /sa_legal_clause_packs_v1/)
  assert.equal(evaluateVisibilityRules({
    field: 'legal_active_clause_packs',
    operator: 'contains',
    value: 'property_estate_hoa_pack',
  }, placeholders), true)
  assert.equal(evaluateVisibilityRules({
    field: 'legal_active_clause_packs',
    operator: 'contains',
    value: 'existing_lease_pack',
  }, placeholders), false)
})
