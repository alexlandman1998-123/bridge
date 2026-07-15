import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SOUTH_AFRICAN_LEGAL_DEAL_FACTS_VERSION,
  buildSouthAfricanLegalDealFactPlaceholders,
  buildSouthAfricanLegalDealFacts,
  validateSouthAfricanLegalDealFacts,
} from '../southAfricanLegalDealFacts.js'

test('builds one canonical facts record from the OTP intake', () => {
  const facts = buildSouthAfricanLegalDealFacts({
    draft: {
      legalInstrumentFamily: 'residential_resale',
      sellerEntityType: 'company',
      buyerEntityType: 'trust',
      propertyTitleType: 'sectional_title',
      financeType: 'bond',
      purchasePrice: '2500000',
      bondAmount: '2000000',
      depositAmount: '100000',
      depositHolder: 'transfer_attorney',
      propertyInEstateOrHoa: 'yes',
      propertyEstateOrHoaName: 'Example Estate',
      existingLease: 'no',
      saleOfExistingPropertyCondition: 'no',
      sellerVatStatus: 'not_vendor',
      vatTreatment: 'transfer_duty',
    },
  })

  assert.equal(facts.schemaVersion, SOUTH_AFRICAN_LEGAL_DEAL_FACTS_VERSION)
  assert.equal(facts.instrument.familyKey, 'residential_resale')
  assert.equal(facts.parties.seller.entityType, 'company')
  assert.equal(facts.parties.buyer.entityType, 'trust')
  assert.equal(facts.property.titleType, 'sectional_title')
  assert.equal(facts.finance.purchasePrice, 2500000)
  assert.equal(facts.finance.depositHolder, 'transfer_attorney')
  assert.equal(validateSouthAfricanLegalDealFacts(facts).complete, true)
})

test('surfaces review prompts instead of guessing unresolved SA legal facts', () => {
  const facts = buildSouthAfricanLegalDealFacts({
    draft: {
      legalInstrumentFamily: 'residential_resale',
      sellerEntityType: 'individual',
      sellerMaritalRegime: 'out_of_community',
      sellerForeignMarriage: 'yes',
      buyerEntityType: 'individual',
      buyerMaritalRegime: 'single',
      propertyTitleType: 'full_title',
      financeType: 'cash',
      propertyInEstateOrHoa: 'unknown',
      existingLease: 'unknown',
      saleOfExistingPropertyCondition: 'unknown',
      sellerVatStatus: 'unknown',
    },
  })

  assert.equal(validateSouthAfricanLegalDealFacts(facts).complete, true)
  assert.deepEqual(facts.reviewItems.map((item) => item.code), [
    'seller_marriage_country_missing',
    'hoa_status_unknown',
    'lease_status_unknown',
    'occupation_timing_unknown',
    'seller_vat_status_unknown',
    'vat_treatment_unknown',
    'linked_sale_unknown',
  ])
})

test('restores a persisted facts snapshot when no new intake values override it', () => {
  const facts = buildSouthAfricanLegalDealFacts({
    transaction: {
      legal_deal_facts_json: {
        instrument: { familyKey: 'residential_resale' },
        parties: {
          seller: { entityType: 'company' },
          buyer: { entityType: 'trust' },
        },
        property: {
          titleType: 'sectional_title',
          inEstateOrHoa: 'yes',
          estateOrHoaName: 'Saved Estate',
          existingExclusiveUseAreas: 'no',
        },
        finance: { type: 'bond', depositHolder: 'transfer_attorney', bondApprovalDeadline: '2026-08-31' },
        conditions: { saleOfExistingProperty: 'no' },
        occupation: { beforeTransfer: 'no', existingLease: 'no' },
        tax: { sellerVatStatus: 'not_vendor', vatTreatment: 'transfer_duty' },
      },
    },
  })

  assert.equal(facts.parties.seller.entityType, 'company')
  assert.equal(facts.parties.buyer.entityType, 'trust')
  assert.equal(facts.property.estateOrHoaName, 'Saved Estate')
  assert.equal(facts.finance.bondApprovalDeadline, '2026-08-31')
  assert.deepEqual(facts.reviewItems, [])
})

test('surfaces missing dependent facts for the attorney review queue', () => {
  const facts = buildSouthAfricanLegalDealFacts({
    draft: {
      legalInstrumentFamily: 'residential_resale',
      sellerEntityType: 'company',
      buyerEntityType: 'trust',
      propertyTitleType: 'sectional_title',
      propertyInEstateOrHoa: 'yes',
      propertyExclusiveUseAreas: 'unknown',
      financeType: 'bond',
      existingLease: 'yes',
      occupationBeforeTransfer: 'no',
      saleOfExistingPropertyCondition: 'yes',
      sellerVatStatus: 'vendor',
      vatTreatment: 'unknown',
    },
  })

  assert.deepEqual(facts.reviewItems.map((item) => item.code), [
    'hoa_name_missing',
    'exclusive_use_areas_unknown',
    'bond_approval_deadline_missing',
    'lease_expiry_missing',
    'vat_treatment_unknown',
    'linked_sale_deadline_missing',
  ])
})

test('produces merge fields from the same facts snapshot used for routing', () => {
  const facts = buildSouthAfricanLegalDealFacts({
    draft: {
      legalInstrumentFamily: 'residential_resale',
      sellerEntityType: 'trust',
      buyerEntityType: 'company',
      propertyTitleType: 'sectional_title',
      financeType: 'combination',
      occupationBeforeTransfer: 'yes',
      occupationalRent: '12500',
      existingLease: 'no',
      sellerVatStatus: 'vendor',
      vatTreatment: 'vat_inclusive',
    },
  })
  const placeholders = buildSouthAfricanLegalDealFactPlaceholders(facts)

  assert.equal(placeholders.legal_instrument_family, 'residential_resale')
  assert.equal(placeholders.seller_entity_type, 'trust')
  assert.equal(placeholders.buyer_entity_type, 'company')
  assert.equal(placeholders.occupation_before_transfer, 'yes')
  assert.equal(placeholders.occupational_rent, 12500)
  assert.equal(placeholders.vat_treatment, 'vat_inclusive')
})

test('does not mark incomplete core routing facts as ready', () => {
  const facts = buildSouthAfricanLegalDealFacts({
    draft: { legalInstrumentFamily: 'residential_resale', sellerEntityType: 'company' },
  })
  const validation = validateSouthAfricanLegalDealFacts(facts)

  assert.equal(validation.complete, false)
  assert.deepEqual(validation.blockers.map((item) => item.key), [
    'buyer_entity_type',
    'property_title_type',
    'finance_type',
  ])
})
